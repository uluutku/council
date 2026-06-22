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
- Basic AI contacts: a first vertical slice is complete — one built-in AI contact (Council
  Assistant), private AI conversations with persistent text history, a server-owned OpenRouter
  integration with a configurable DeepSeek model, SSE streaming responses, a seven-day credit
  trial with atomic server-side reservation and refund, an idempotent and retryable generation
  path through the `ai-chat` Edge Function, a deterministic local mock provider for tests, and
  database, edge-integration, component, and end-to-end coverage. Custom personas, memory, tools,
  web search, image/file understanding, AI inside human conversations, and billing checkout remain
  pending.
- Billing and entitlements (Pro checkout) is not started; the credit model exists but `pro_enabled`
  is only settable by the trusted backend hook. Every later milestone remains pending.
