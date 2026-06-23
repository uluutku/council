# Task 010: AI Contacts and Private Custom Personas

## Objective

Expand Council from one AI assistant into a small AI-contact system: four built-in contacts plus
private user-created personas, each with its own persistent conversation, server-side prompt
assembly, and the existing shared trial-credit system. Text only. No memory, tools, web search,
image/file understanding, billing, AI access to human chats, or public/shared personas.

## Initial verification (Task 009 baseline)

Task 009 commit `21e38ce` was confirmed with a clean tree; `npm run check` passed before any change.

## Built-in contacts added

Writing Editor, Study Coach, and Coding Partner join Council Assistant. Each is a global
`ai_agents` row with a private active `ai_agent_prompt_versions` prompt. They are prompt-based only and claim no
tools, internet, repository, or execution access. Built-in prompts remain unreadable by the browser.

## Custom persona model and privacy

New `ai_personas` table (owner-scoped): `name` (2–50), `description` (≤160), `instructions` (≤4000),
`tone` (warm/balanced/direct/playful/formal), `verbosity` (concise/balanced/detailed), `archived_at`.
Up to 10 active personas per user. RLS makes them visible only to the owner; another user cannot
discover, read, edit, open, or chat with them, and anonymous access is denied. Mutations go through
narrow security-definer RPCs (`list_my_custom_personas`, `create_custom_persona`,
`update_custom_persona`, `archive_custom_persona`, `restore_custom_persona`); direct table mutation
is denied. Archiving keeps history readable but disables new generation; restoring re-enables it
(subject to the active limit). `ai_conversations` now references exactly one built-in agent OR one
owned persona (CHECK + partial-unique indexes; unified `get_or_create_ai_conversation` and
`list_my_ai_conversations` shapes). Credits remain per user, shared across all contacts. Existing
Council Assistant conversations stay valid.

## Edge Function changes

The request still identifies only the conversation, client id, and content. Raw system
instructions never reach the browser. The conversation-identified design meant the function body
needed no change. The extended `load_ai_run_context` assembles the prompt server-side in order:
platform safety preamble,
then built-in prompt or persona instructions, then (for personas) tone/verbosity guidance, then
bounded history and the user message. The platform preamble always takes precedence over custom
instructions. `start_ai_generation` now rejects a disabled built-in or an archived persona and
re-checks ownership. Authentication, credit reservation/refund, one-active-run, idempotency, the
SSE protocol, provider-error sanitization, and content-free logs are unchanged. The configured model
(`deepseek/deepseek-v4-flash`) is passed through; mock mode is preserved for tests.

## Visible frontend behavior

`/app/ai` gains two tabs: Built-in (four contact cards) and My personas (create/edit/open/archive/
restore with a focused editor that shows a plain-language style summary and never the assembled
prompt). The conversation page shows the correct identity with a Built-in/Custom badge, persistent
per-contact history, streaming, shared trial credits, an archived/disabled state, and safe retry.
Switching contacts does not mix histories because message and chat state are keyed per
conversation id.

## Test results

- `npm run supabase:reset`: PASS
- `npm run db:test`: PASS, 530 assertions over 17 files (new `016_ai_personas.test.sql`, 25
  assertions)
- `npm run test:ai-edge`: PASS, 23 checks (adds shared credits across contacts, cross-user persona
  rejection, archived-persona rejection) in local mock mode
- `npm run check`: PASS (shared schemas + 242 web tests + production build)
- `npm run test:e2e`: PASS, 22 scenarios (3 AI: built-in separation, exhaustion, persona lifecycle
  - cross-user inaccessibility)
- Supabase schema lint: PASS
- Concurrency suite not re-run: shared human-messaging behavior was unchanged.

## Real-provider result

The runtime is configured for `deepseek/deepseek-v4-flash` via `supabase/functions/.env`
(`AI_PROVIDER_MODE=openrouter`). The rotated OpenRouter key is supplied locally and kept only in that
gitignored file; it is never committed, logged, or printed. Automated validation used the
deterministic mock provider; the real-provider manual run is performed locally with the rotated key.

## Known limitations

- One conversation per user/persona and per user/agent; text only.
- Editing a persona affects future replies only (prior turns are unchanged history).
- Stop aborts the client request and the server cancels/refunds; partial streamed text is discarded.
- Billing and checkout are outside this task; exhausted or expired trials display a clear status.
