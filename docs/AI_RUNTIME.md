# AI runtime

Council will use OpenRouter as its provider gateway. DeepSeek is the primary language model, with
a server-configured fallback. A separate vision-capable OpenRouter model may analyze images that a
user explicitly shares with an AI contact; DeepSeek then receives structured visual context for
the final persona-consistent response.

All provider credentials are application-owned and server-only. The browser must never receive
OpenRouter credentials or Supabase service-role credentials. Users cannot provide arbitrary
provider keys or select arbitrary models in the first release.

Every AI request will require:

- authenticated server-side entitlement checks for trial or Pro access;
- estimated credit reservation and actual-cost reconciliation;
- an idempotency key covering retries;
- validated input and bounded output;
- provider, model, token, latency, and estimated-cost metadata without private content in logs;
- clear handling for cancellation, timeout, partial output, and failed reconciliation.

The AI runtime will support limited validated tool rounds and explicit image routing. No AI calls,
model configuration, entitlements, cost accounting, or provider integration are implemented in
Task 001.

## Task 009: first AI contact (text-only)

The first working slice is implemented. It is intentionally narrow: one built-in agent (Council
Assistant), text only, no personas, memory, tools, web search, image/file understanding, AI inside
human conversations, or billing checkout.

### Data model

Public agent identity (`ai_agents`) is separated from the private prompt configuration
(`ai_agent_prompt_versions`); no browser role can read the prompt table. Conversations
(`ai_conversations`, one per user/agent), messages (`ai_messages`, roles `user`/`assistant`), runs
(`ai_runs`), and per-user credit state (`ai_credit_accounts`) each have RLS. Authenticated users may
read only their own conversations, messages, and credit state through bounded read RPCs
(`list_ai_agents`, `get_or_create_ai_conversation`, `list_my_ai_conversations`, `list_ai_messages`,
`get_my_ai_access`). Direct inserts/updates/deletes are denied; assistant messages cannot be forged.

### Credit policy (centralized constants)

Trial constants live in `private.ai_trial_credit_allowance()` (20) and `private.ai_trial_duration()`
(7 days). The trial starts on the first generation and expires seven days later. One completed or
accepted generation reserves one credit; a provider failure refunds the reserved credit exactly
once (a `credit_reserved` flag plus the run status transition prevent double refunds and balance
inflation). `pro_enabled` is false by default; only the service-role `admin_set_ai_credits` hook
(future billing) changes balances or Pro status.

### Generation path

Message and run creation happen only in the `ai-chat` Edge Function via service-role-only functions
(`start_ai_generation`, `complete_ai_generation`, `fail_ai_generation`). `start_ai_generation` is
atomic and idempotent on `client_message_id`: a running/completed run replays without a second
credit; a previously failed run retries reusing the same user message. One active run per
conversation and a coarse per-user rate limit are enforced in the database.

### Provider modes

`AI_PROVIDER_MODE=openrouter` calls OpenRouter (default model `deepseek/deepseek-chat`, configurable
via `OPENROUTER_TEXT_MODEL`). `AI_PROVIDER_MODE=mock` produces deterministic local output for
automated tests and refuses to run unless Supabase is local/loopback. `OPENROUTER_API_KEY` and the
model id are server-only and never placed in a `VITE_*` variable. See
`supabase/functions/.env.example`.

### Streaming protocol

The function returns a small SSE protocol: `start`, `delta`, `done`, `error`. The browser validates
every event against `aiStreamEventSchema`, renders partial text during streaming, replaces it with
the authoritative persisted message on `done`, and leaves a retryable state on `error`. Raw provider
errors are never forwarded — only a fixed set of safe categories. Only the most recent bounded
window (20 messages) plus the system prompt is sent to the provider; there is no summarization,
semantic memory, or inclusion of human conversations, files, or images.
