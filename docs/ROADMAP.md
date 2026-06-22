# Roadmap

The milestone order is locked:

1. Foundation
2. Accounts and contacts
3. Reliable direct chat
4. Images, files and search
5. Billing and entitlements
6. Basic AI contacts
7. Personas and memory
8. Vision and file understanding
9. Experts and tools
10. Artifacts and forwarding
11. Production hardening

Each milestone must satisfy its security and reliability completion gate before work depending on
that behavior is considered complete.

Status:

- Foundation repository base: complete.
- Accounts and contacts: database schema, web authentication, username onboarding, profile
  settings, preference settings, security settings, social functions, grants, RLS, shared
  contracts, and tests complete. User discovery UI, contact requests UI, contact management UI,
  and blocking UI are complete.
- Reliable direct chat: direct-conversation, canonical-pair, membership, text-message, reply,
  edit/tombstone, reaction, receipt-state, authorization, pagination, shared-contract, and browser
  API-wrapper foundations are complete. Durable private Realtime events, private topic
  authorization, reconciliation/gap contracts, and multi-session messaging concurrency tests are
  complete. The human text-messaging frontend is complete: the inbox and conversation UI, direct
  conversation creation from contacts, message history with bounded pagination, optimistic and
  idempotent sending with retry, replies, editing, deletion, reactions, honest delivery/read
  display, unread counts, realtime inbox and conversation synchronization, gap-triggered and
  reconnect reconciliation, and the responsive desktop/mobile-web layout. Typing indicators,
  presence, and push notifications remain pending.
- Images, files and search: basic private image and file attachments are complete — a private
  Storage bucket, the staged authorized upload/finalize flow, attachment-aware sending with
  idempotency, member-only signed-URL access, message rendering with an accessible image viewer,
  deletion that revokes attachment access, and database, component, and end-to-end tests. Message
  search, richer galleries, and AI understanding of files remain pending.
- Basic AI contacts: complete and now expanded into a small AI-contact system — four built-in
  contacts (Council Assistant, Writing Editor, Study Coach, Coding Partner) and private user-created
  custom personas (create/edit/archive/restore, owner-only, max 10 active). Each contact has its own
  persistent conversation; prompts are assembled server-side from a fixed platform-safety preamble
  that custom instructions cannot override. Built on private AI conversations with persistent text
  history, a server-owned OpenRouter integration with a configurable DeepSeek model
  (`deepseek/deepseek-v4-flash`), SSE streaming, a shared seven-day credit trial with atomic
  reservation and refund, idempotent/retryable generation through the `ai-chat` Edge Function, a
  deterministic local mock provider, and database, edge-integration, component, and end-to-end
  coverage. Transparent curated memory is complete: per-contact save/edit/delete/clear,
  Remember-from-message confirmation, curated/conversation-only modes, server-side inclusion,
  provider-state disclosure, and cross-user/contact isolation.
- Private AI image understanding is complete for directly attached JPEG, PNG, and WebP images:
  private staged uploads, two-stage vision-to-DeepSeek generation, persisted thumbnails, user-scoped
  analysis caching, and provider-sharing disclosure.
- Explicit human-message forwarding is complete for selected text only: local selection, exact
  review/removal, built-in or active-persona destination, owner-only immutable provenance,
  idempotent generation through the existing AI pipeline, and persistent context cards. Images and
  files remain excluded from forwarding.
- Private AI document understanding is complete for directly uploaded PDF, TXT, and Markdown files:
  private staged uploads, server-side text extraction or configured PDF parsing, user-scoped
  analysis caching, persistent document cards, provider disclosure, and idempotent generation.
  Scanned-PDF OCR, Office/HTML analysis, human-chat attachment forwarding, semantic search, and
  document knowledge bases remain pending.
- Automatic memory extraction, embeddings, contradiction resolution, tools, web search,
  AI inside human conversations, and public/shared personas remain pending.
- Billing and entitlements (Pro checkout) is not started; the credit model exists but `pro_enabled`
  is only settable by the trusted backend hook. Every later milestone remains pending.
