# Task 006: Secure Realtime Delivery Foundation

## Objective

Add private database-originated Realtime event delivery, strict browser contracts,
reconciliation helpers, and true multi-session concurrency coverage without creating chat UI,
typing, presence, media, notifications, billing, or AI.

## Migration

`20260622010000_add_secure_realtime_delivery.sql` uses the installed
`realtime.send(jsonb,text,text,boolean)` function for minimal custom payloads. It adds deterministic
conversation/inbox topic helpers, a versioned event helper, mutation triggers, exact-topic
authorization, read-only authenticated Realtime access, and no browser Broadcast write policy.

## Topic and event design

- `conversation:{conversation_id}` for durable member synchronization.
- `user:{user_id}:inbox` for per-user conversation-list invalidation.
- Version 1 envelopes contain a transport UUID, event name, timestamp, and only validated
  identifiers/sequences.
- Message content, reaction values, profiles, settings, and availability causes are absent.

## Authorization and mutation behavior

Conversation topics authorize persistent members, preserving historical access after remove or
block. Inbox topics authorize only the matching `auth.uid()`. Anchored topic parsing fails closed.
Anonymous SELECT and authenticated/anonymous INSERT/UPDATE on `realtime.messages` are denied.

Events share the authoritative transaction. Idempotent/no-op paths do not reach event-producing
triggers. Reactions trigger only on INSERT/DELETE, and receipts compare old/new state.
`block_user` inserts the block before deleting a relationship, so the block trigger emits while
the relationship trigger suppresses its duplicate.

## Browser and reconciliation contracts

Focused modules provide topic construction, private conversation/inbox subscriptions,
current-session Realtime authentication, strict event validation, normalized statuses, safe
errors, idempotent cleanup, sequence-gap assessment, and event-to-query impact mapping. They do
not mutate TanStack Query or expose UI.

Conversation consumers subscribe first, fetch authoritative bounded messages after confirmation,
then process events. Missing/out-of-order sequences, reconnects, errors, timeouts, browser resume,
network restoration, and Auth refresh require database reconciliation.

## Concurrency integration

`npm run test:concurrency` refuses remote endpoints and uses independently authenticated local
clients. It verifies reciprocal creation, actual private channel allow/deny behavior, 20
concurrent sends, identical retry races, conflicting payload races, committed event counts, and
out-of-order receipts. It runs in CI after database tests but remains outside fast `npm run check`.

## Results

- Database: 450 assertions across 14 pgTAP files.
- Shared schemas: 64 tests.
- Web unit/component: 154 tests.
- Existing Playwright: 7 scenarios.
- Multi-session concurrency/Realtime integration: pass.

## Deferred

Inbox/conversation pages, message composer and rendering, React query hooks, typing, presence,
notifications, media/Storage, full offline recovery, groups, AI, billing, and mobile clients.
