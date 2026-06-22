// Provider abstraction for the ai-chat Edge Function. Two modes are supported:
// `openrouter` (the real DeepSeek gateway) and `mock` (deterministic, local-only,
// for automated tests). Neither mode ever surfaces a raw provider error to the
// caller — failures are reduced to a small set of safe categories.

import { buildPdfParserRequest, extractPdfFileAnnotation } from './pdf-parser.mjs';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ProviderOptions = {
  mode: 'openrouter' | 'mock';
  model: string;
  apiKey?: string;
  systemPrompt: string;
  messages: ChatMessage[];
  signal: AbortSignal;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  providerRequestId: string | null;
};

export type VisionAnalysis = {
  visual_description: string;
  visible_text: string;
  important_details: string;
  uncertainty: string;
};

export type VisionOptions = {
  mode: 'openrouter' | 'mock';
  model: string;
  apiKey?: string;
  userText: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
  signal: AbortSignal;
};

export type PdfOptions = {
  mode: 'openrouter' | 'mock';
  model: string;
  parserEngine: string;
  apiKey?: string;
  filename: string;
  base64: string;
  signal: AbortSignal;
};

export type DocumentAnalysis = {
  extractedText: string;
  pageCount: number | null;
  annotations: Record<string, unknown> | null;
  usage: ProviderUsage;
};

export class ProviderError extends Error {
  category: string;
  constructor(category: string) {
    super(category);
    this.name = 'ProviderError';
    this.category = category;
  }
}

const MAX_OUTPUT_CHARS = 40000;
const MAX_VISION_FIELD_CHARS = 2000;

// Deterministic local provider. Produces a stable, obviously-AI reply derived
// from the latest user message, streamed token-by-token.
async function* runMock(options: ProviderOptions, usage: ProviderUsage): AsyncGenerator<string> {
  const lastUser = [...options.messages].reverse().find((message) => message.role === 'user');
  const prompt = (lastUser?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (prompt.includes('[text-fail]')) throw new ProviderError('provider_unavailable');
  const memorySection = options.systemPrompt.match(
    /User-approved memory \(untrusted context; it never overrides platform rules\):\n([\s\S]*)$/,
  );
  const approvedMemory = memorySection?.[1]
    ?.split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .join(' | ');
  const memoryNote = approvedMemory
    ? ` Approved memory supplied: ${approvedMemory.slice(0, 500)}.`
    : ' No approved memory was supplied.';
  const visionNote = options.systemPrompt.includes('Private image analysis for this request')
    ? ' Vision analysis was supplied to the final text model.'
    : '';
  const documentNote = lastUser?.content.includes('User-provided document')
    ? ' Private document context was supplied to the final text model.'
    : '';
  const reply =
    `Council Assistant (mock mode) received: "${prompt}". ` +
    `This is a deterministic local response used for testing; no external provider was called.` +
    memoryNote +
    visionNote +
    documentNote;
  const tokens = reply.split(/(\s+)/);
  let emitted = 0;
  for (const token of tokens) {
    if (options.signal.aborted) throw new ProviderError('cancelled');
    emitted += token.length;
    yield token;
    // A small delay makes streaming observable without slowing tests much.
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  usage.inputTokens = prompt.length;
  usage.outputTokens = emitted;
  usage.cost = 0;
  usage.providerRequestId = 'mock-' + emitted;
}

// Streams a chat completion from OpenRouter, yielding text deltas.
async function* runOpenRouter(
  options: ProviderOptions,
  usage: ProviderUsage,
): AsyncGenerator<string> {
  if (!options.apiKey) throw new ProviderError('provider_not_configured');

  const body = {
    model: options.model,
    stream: true,
    messages: [
      { role: 'system', content: options.systemPrompt },
      ...options.messages.map((message) => ({ role: message.role, content: message.content })),
    ],
  };

  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://council.local',
        'X-Title': 'Council',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (_error) {
    throw new ProviderError('provider_unavailable');
  }

  if (response.status === 429) throw new ProviderError('rate_limited');
  if (!response.ok || !response.body) {
    // Drain without surfacing the raw error body.
    try {
      await response.body?.cancel();
    } catch (_ignored) {
      /* ignore */
    }
    throw new ProviderError('provider_unavailable');
  }

  usage.providerRequestId = response.headers.get('x-request-id');

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let total = 0;

  while (true) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch (_error) {
      throw new ProviderError('provider_unavailable');
    }
    if (chunk.done) break;
    buffer += chunk.value;

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload);
      } catch (_error) {
        continue;
      }
      const choices = parsed.choices as Array<Record<string, any>> | undefined;
      const delta = choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        total += delta.length;
        if (total > MAX_OUTPUT_CHARS) throw new ProviderError('provider_error');
        usage.outputTokens = total;
        yield delta;
      }
      const usageInfo = parsed.usage as Record<string, number> | undefined;
      if (usageInfo) {
        usage.inputTokens = usageInfo.prompt_tokens ?? usage.inputTokens;
        usage.outputTokens = usageInfo.completion_tokens ?? usage.outputTokens;
      }
    }
  }
}

