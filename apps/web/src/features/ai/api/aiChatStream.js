import { aiSendInputSchema, aiStreamEventSchema } from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { readBrowserEnvironment } from '../../../lib/env.js';
import { AiApiError, toAiApiError } from './aiErrors.js';

// Stateful parser for the small SSE protocol. Each pushed chunk yields the
// validated events it completed; malformed lines and events that fail the
// contract are dropped rather than trusted. Exported for unit testing.
export function createAiStreamParser() {
  let buffer = '';
  return {
    push(text) {
      buffer += text;
      const events = [];
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const result = aiStreamEventSchema.safeParse(json);
        if (result.success) events.push(result.data);
      }
      return events;
    },
  };
}

// Calls the ai-chat Edge Function and invokes onEvent for each validated stream
// event. Resolves when the stream ends. Non-stream error responses and missing
// sessions are raised as AiApiError so the caller can show a safe category.
export async function streamAiChat({
  conversationId,
  clientMessageId,
  content,
  attachmentIds = [],
  documentAttachmentIds = [],
  contextImport = null,
  signal,
  onEvent,
}) {
  const input = aiSendInputSchema.parse({
    conversation_id: conversationId,
    client_message_id: clientMessageId,
    content,
    attachment_ids: attachmentIds,
    document_attachment_ids: documentAttachmentIds,
    context_import: contextImport,
  });

  const client = getSupabaseClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.access_token) throw new AiApiError('authentication_required');

  const { supabaseUrl } = readBrowserEnvironment();

  let response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: input.conversation_id,
        client_message_id: input.client_message_id,
        content: input.content,
        attachment_ids: input.attachment_ids,
        document_attachment_ids: input.document_attachment_ids,
        context_import: input.context_import,
      }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new AiApiError('cancelled', error);
    throw new AiApiError('backend_unavailable', error);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('text/event-stream')) {
    let category = 'backend_unavailable';
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') category = body.error;
    } catch {
      /* keep default */
    }
    if (response.status === 401) category = 'authentication_required';
    throw toAiApiError({ category });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createAiStreamParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        onEvent(event);
      }
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new AiApiError('cancelled', error);
    throw new AiApiError('backend_unavailable', error);
  }
}
