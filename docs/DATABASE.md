# Database

Supabase PostgreSQL migrations are the source of truth. Task 001 enabled `pgcrypto` and
`pg_trgm`; `vector` remains deferred until semantic memory retrieval.

## Migration rules

- Name migrations with a sortable UTC timestamp and a concise snake_case purpose.
- Never modify an already-applied migration. Correct or extend it with a new migration.
- Keep schema changes and security policies atomic where practical.
- Qualify non-public objects with their schema.
- Use lower-case snake_case for schemas, tables, columns, functions, indexes, and policies.
- Use UUID primary keys and `timestamptz` timestamps for Council product data.
- Add positive and negative pgTAP tests for every RLS rule.

## Account and social tables

### `profiles`

`profiles.id` is also a cascading foreign key to `auth.users.id`. Username is nullable during
onboarding, normalized to lowercase, unique, and restricted to 3–24 lowercase ASCII letters,
numbers, and underscores with an alphanumeric first character. Blank optional strings normalize
to `null`.

Display name, biography, and status text have database length limits. Avatar values must be
Storage-relative paths; URLs, absolute paths, control characters, and parent traversal are
rejected. Clients can update only the allowed profile columns on their own row.

### `user_settings`

Settings are private owner-only rows keyed by `auth.users.id`. Theme is currently `system`,
`light`, or `dark`. Notification, privacy, and AI preference columns must be top-level JSON
objects. The schema deliberately does not define the complete future settings model.

### `contact_relationships`

One row represents an unordered user pair. UUIDs are canonicalized as:

```text
user_low_id < user_high_id
```

The unique pair constraint prevents duplicate reverse relationships. `requested_by` must be a
participant. Status is `pending`, `accepted`, or `rejected`; pending rows have no
`responded_at`, while accepted and rejected rows require one.

Clients can select relationships only when they are a participant. All writes occur through
social functions. Rejected rows may be retried: a new request resets the existing canonical row
to pending. Removing an accepted contact deletes the row so later requests start cleanly.

### `user_blocks`

The primary key is `(blocker_id, blocked_id)`. Self-blocks are prohibited. Only the blocker can
select the row. Direct client writes are denied.

## Auth trigger

An `auth.users` after-insert trigger creates both the profile and settings rows. It does not trust
or parse optional user metadata, so absent, array-shaped, or scalar metadata cannot bypass
validation or prevent account-row creation. The migration also backfills rows for Auth users that
already exist.

Profiles, settings, and relationships have automatic `updated_at` triggers.

## RLS behavior

- Profiles: own row, or a pending/accepted participant profile when no block exists.
- Settings: owner select and owner update only.
- Relationships: participant select only.
- Blocks: blocker select only.

General stranger discovery is available only through the bounded `search_profiles` function.
Anonymous roles have no product-table privileges. Authenticated roles receive select privileges
and only the profile/settings update columns required by their RLS policies.

## Public social functions

- `set_my_profile`: updates allowed fields for `auth.uid()`.
- `search_profiles`: bounded minimal discovery with privacy and block filtering.
- `send_contact_request`: creates a canonical pending row, returns same-direction requests
  idempotently, automatically accepts reciprocal pending requests, and permits a rejected pair to
  be requested again.
- `respond_contact_request`: permits only the recipient to accept or reject a pending request.
- `remove_contact`: idempotently deletes an accepted relationship.
- `block_user`: idempotently inserts the caller block and transactionally deletes every pair
  relationship.
- `unblock_user`: idempotently removes only the caller block and restores nothing.
- `list_my_contacts`: deterministic accepted-contact listing with minimal profile fields.
- `list_my_contact_requests`: incoming/outgoing pending requests with an explicit direction.
- `update_my_settings`: merges supported theme, notification, and privacy fields for
  `auth.uid()` while preserving unrelated existing JSON keys.
- `list_my_blocked_users`: returns only the authenticated user's own blocked targets with minimal
  profile fields.

