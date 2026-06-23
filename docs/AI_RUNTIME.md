# AI runtime

Council uses OpenRouter as its provider gateway. DeepSeek is the primary language model. A
separate vision-capable OpenRouter model analyzes images that a
user explicitly shares with an AI contact; DeepSeek then receives structured visual context for
the final persona-consistent response.

All provider credentials are application-owned and server-only. The browser must never receive
OpenRouter credentials or Supabase service-role credentials. Users cannot provide arbitrary
provider keys or select arbitrary models in the first release.

Every accepted AI generation requires:

- authenticated server-side entitlement checks for trial or Pro access;
- one product-credit reservation, with provider token and cost metadata recorded separately;
- an idempotency key covering retries;
- validated input and bounded output;
- provider, model, token, latency, and estimated-cost metadata without private content in logs;
- clear handling for cancellation, timeout, partial output, and failed reconciliation.

Tools are not implemented. Image and document routing are explicit and use the same generation
entitlement, idempotency, and finalization path.

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
serving when OpenRouter mode has no key. Unauthenticated GET returns only `{"status":"ok"}`.
Authenticated detailed metadata is available only in local development or when explicitly enabled;
the development UI uses it to render `Live provider` or `Local mock`.

### Streaming protocol

The function returns a small SSE protocol: `start`, `delta`, `done`, `error`. The browser validates
every event against `aiStreamEventSchema`, renders partial text during streaming, replaces it with
the authoritative persisted message on `done`, and leaves a retryable state on `error`. Raw provider
errors are never forwarded; only a fixed set of safe categories is used. Both browser and provider
parsers require exactly one terminal event and reject malformed or truncated EOF. Only the most recent bounded
window (20 messages) plus the system prompt is sent to the provider; there is no summarization,
semantic memory, or inclusion of human conversations, files, or images.

## Task 010: more built-in contacts and private custom personas

Council now exposes four built-in contacts: Council Assistant, Writing Editor, Study Coach, and
Coding Partner. Each is a global `ai_agents` row with a private active prompt version. These are
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
custom instructions are placed below it and treated as untrusted input. Model compliance is not a
security boundary, so access to conversations, files, credentials, tools, and external systems is
enforced outside the model. `start_ai_generation`
rejects generation for a disabled built-in or an archived persona. The browser only ever sends the
conversation id, client id, and message content. Raw system instructions never reach the browser.

The configured model (`OPENROUTER_TEXT_MODEL`, e.g. `deepseek/deepseek-v4-flash`) is passed through
to the provider; mock mode remains for automated tests.

## Task 011: curated memory context

`load_ai_run_context` now assembles platform rules, built-in/persona instructions, persona style,
active user-approved memory when mode is `curated`, then the bounded message window. Memories are
ordered deterministically, capped at 50 per conversation, and marked as untrusted context that
are placed below platform instructions as untrusted context. `conversation_only` leaves rows stored but excludes them
from generation. Deleted rows disappear from the next context load. Prompts and memory content are
never returned to the browser or logged.

## Task 012: private image understanding

Image prompts use two configured models. The Edge Function downloads up to two authorized private
JPEG/PNG/WebP objects (5 MB each, 8 MB combined), validates their signatures, and sends base64 bytes
to `OPENROUTER_VISION_MODEL`. Its bounded structured result is cached per user, image SHA-256,
vision model, and prompt version. Analysis is deliberately generic and question-independent, so a
later question may safely reuse it. That private result is added to the existing server prompt and
`OPENROUTER_TEXT_MODEL` streams the persona-consistent final answer. Signed Storage URLs never go
to OpenRouter, and raw vision output never goes to the browser.

## Task 013: confirmed human-message context

Forwarding reuses `ai-chat` and the normal credit reservation/refund path. The authenticated request
contains a destination AI conversation, source human conversation, up to 20 source message IDs, an
optional instruction of at most 2,000 characters, and one client request UUID. The service-role
`start_ai_generation` transaction verifies source membership and destination ownership, rejects
deleted or attachment-only rows, enforces 20,000 copied characters, reads text from PostgreSQL, and
stores one owner-only immutable snapshot in `ai_context_imports` and
`ai_context_import_items`. Text-plus-attachment messages copy only text and record that attachments
were excluded.

