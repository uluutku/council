# Task 005: Direct Conversations and Text Messaging Database

## Objective

Implement the PostgreSQL and shared-contract foundation for reliable direct human text messaging
without adding inbox/chat UI, Realtime, media, notifications, billing, or AI.

## Prior-task audit

Tasks 001–004 were reviewed against their migrations, tests, documentation, and acceptance
criteria. Task 004 was already committed at `945910a` and passed its documented clean reset, 201
pgTAP assertions, 42 shared-schema tests, 102 web tests, seven Playwright scenarios, production
build, and schema lint. Its `GuestRoute` safe-return fix was preserved.

Public-release commit `2faf868` had renamed away the Task 001-required `AGENTS.md`. The same
agent-specific guardrails were restored without removing `CONTRIBUTING.md` and committed
separately as `29a1df7`. No Task 004 functional correction was required.

## Database changes

Migration `20260622000000_create_direct_conversations_and_messages.sql` adds:

- `conversations`
- `direct_conversation_pairs`
- `conversation_members`
- `messages`
- `message_reactions`

It also adds pair/member/message invariant triggers, narrow private authorization helpers, RLS
policies, read-only authenticated table grants, and ten authenticated public RPCs.

## Implemented behavior

- One canonical direct conversation per accepted, unblocked user pair.
- Advisory pair locking and transactionally created pair/two-member state.
- Historical member access after contact removal or blocking.
- Generic unavailable write failures without block-direction disclosure.
- Conversation-row locking for monotonic message sequences.
- Sender/client UUID idempotency with original-payload conflict detection.
- Same-conversation replies, including structurally valid tombstone targets.
- Sender-only edits while messaging remains available.
- Sender-only content-clearing tombstones even after removal/blocking.
- Idempotent reactions and own-reaction removal after relationship changes.
- Monotonic bounded delivered/read state and sender auto-read.
- Stable bounded `(updated_at, id)` conversation cursors and sequence message pages.

## Shared contracts and browser boundary

`packages/schemas` contains strict conversation, message, tombstone, reaction, pagination,
receipt, input, response, and error-category schemas. Public contracts reject email, biography,
settings, unknown fields, malformed tombstones, and invalid sequences.

`apps/web/src/features/messaging/api` contains focused wrappers for all messaging RPCs plus safe
error mapping. Database `snake_case` is preserved intentionally at this boundary. Query-key
factories exist for later TanStack Query integration. No route, component, query hook, Realtime
subscription, or disabled messaging control was added.

## Decisions and deviations

- Message content is capped at 8,000 characters, matching the latest Task 005 handoff.
- Conversation pagination uses both timestamp and UUID. A timestamp-only cursor cannot produce
  stable pagination for tied activity times.
- A private `idempotency_payload_hash` column is stored so changed-payload retries remain
  detectable after deletion clears content. It is never returned by public functions.
- Both `(conversation_id, sender_user_id, client_message_id)` and the stricter
  `(sender_user_id, client_message_id)` uniqueness rules are enforced. This rejects moving one
  sender idempotency key to another conversation while allowing different users to reuse a UUID.
- Replies to tombstones are allowed because messages are never hard-deleted and reply structure
  should survive user deletion.
- Receipt RPCs reject values beyond current sequence rather than silently capping them, providing
  a stable `invalid_sequence` signal.

## Tests

Five new pgTAP files add 196 assertions. They cover schema/invariants, lifecycle and visibility,
message/idempotency behavior, reactions/receipts/pagination, and grants/direct-write denial.
The complete database suite contains 397 assertions across 13 files.

Shared schemas have 57 passing tests. Web unit/component tests have 133 passing tests, including
all messaging wrapper/error tests. Existing seven-scenario Playwright coverage remains unchanged
because no messaging UI exists.

## Deferred work

Inbox and conversation pages, message composer/rendering, TanStack Query hooks, optimistic UI,
Realtime/Broadcast, typing/presence, offline reconciliation, media/Storage, notifications,
conversation deletion/muting, groups, AI conversations, billing, and mobile clients remain
deferred.