Every public function derives the acting user from `auth.uid()`. Pair mutations use a shared
transaction-level advisory lock so request, response, removal, block, and unblock operations
cannot race into duplicate or contradictory pair state.

`update_my_settings` accepts no user ID. Notification and privacy patches must be JSON objects
containing only currently supported boolean keys. Unsupported new keys and non-boolean values
are rejected. Existing unknown keys are retained so later settings additions are not erased by
an older client.

### `list_my_blocked_users`

Direct profile RLS intentionally hides a blocked pair from each other, so the blocked-users
settings screen cannot use a plain profile join. `list_my_blocked_users` is a narrowly scoped
security-definer function added in `20260621230000_add_list_my_blocked_users.sql` that returns
`id`, `username`, `display_name`, `avatar_path`, `status_text`, and `blocked_at` for each target
the caller has blocked.

It derives the acting user from `auth.uid()` and accepts no caller-supplied identity. It returns
only rows where `user_blocks.blocker_id = auth.uid()`, so a user blocked by someone else never
appears in that other user's list and the function never reveals block direction beyond the
caller's own rows. It exposes no email, biography, private settings, or Auth metadata. It uses
`set search_path = public, pg_temp`, has its default privileges revoked from `public`, `anon`, and
`authenticated`, and is then granted only to `authenticated`. The profile policies are not
weakened and no direct profile-table enumeration is granted. Positive and negative pgTAP tests
cover blocker visibility, blocked-user and unrelated-user denial, anonymous denial, field
exclusion, identity derivation, and removal after unblocking.

## Internal helpers

The `private` schema contains authentication, pair-locking, block/contact checks, profile
visibility, normalization, timestamp, and Auth-trigger helpers. Security-definer functions use
`set search_path = public, pg_temp`. Only the profile-visibility helper is executable by the
authenticated role because the profile RLS policy requires it; the schema is not exposed through
the API.

## Direct conversations and messaging

Migration `20260622000000_create_direct_conversations_and_messages.sql` adds the private human
direct-message foundation.

### Tables and invariants

- `conversations`: currently permits only `type = 'direct'`; tracks the serialized
  `last_sequence`, latest message identity/time, and activity ordering.
- `direct_conversation_pairs`: one unique canonical `(user_low_id, user_high_id)` pair per direct
  conversation. Both users reference Auth and `user_low_id < user_high_id`.
- `conversation_members`: exactly the two canonical users are inserted by conversation creation.
  A trigger prevents non-pair users and receipt values beyond the current conversation sequence.
- `messages`: immutable ID, conversation sequence, sender, client idempotency UUID, optional reply,
  active content or content-free tombstone, and a private original-payload hash.
- `message_reactions`: one bounded reaction value per message/user/value tuple.

Active message content is trimmed, nonblank, and at most 8,000 characters. Deleted rows require
null content and remain in sequence order. Replies must point to the same conversation. Existing
and new replies may reference tombstones so deletion does not break conversation structure.
Deleting a message removes its reactions transactionally.

### Concurrency and idempotency

Direct creation canonicalizes the pair and takes `private.lock_social_pair` before checking
relationship state or inserting. The unique pair constraint is the final duplicate defense.

Sending increments `conversations.last_sequence` in a row-locked update. `(conversation_id,
sequence)` is unique, and each sender/client-message UUID is unique across that sender. An
additional conversation/sender/client constraint documents the RPC contract. The original
normalized conversation/content/reply payload is represented by a SHA-256 hash; an identical retry
returns the original row, while changed payload data returns `idempotency_conflict`, including
after the original message has been tombstoned.

### Receipts

Each member stores nonnegative delivered/read sequences with read never ahead of delivered.
`mark_conversation_delivered` and `mark_conversation_read` reject values beyond current
`last_sequence` and use monotonic `greatest` updates. Read also advances delivered. Successful
sends automatically advance the sender through their new sequence.

