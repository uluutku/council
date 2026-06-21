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
  complete. Inbox UI, conversation UI, composer behavior, optimistic rendering, typing, presence,
  full offline recovery, attachments, and notifications remain pending, so this milestone is not
  complete.
- Every later milestone remains pending.
