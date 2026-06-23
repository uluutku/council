import { getSupabaseClient } from '../../../lib/supabase.js';
import { readBrowserEnvironment } from '../../../lib/env.js';
import { createAiStreamParser } from '../../ai/api/aiChatStream.js';
import { AiApiError, toAiApiError } from '../../ai/api/aiErrors.js';

export async function streamArtifactRevision({
  artifactId,
  instruction,
  clientRequestId,
  signal,
  onEvent,
}) {
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
        operation: 'artifact_revision',
        artifact_id: artifactId,
        instruction,
        client_request_id: clientRequestId,
      }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new AiApiError('cancelled', error);
    throw new AiApiError('backend_unavailable', error);
  }
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    let category = 'backend_unavailable';
    try {
      category = (await response.json())?.error ?? category;
    } catch {
      // Keep the safe category.
    }
    throw toAiApiError({ category });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createAiStreamParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) onEvent(event);
  }
  for (const event of parser.finish(decoder.decode())) onEvent(event);
}
