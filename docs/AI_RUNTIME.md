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

Missing `AI_PROVIDER_MODE` defaults to `openrouter`; the default text model is
`deepseek/deepseek-v4-flash`. `AI_PROVIDER_MODE=mock` is explicit, deterministic, used by automated
tests, and refuses to run unless Supabase is local/loopback. `OPENROUTER_API_KEY` and the model id
are server-only and never placed in a `VITE_*` variable.

Local live startup uses `npm run dev:ai`, which reads `supabase/functions/.env` and fails before
serving when OpenRouter mode has no key. Content-free GET metadata reports only `provider_mode`,
`model`, and configuration status; the development UI renders `Live provider` or `Local mock`.

### Streaming protocol

The function returns a small SSE protocol: `start`, `delta`, `done`, `error`. The browser validates
every event against `aiStreamEventSchema`, renders partial text during streaming, replaces it with
the authoritative persisted message on `done`, and leaves a retryable state on `error`. Raw provider
errors are never forwarded — only a fixed set of safe categories. Only the most recent bounded
window (20 messages) plus the system prompt is sent to the provider; there is no summarization,
semantic memory, or inclusion of human conversations, files, or images.

## Task 010: more built-in contacts and private custom personas

Council now exposes four built-in contacts — Council Assistant, Writing Editor, Study Coach, and
Coding Partner — each a global `ai_agents` row with a private active prompt version. These are
prompt-based only and claim no tools, internet, repository, or execution access.

Users can also create private custom personas (`ai_personas`, owner-scoped): name, description,
instructions (≤4000 chars), `tone` (warm/balanced/direct/playful/formal), and `verbosity`
(concise/balanced/detailed). Limits: name 2–50, description ≤160, up to 10 active personas per user.
Personas are visible only to their owner (RLS), can be edited, archived (history stays readable, new
generation disabled), and restored. They are managed through narrow security-definer RPCs
(`list_my_custom_personas`, `create_custom_persona`, `update_custom_persona`,
`archive_custom_persona`, `restore_custom_persona`); direct table mutation is denied.

### Conversation model

`ai_conversations` references exactly one target: a built-in `agent_id` or a custom `persona_id`
(a CHECK enforces exactly one; partial-unique indexes keep one conversation per user/agent and per
user/persona). `get_or_create_ai_conversation(p_agent_id, p_persona_id)` and
`list_my_ai_conversations` return a unified shape (`kind`, `display_name`, `description`, `archived`,
…). Credits remain per user, shared across all contacts. Existing Council Assistant conversations
stay valid.

### Server-side prompt assembly

`load_ai_run_context` (service-role) assembles the system prompt in a fixed order: (1) Council's
private platform safety/integrity preamble (`private.ai_platform_instructions()`), (2) the built-in
prompt or the persona's instructions, (3) for personas, structured tone/verbosity guidance, then the
bounded recent history and the new user message. The platform preamble always comes first and
custom instructions cannot replace it; personas cannot be granted access to human conversations,
other users, files, credentials, hidden prompts, tools, or the internet. `start_ai_generation`
rejects generation for a disabled built-in or an archived persona. The browser only ever sends the
conversation id, client id, and message content — never raw system instructions.

The configured model (`OPENROUTER_TEXT_MODEL`, e.g. `deepseek/deepseek-v4-flash`) is passed through
to the provider; mock mode remains for automated tests.

## Task 011: curated memory context

`load_ai_run_context` now assembles platform rules, built-in/persona instructions, persona style,
active user-approved memory when mode is `curated`, then the bounded message window. Memories are
ordered deterministically, capped at 50 per conversation, and marked as untrusted context that
cannot override platform instructions. `conversation_only` leaves rows stored but excludes them
from generation. Deleted rows disappear from the next context load. Prompts and memory content are
never returned to the browser or logged.

## Task 012: private image understanding

Image prompts use two configured models. The Edge Function downloads up to two authorized private
JPEG/PNG/WebP objects (5 MB each, 8 MB combined), validates their signatures, and sends base64 bytes
to `OPENROUTER_VISION_MODEL`. Its bounded structured result is cached per user, image SHA-256,
vision model, and prompt version. That private result is added to the existing server prompt and
`OPENROUTER_TEXT_MODEL` streams the persona-consistent final answer. Signed Storage URLs never go
to OpenRouter, and raw vision output never goes to the browser.
