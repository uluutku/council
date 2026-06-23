# Task 009: First AI Contact Vertical Slice

## Objective

Add one built-in AI contact (Council Assistant) that users can genuinely chat with through
OpenRouter: an AI catalogue and private AI conversations, persistent text history, streamed DeepSeek
responses, server-owned credentials, a short server-enforced credit trial, an idempotent and
retryable generation path, and a deterministic local mock provider for tests. Text only. No custom
personas, memory, tools, web search, image/file understanding, AI inside human conversations, or
billing checkout.

## Initial verification (Task 008 baseline)

Task 008 commit `90eb1c9` was confirmed with a clean tree; `npm run check` passed before any change.

## Database and credit model

Migration `20260622030000_add_ai_contacts_and_credits.sql`:

- `ai_agents` (public-safe identity) and `ai_agent_prompt_versions` (private prompt; no browser
  access). `ai_conversations` (one per user/agent), `ai_messages` (roles `user`/`assistant`, bounded
  content, partial-unique user-message idempotency on `client_message_id`), `ai_runs` (status,
  model, tokens, cost, `credit_reserved`, `error_category`), and `ai_credit_accounts`.
- RLS on every table: users read only their own conversations/messages/credit state; the prompt and
  run tables are unreadable by browser roles; anonymous access is denied.
- Read RPCs (`list_ai_agents`, `get_or_create_ai_conversation`, `list_my_ai_conversations`,
  `list_ai_messages`, `get_my_ai_access`) derive identity from `auth.uid()` and return bounded,
  prompt-free, credential-free shapes.
- Trial constants are centralized (`private.ai_trial_credit_allowance()` = 20,
  `private.ai_trial_duration()` = 7 days). The trial starts once on the first generation; one
  generation reserves one credit; failures refund exactly once; `pro_enabled` defaults false and is
  changed only by the service-role `admin_set_ai_credits` hook (future billing / tests).
- Privileged generation functions (`start_ai_generation`, `complete_ai_generation`,
  `fail_ai_generation`) and context loaders (`load_ai_run_context`, `get_ai_assistant_message`) are
  granted to `service_role` only. `start_ai_generation` is atomic and idempotent on
  `client_message_id`, enforces one active run per conversation and a coarse per-user rate limit.

## Edge Function and streaming

`supabase/functions/ai-chat` authenticates the Supabase user, validates the request, reserves a
credit, loads the private prompt + a bounded recent window (20 messages), calls the provider, streams
safe SSE events (`start`/`delta`/`done`/`error`), persists the assistant message on completion, and
refunds the credit on provider failure. `AI_PROVIDER_MODE` selects `openrouter` (configurable
`OPENROUTER_TEXT_MODEL`, default `deepseek/deepseek-chat`) or `mock` (deterministic, local-only,
refuses remote). Secrets are server-only; prompts, content, responses, keys, JWTs, and provider
bodies are never logged; raw provider errors never reach the browser.

## Visible AI experience

`AI` is in the primary navigation. `/app/ai` is the catalogue (Council Assistant card, AI label,
access/credits, the required provider disclosure, Open action). `/app/ai/:conversationId` is the
conversation: persistent history, a multiline composer (disabled while streaming or when access is
unavailable), a streaming assistant bubble with a Stop control, retry after failure, remaining trial
credits and expiry, starter prompts, and clear exhausted or expired states without checkout. AI
and user content render as plain text. The layout mirrors the messenger so the two can merge later.

## Security / cost controls

Server-owned OpenRouter credentials; private prompt never sent to the browser; browser cannot
mutate messages/runs/credits; assistant messages cannot be forged; atomic credit reservation with
single refund and no balance inflation; idempotent retries that neither duplicate the user message
nor double-spend; one active run per conversation; coarse rate limit; content- and credential-free
logs; mock provider local-only guard; test helpers refuse non-loopback Supabase.

## Test results

- `npm run supabase:reset`: PASS
- `npm run db:test`: PASS, 505 assertions over 16 files (new `015_ai_contacts_and_credits.test.sql`,
  28 assertions)
- `npm run test:ai-edge`: PASS, 18 checks (auth, validation, ownership, streamed completion, credit
  decrement, idempotent replay, exhaustion, only-safe-error-categories) in local mock mode
- `npm run check`: PASS (shared schemas + 236 web tests + production build)
- `npm run test:e2e`: PASS, 21 scenarios (16 prior + 3 attachments + 2 new AI in mock mode)
- Supabase schema lint: PASS
- Concurrency suite not re-run: shared messaging RPCs were not changed.

## Real-provider manual setup

1. `npm run supabase:start`, then apply migrations with `npm run supabase:reset`.
2. `cp supabase/functions/.env.example supabase/functions/.env`, set `AI_PROVIDER_MODE=openrouter`,
   `OPENROUTER_API_KEY=...`, and `OPENROUTER_TEXT_MODEL=deepseek/deepseek-chat`.
3. Serve the function: `node scripts/supabase.mjs functions serve ai-chat --no-verify-jwt --env-file supabase/functions/.env`.
4. `npm run dev`, sign in, open AI, select Council Assistant, send prompts, and watch streaming,
   persistence across reload, and decreasing credits. Remove the key to see a safe
   provider-unavailable state.

For offline/automated use the gitignored `supabase/functions/.env` defaults to mock mode.

## Known limitations / deferred

- One conversation per user/agent; a single built-in agent; text only.
- Token/cost metadata is recorded when the provider supplies it; the mock reports synthetic values.
- Stop aborts the client request and the server cancels/refunds; an already-streamed partial is
  discarded (no partial save).
- Billing and checkout are outside this task; exhausted or expired trials display a clear status.
