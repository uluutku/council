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

Every public function derives the acting user from `auth.uid()`. Pair mutations use a shared
transaction-level advisory lock so request, response, removal, block, and unblock operations
cannot race into duplicate or contradictory pair state.

## Internal helpers

The `private` schema contains authentication, pair-locking, block/contact checks, profile
visibility, normalization, timestamp, and Auth-trigger helpers. Security-definer functions use
`set search_path = public, pg_temp`. Only the profile-visibility helper is executable by the
authenticated role because the profile RLS policy requires it; the schema is not exposed through
the API.

## Future schema

Conversations, messages, AI identities, memory, artifacts, billing, Storage policies, and
operations tables remain unimplemented.
