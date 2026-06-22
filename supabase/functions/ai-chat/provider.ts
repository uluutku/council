// Provider abstraction for the ai-chat Edge Function. Two modes are supported:
// `openrouter` (the real DeepSeek gateway) and `mock` (deterministic, local-only,
// for automated tests). Neither mode ever surfaces a raw provider error to the
// caller — failures are reduced to a small set of safe categories.

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

export class ProviderError extends Error {
  category: string;
  constructor(category: string) {
    super(category);
    this.name = 'ProviderError';
    this.category = category;
  }
}

const MAX_OUTPUT_CHARS = 40000;

// Deterministic local provider. Produces a stable, obviously-AI reply derived
// from the latest user message, streamed token-by-token.
async function* runMock(options: ProviderOptions, usage: ProviderUsage): AsyncGenerator<string> {
  const lastUser = [...options.messages].reverse().find((message) => message.role === 'user');
  const prompt = (lastUser?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const reply =
    `Council Assistant (mock mode) received: "${prompt}". ` +
    `This is a deterministic local response used for testing; no external provider was called.`;
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