The context import is linked to the normal AI user message. Reusing the same request UUID and
payload replays without another import, run, message, or credit; changed selections conflict. Prompt
assembly remains platform, contact/persona, style, curated memory, bounded AI history, then
explicitly delimited untrusted copied context and the user instruction. Forwarded text is never
saved as memory automatically and is never logged. Existing human-chat attachments remain excluded
from forwarding.

## Task 014: private document understanding

Direct AI prompts may reference up to two finalized owner-scoped PDF, TXT, or Markdown attachments,
within per-file and 15 MB combined limits. `start_ai_generation` binds sorted document IDs into the
normal idempotency payload, attaches them to exactly one user message, and uses the existing
one-credit reservation/refund path. Exact retries reuse the message, run, attachments, parsing
cache, and credit; changed document selections conflict.

The Edge Function downloads private bytes through trusted Storage access and revalidates ownership,
conversation, MIME, extension, size, signature, and SHA-256. TXT and Markdown are decoded as bounded
UTF-8 plain text. PDFs are sent as base64 to the server-configured OpenRouter file parser using
`OPENROUTER_PDF_ENGINE` (`cloudflare-ai` by default); signed URLs are never sent to the provider.
Image-only PDFs fail with an OCR-not-enabled message.

Completed extraction is cached per user, document hash, MIME, parser engine, and parser version in a
browser-inaccessible table. Prompt order remains platform, contact/persona, style, curated memory,
bounded history, forwarded context, delimited untrusted document context, then the current question.
Document text and parser annotations are never returned in browser events, logged, or saved as
memory. Safe document metadata persists with the user message for reload and short-lived authorized
download access.

## Task 015: reliability hardening

AI history loads the newest bounded page, displays it chronologically, and pages backward with a
stable `(created_at, id)` cursor. Running operations have a ten-minute lease; expired runs are
recoverable at generation start and through a service-role maintenance RPC. Recovery and failure
refund a reservation at most once.

Completion is retry-idempotent. Repeating the same result returns the existing assistant message,
while conflicting content is rejected. The Edge Function retries transient completion failures
with bounded backoff, compensates persistent failure, and safely discovers a completion whose RPC
response was lost.

Text, vision, and PDF provider calls have configurable server deadlines. Client cancellation and
deadline aborts remain internally distinct, while public errors stay within safe categories.
OpenRouter attribution headers are optional server configuration and are omitted when unset.

## Task 016: persistent AI artifacts

An assistant message can create one owner-scoped artifact through `create_ai_artifact`. The
database reloads the authoritative assistant content, verifies conversation ownership and AI
identity, and binds the client request UUID to the source message, type, title, and optional edited
content. Exact retries return the existing artifact; conflicting retries fail.

Artifact content is Markdown-compatible plain text. Manual saves and restores append immutable,
monotonically numbered versions. Restoring never rewrites history. The current saved version alone
is used for local Markdown or text export.

AI revision is a focused `ai-chat` operation. The server verifies artifact ownership and the
original contact identity, rejects an archived custom persona, reserves one normal generation
credit, and assembles fixed platform/contact/style instructions, curated memory, the delimited
untrusted current artifact, and the user's revision instruction. The streamed proposal is stored
privately on the completed run but does not change the artifact. A separate idempotent save RPC
appends it as an AI-created version only after explicit user confirmation. Failure uses the normal
exactly-once refund path, and artifact content is not added to memory or operational logs.

## Task 017: safe Markdown and Premium credit sources

Persisted and streaming assistant messages render through the same safe GFM component. Raw HTML,
remote images, unsafe URL protocols, and generated heading IDs are not enabled. The stream contract
and terminal-event validation are unchanged.

`ai_credit_accounts` now has `pro_expires_at` and `pro_credits_remaining`. A generation atomically
reserves one active Premium credit first, otherwise one valid trial credit. `ai_runs.credit_source`
records the selected pool. Completion clears the reservation; provider failure, cancellation, and
expired-run recovery refund that same pool once. Expired Premium credits are never selected, and
there is no unlimited access mode.

Owner-issued codes are generated with a cryptographic random source by
`npm run premium:create-code`. Only the hash is inserted. Redemption stacks duration from
`greatest(now(), current pro_expires_at)`, adds bounded credits, and creates immutable grant
history. The browser can read only its safe access summary and own grants.