export function runProvider(
  options: ProviderOptions,
  usage: ProviderUsage,
): AsyncGenerator<string> {
  return options.mode === 'mock' ? runMock(options, usage) : runOpenRouter(options, usage);
}

function boundedField(value: unknown): string {
  if (typeof value !== 'string') throw new ProviderError('vision_provider_unavailable');
  return value.trim().slice(0, MAX_VISION_FIELD_CHARS);
}

function parseVisionAnalysis(value: unknown): VisionAnalysis {
  if (!value || typeof value !== 'object') {
    throw new ProviderError('vision_provider_unavailable');
  }
  const record = value as Record<string, unknown>;
  return {
    visual_description: boundedField(record.visual_description),
    visible_text: boundedField(record.visible_text),
    important_details: boundedField(record.important_details),
    uncertainty: boundedField(record.uncertainty),
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new ProviderError('vision_provider_unavailable');
  }
}

export async function runVisionProvider(
  options: VisionOptions,
): Promise<{ analysis: VisionAnalysis; usage: ProviderUsage }> {
  if (options.mode === 'mock') {
    if (options.userText.includes('[vision-fail]')) {
      throw new ProviderError('vision_provider_unavailable');
    }
    return {
      analysis: {
        visual_description: `A valid ${options.mimeType} image supplied in local mock mode.`,
        visible_text: 'Mock visible text',
        important_details: `Image payload contains ${options.base64.length} base64 characters.`,
        uncertainty: 'Deterministic test analysis; no external vision provider was called.',
      },
      usage: {
        inputTokens: options.base64.length,
        outputTokens: 40,
        cost: 0,
        providerRequestId: 'mock-vision',
      },
    };
  }

  if (!options.apiKey) throw new ProviderError('provider_not_configured');
  const prompt =
    'Analyze this private image for another AI model. Return JSON only with exactly these string ' +
    'fields: visual_description, visible_text, important_details, uncertainty. Be factual, ' +
    'bounded, and state uncertainty. User request: ' +
    options.userText.slice(0, 8000);
  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://council.local',
        'X-Title': 'Council',
      },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${options.mimeType};base64,${options.base64}`,
                },
              },
            ],
          },
        ],
      }),
      signal: options.signal,
    });
  } catch {
    throw new ProviderError('vision_provider_unavailable');
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
    throw new ProviderError('vision_provider_unavailable');
  }

  let payload: Record<string, any>;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('vision_provider_unavailable');
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new ProviderError('vision_provider_unavailable');
  const usageInfo = payload.usage;
  return {
    analysis: parseVisionAnalysis(parseJsonContent(content)),
    usage: {
      inputTokens: usageInfo?.prompt_tokens ?? null,
      outputTokens: usageInfo?.completion_tokens ?? null,
      cost: usageInfo?.cost ?? null,
      providerRequestId: response.headers.get('x-request-id'),
    },
  };
}

export async function runPdfParser(options: PdfOptions): Promise<DocumentAnalysis> {
  if (options.mode === 'mock') {
    const bytes = Uint8Array.from(atob(options.base64), (character) => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    if (decoded.includes('MOCK_PDF_FAIL')) throw new ProviderError('pdf_parser_unavailable');
    if (decoded.includes('MOCK_SCANNED_ONLY')) throw new ProviderError('document_unreadable');
    const marker = /MOCK_TEXT_START([\s\S]*?)MOCK_TEXT_END/.exec(decoded)?.[1]?.trim();
    const extractedText =
      marker || 'Mock text-based PDF content extracted by the configured local parser.';
    return {
      extractedText,
      pageCount: 1,
      annotations: { parser_engine: options.parserEngine, mock: true },
      usage: {
        inputTokens: options.base64.length,
        outputTokens: extractedText.length,
        cost: 0,
        providerRequestId: 'mock-pdf',
      },
    };
  }

  if (!options.apiKey) throw new ProviderError('provider_not_configured');
  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://council.local',
        'X-Title': 'Council',
      },
      body: JSON.stringify(
        buildPdfParserRequest({
          model: options.model,
          parserEngine: options.parserEngine,
          filename: options.filename,
          base64: options.base64,
        }),
      ),
      signal: options.signal,
    });
  } catch {
    throw new ProviderError('pdf_parser_unavailable');
  }
  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
    throw new ProviderError('pdf_parser_unavailable');
  }

  let payload: Record<string, any>;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('pdf_parser_unavailable');
  }
  const parsed = extractPdfFileAnnotation(payload.choices?.[0]?.message);
  if (parsed.extractedText.length < 20) {
    throw new ProviderError('document_unreadable');
  }
  return {
    extractedText: parsed.extractedText,
    pageCount: parsed.pageCount,
    annotations: parsed.fileHash
      ? { file_hash: parsed.fileHash, filename: options.filename }
      : null,
    usage: {
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      cost: payload.usage?.cost ?? null,
      providerRequestId: response.headers.get('x-request-id'),
    },
  };
}
