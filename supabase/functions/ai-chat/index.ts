// ai-chat Edge Function: the only path that creates AI messages and runs.
//
// It authenticates the Supabase user, validates the request, reserves a trial
// credit through a service-role function, calls the configured provider, streams
// safe text deltas over SSE, persists the completed assistant message, and
// refunds the credit if the provider fails before completion. Server secrets
// (OpenRouter key, service-role key) never leave the function, and prompts,
// message content, responses, keys, and JWTs are never logged.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { type ChatMessage, ProviderError, type ProviderUsage, runProvider } from './provider.ts';
import { resolveProviderConfig } from './runtime-config.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
const OPENROUTER_TEXT_MODEL = Deno.env.get('OPENROUTER_TEXT_MODEL') ?? '';
const PROVIDER_MODE = Deno.env.get('AI_PROVIDER_MODE') ?? '';
const MAX_CONTENT_LENGTH = 8000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const providerConfig = resolveProviderConfig({
  providerMode: PROVIDER_MODE,
  model: OPENROUTER_TEXT_MODEL,
  apiKey: OPENROUTER_API_KEY,
  supabaseUrl: SUPABASE_URL,
}) as { mode: 'openrouter' | 'mock'; model: string; configured: boolean };

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function sseLine(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

const KNOWN_CATEGORIES = new Set([
  'ai_conversation_not_found',
  'ai_agent_unavailable',
  'ai_run_in_progress',
  'trial_expired',
  'credits_exhausted',
  'rate_limited',
  'invalid_request',
]);

function categoryFromRpcError(message: string | undefined): string {
  if (message && KNOWN_CATEGORIES.has(message)) return message;
  return 'backend_unavailable';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  // Lightweight health response so readiness checks (e.g. test harnesses) can
  // confirm the function is serving without authenticating.
  if (req.method === 'GET') {
    return jsonResponse(200, {
      status: providerConfig.configured ? 'ok' : 'configuration_error',
      provider_mode: providerConfig.mode,
      model: providerConfig.model,
    });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  // Authenticate the user from the bearer token.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
  if (!token) return jsonResponse(401, { error: 'authentication_required' });

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse(401, { error: 'authentication_required' });
  }
  const userId = userData.user.id;

  // Validate the request body.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse(400, { error: 'invalid_request' });
  }
  const conversationId = body.conversation_id;
  const clientMessageId = body.client_message_id;
  const content = typeof body.content === 'string' ? body.content : '';
  if (
    typeof conversationId !== 'string' ||
    !UUID_RE.test(conversationId) ||
    typeof clientMessageId !== 'string' ||
    !UUID_RE.test(clientMessageId) ||
    content.trim().length === 0 ||
    content.length > MAX_CONTENT_LENGTH
  ) {
    return jsonResponse(400, { error: 'invalid_request' });
  }

  // Resolve provider mode with the mock safety guard.
  if (!providerConfig.configured) {
    return jsonResponse(500, { error: 'provider_not_configured' });
  }
  const { mode, model } = providerConfig;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(sseLine(event));
      let runId: string | null = null;
      let creditReserved = true;

      try {
        // Reserve the generation (idempotent, atomic, credit-gated).
        const { data: started, error: startError } = await serviceClient
          .rpc('start_ai_generation', {
            p_user_id: userId,
            p_conversation_id: conversationId,
            p_client_message_id: clientMessageId,
            p_user_content: content,
            p_model: model,
          })
          .single();

        if (startError || !started) {
          send({ type: 'error', category: categoryFromRpcError(startError?.message) });
          controller.close();
          return;
        }

        runId = started.run_id as string;

        // Idempotent replay of an already-finished generation: stream the stored
        // answer without calling the provider again.
        if (started.is_replay && started.status === 'completed' && started.assistant_message_id) {
          const { data: existing } = await serviceClient
            .rpc('get_ai_assistant_message', { p_run_id: runId })
            .single();
          send({ type: 'start', run_id: runId });
          if (existing) {
            send({ type: 'delta', text: existing.content });
            send({
              type: 'done',
              message: {
                id: existing.id,
                role: 'assistant',
                content: existing.content,
                created_at: existing.created_at,
              },
              credits_remaining: started.credits_remaining,
            });
          } else {
            send({ type: 'error', category: 'backend_unavailable' });
          }
          controller.close();
          return;
        }

        if (started.is_replay && started.status === 'running') {
          // A concurrent duplicate is already producing this answer.
          send({ type: 'error', category: 'ai_run_in_progress' });
          controller.close();
          return;
        }

        // Load the private system prompt + bounded recent window (server-only).
        const { data: context, error: contextError } = await serviceClient
          .rpc('load_ai_run_context', { p_run_id: runId, p_max_messages: 20 })
          .single();
        if (contextError || !context) {
          await serviceClient.rpc('fail_ai_generation', {
            p_run_id: runId,
            p_error_category: 'backend_unavailable',
            p_status: 'failed',
          });
          send({ type: 'error', category: 'backend_unavailable' });
          controller.close();
          return;
        }

        send({ type: 'start', run_id: runId });

        const usage: ProviderUsage = {
          inputTokens: null,
          outputTokens: null,
          cost: null,
          providerRequestId: null,
        };
        let assembled = '';
        try {
          const generator = runProvider(
            {
              mode,
              model,
              apiKey: OPENROUTER_API_KEY,
              systemPrompt: (context.system_prompt as string) ?? '',
              messages: (context.messages as ChatMessage[]) ?? [],
              signal: req.signal,
            },
            usage,
          );
          for await (const delta of generator) {
            assembled += delta;
            send({ type: 'delta', text: delta });
          }
        } catch (providerError) {
          const category =
            providerError instanceof ProviderError
              ? providerError.category
              : 'provider_unavailable';
          const status = category === 'cancelled' ? 'cancelled' : 'failed';
          const { data: refund } = await serviceClient
            .rpc('fail_ai_generation', {
              p_run_id: runId,
              p_error_category: category,
              p_status: status,
            })
            .single();
          send({
            type: 'error',
            category: category === 'cancelled' ? 'cancelled' : category,
            credits_remaining: refund?.credits_remaining,
          });
          controller.close();
          return;
        }

        if (assembled.trim().length === 0) {
          const { data: refund } = await serviceClient
            .rpc('fail_ai_generation', {
              p_run_id: runId,
              p_error_category: 'provider_error',
              p_status: 'failed',
            })
            .single();
          send({
            type: 'error',
            category: 'provider_error',
            credits_remaining: refund?.credits_remaining,
          });
          controller.close();
          return;
        }

        const { data: completed, error: completeError } = await serviceClient
          .rpc('complete_ai_generation', {
            p_run_id: runId,
            p_assistant_content: assembled,
            p_input_tokens: usage.inputTokens,
            p_output_tokens: usage.outputTokens,
            p_provider_cost: usage.cost,
            p_provider_request_id: usage.providerRequestId,
          })
          .single();

        if (completeError || !completed) {
          send({ type: 'error', category: 'backend_unavailable' });
          controller.close();
          return;
        }

        // Safe operational log: identifiers and metrics only, never content.
        console.log(
          JSON.stringify({
            event: 'ai_run_completed',
            run_id: runId,
            model,
            mode,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            credits_remaining: completed.credits_remaining,
          }),
        );

        send({
          type: 'done',
          message: {
            id: completed.assistant_message_id,
            role: 'assistant',
            content: assembled,
            created_at: new Date().toISOString(),
          },
          credits_remaining: completed.credits_remaining,
        });
        controller.close();
      } catch (_error) {
        // Last-resort guard: never leak internals. Refund if a run was opened.
        if (runId && creditReserved) {
          await serviceClient
            .rpc('fail_ai_generation', {
              p_run_id: runId,
              p_error_category: 'backend_unavailable',
              p_status: 'failed',
            })
            .single()
            .catch(() => {});
        }
        try {
          send({ type: 'error', category: 'backend_unavailable' });
        } catch (_ignored) {
          /* stream already closed */
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
