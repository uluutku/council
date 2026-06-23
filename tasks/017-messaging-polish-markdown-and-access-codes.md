# Task 017: Messaging polish, Markdown, and access codes

Status: implemented.

## Scope

- Render only AI assistant output as safe GFM Markdown, including streamed output and artifact
  proposals.
- Add member-only ephemeral typing, privacy-filtered presence, owner-specific mute, foreground
  browser notifications, inbox filters, and bounded conversation/message search.
- Add owner-generated, hash-only, single-use Premium codes with configurable duration and credits,
  immutable grants, generic rate-limited redemption, access UI, and Premium-first AI credit use.

## Security decisions

- No raw HTML, remote Markdown image loading, unsafe URL protocols, service-worker push, payments,
  unlimited AI access, or browser access to code hashes and server credentials.
- Durable Realtime topics remain database-originated; browser broadcasts are policy-limited to
  `conversation:{conversation_id}:ephemeral`.
- AI runs persist the reserved credit source so failure and stale recovery refund exactly once.

## Validation

Targeted pgTAP, unit/component, Edge Function, concurrency, schema-lint, and Playwright coverage is
included with the implementation.