### Listing and pagination

`list_my_conversations` returns at most 50 rows ordered by `(updated_at, id) desc`. Both cursor
components must be supplied together. It returns minimal peer profile fields, nullable when normal
profile visibility is unavailable, a content-safe latest preview, receipt/unread state, and a
generic `can_send` boolean. It never returns email, biography, settings, or block direction.

`list_conversation_messages` returns at most 100 rows, newest sequence first, with
`before_sequence` pagination. Reactions are returned as deterministic JSON arrays ordered by
reaction and user. Tombstones remain present with null content.

### Functions, errors, RLS, and grants

Public RPCs are `create_or_get_direct_conversation`, `list_my_conversations`,
`list_conversation_messages`, `send_message`, `edit_message`, `delete_message`,
`add_message_reaction`, `remove_message_reaction`, `mark_conversation_delivered`, and
`mark_conversation_read`.

All mutation functions derive the actor from `auth.uid()`, validate arguments, use
`search_path = public, pg_temp`, and are granted only to `authenticated`. Expected application
failures use SQLSTATE `P0001` with a fixed category message such as `conversation_unavailable`,
`messaging_unavailable`, `invalid_reply`, `idempotency_conflict`, or `invalid_sequence`.
Authentication/grant failures retain SQLSTATE `42501`. Block direction and raw internal detail are
not returned.

Every messaging table has RLS. Members may select only their conversations and associated rows.
Authenticated table privileges are select-only; no insert/update/delete policies or grants exist.
Anonymous roles have no table or RPC access. Only the current-user membership helper required by
RLS is executable by `authenticated`; arbitrary-identity authorization helpers remain private.

### Indexes

- membership lookup: `(user_id, conversation_id)` and user receipt state;
- activity pagination: `(updated_at desc, id desc)`;
- canonical pair uniqueness: `(user_low_id, user_high_id)`;
- message pagination: `(conversation_id, sequence desc)`;
- idempotency lookup: `(sender_user_id, client_message_id)`;
- reaction aggregation: `(message_id, emoji, user_id)`.

## Realtime Broadcast foundation

Migration `20260622010000_add_secure_realtime_delivery.sql` adds private database-originated event
delivery. It uses the installed `realtime.send(jsonb, text, text, boolean)` function because
Council needs a purpose-built minimal envelope rather than full-row change payloads.

Private topic helpers generate `conversation:{uuid}` and `user:{uuid}:inbox`. The receive-policy
helper accepts only exact lower-case UUID topic forms. Conversation topics authorize stored
members; inbox topics authorize only their owner.

Trigger points are messages, reactions, receipt updates, statement-level member insertion after a
fully initialized conversation, relationships, and blocks. Message creation also emits
`conversation.changed` to both inboxes. Latest-message edits/deletes emit inbox changes for
preview reconciliation. Duplicate sends, repeated create/get calls, duplicate reaction adds,
missing reaction removals, and no-op receipt updates produce no event.

The availability trigger design avoids duplicate block events structurally. `block_user` inserts
the block before deleting the relationship. The block trigger emits; the relationship-delete
trigger sees the block and suppresses its equivalent event. Remove-contact, acceptance, and
unblock transitions still emit from their natural trigger.

`realtime.messages` has one authenticated SELECT policy using the exact-topic helper.
Authenticated INSERT/UPDATE and anonymous SELECT privileges are revoked, and no client INSERT
policy exists. Production must also disable Realtime's dashboard-level “Allow public access”
setting; local and browser code always request private channels.

The version-1 payload permits only `id`, `version`, `event`, `occurred_at`, and applicable
conversation/entity/sequence fields. `realtime.send` adds an ID when absent, so Council supplies
and validates that transport UUID explicitly.

## Future schema

AI identities, memory, artifacts, billing, Storage policies, attachment records, Realtime
delivery infrastructure, and operations tables remain unimplemented.
