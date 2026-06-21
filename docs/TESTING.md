# Testing

## Layers

- Shared-schema tests verify environment-neutral Zod contracts.
- Vitest and React Testing Library cover web modules, components, routes, and security boundaries.
- Playwright covers critical browser flows against a real Vite development server.
- pgTAP tests run against local Supabase migrations.
- Future AI evaluations will measure behavior that deterministic tests cannot fully cover.

## Local commands

```bash
npm run test
npm run test:watch
npm run test:e2e
npm run db:test
npm run check
```

`npm run check` runs format verification, lint, unit/component tests, and a production build. It
does not depend on Supabase. Start local Supabase before `npm run db:test`.

## Database security tests

Every future RLS policy must include positive tests for permitted actors and negative tests for
non-members, other users, unauthenticated sessions, or blocked relationships as applicable.
Tests must also cover function execution grants and private media access paths when introduced.

The database suite now contains seven pgTAP files with 190 assertions. Task 002 contributes five
files and 174 assertions covering:

- Auth-triggered profile/settings creation and cascading deletion;
- profile normalization, constraints, immutable ownership fields, and own-row RLS;
- private settings validation and owner-only access;
- bounded profile discovery, privacy settings, block filtering, and minimal return fields;
- request, response, reciprocal acceptance, rejection retry, removal, blocking, and unblocking;
- participant visibility, anonymous denial, direct-mutation denial, and internal-helper grants.

Task 003 adds 14 assertions for `update_my_settings`: own-user updates, anonymous denial,
supported-key/type validation, and preservation of existing unknown JSON keys.

Task 004 adds an eighth pgTAP file with 11 assertions for `list_my_blocked_users`: a blocker sees
only their own blocked targets; a blocked user cannot discover their blocker through the function;
an unrelated user sees only their own blocks; the result excludes blocks created by someone else;
the returned shape exposes only minimal profile fields and never email, biography, or settings;
the acting identity is derived from `auth.uid()`; unblocking removes the row; and anonymous
callers are denied. The database suite now contains 201 assertions across eight files.

Task 005 adds five pgTAP files and 196 assertions for a total of 397 assertions across 13 files.
The messaging matrix covers:

- tables, foreign keys, RLS, constraints, canonical pairs, membership triggers, and required
  indexes;
- accepted/pending/rejected/blocked conversation creation, reciprocal idempotency, partial-write
  prevention, member visibility, and historical access after removal/blocking;
- message normalization, atomic monotonic sequencing, sender identity, retry idempotency,
  payload-conflict detection, same-conversation replies, edits, and tombstones;
- relationship removal, reacceptance, blocking, unblocking without reacceptance, and the
  distinction between historical read access and current write permission;
- reaction idempotency/scope/removal, tombstone cleanup, delivered/read monotonicity, unread
  counts, bounded conversation cursors, and sequence-based message pagination;
- anonymous denial, unrelated-user isolation, internal-helper grants, and denial of every direct
  messaging-table mutation.

Task 006 adds 53 pgTAP assertions for a total of 450 assertions across 14 files. They verify exact
topic helpers, trigger/function presence, private receive policy behavior, client Broadcast
denial, malformed/similar-prefix rejection, member/owner authorization, minimal event payloads,
transaction failure behavior, idempotent event suppression, edits/deletes, reaction no-ops,
coherent receipt advancement, generic availability payloads, and one logical block event per
topic.

Tests create deterministic `auth.users` rows inside transactions. They simulate real API
authorization with:

```sql
set local request.jwt.claim.sub = '<user uuid>';
set local role authenticated;
```

Anonymous cases clear the subject and use `set local role anon`. Fixture setup runs as the
database owner, but authorization assertions run under the actual API roles and exercise RLS and
grants. Every file rolls back its fixtures.

## AI evaluation

Future repeatable evaluations will measure persona consistency, memory precision and recall,
contradiction resolution, deleted-memory reuse, correct tool selection and result use,
fact-checking citation support, image-description accuracy, cost per useful interaction, and
failure rate.

## Authentication and browser tests

Vitest and React Testing Library cover session hydration, account loading, cache clearing,
guest/protected/onboarding guards, safe redirects, fixed error mapping, registration and login
states, generic password recovery, invalid reset state, onboarding conflicts, profile updates,
preference persistence, theme application, and logout.

Playwright starts the real web application against local Supabase and verifies:

- registration, trigger-created account rows, onboarding, and reload persistence;
- logout, protected-route rejection, and login with a safe return path;
- profile and preference persistence through reload;
- dark-theme application and contact-request privacy persistence;
- authoritative username conflicts;
- a real local recovery link, password update, and login with the new password.

The Node-only test helper reads credentials from local `supabase status`, rejects remote URLs,
creates only unique test users, and deletes those users after execution where practical.

## Contact UI tests

Vitest and React Testing Library cover the contacts feature: the API wrappers (correct RPC names
and argument shapes, response validation, invalid-response rejection, raw-error propagation, and
rejection of any email field in public contracts); the error-category mapping including the
collapsed generic message for block and privacy rejections; discovery (no query under two
characters, single debounced search, empty/loading/error/retry states, stale results not
replacing newer ones, request outcomes for sent/now-contacts/already-contacts, and the generic
unavailable message); contacts (rendering, empty state, remove and block confirmation, success,
and failure with the page preserved); requests (incoming/outgoing sections, accept, reject, block,
stale-request handling, and empty sections); blocked users (rendering, empty state, unblock
confirmation that explains the relationship is not restored, success, and failure); and navigation
(contact routes remain protected, an unonboarded user is redirected to onboarding, the incoming
request count renders, and settings navigation includes the blocked-users link). Tests mock the
contacts API module so real TanStack queries and mutations run against the mock.

Playwright covers multi-user contact flows against local Supabase. Each scenario provisions its
own onboarded users with unique deterministic data in separate browser contexts, so tests do not
depend on execution order, and removes the accounts afterward. The scenarios cover discovery,
requesting, and acceptance; removing a contact and confirming no block remains and that the users
can reconnect; blocking, which removes the relationship and hides both users from discovery in
both directions while giving the blocked user no hint and no blocker identity on their blocked
list; unblocking, which restores no relationship or pending request and re-enables discovery; and
the contact-request privacy preference hiding a stranger from discovery and restoring it when
re-enabled. The administrative helper refuses non-loopback Supabase URLs and is never imported
into browser code.

## Messaging contract tests

The shared-schema suite validates direct conversation results, nullable peer profile fields,
strict exclusion of email/private fields, active-message and tombstone invariants, reactions,
paired activity cursors, bounded message pages, receipt ordering, and stable error categories.

Web unit tests exercise all ten messaging API wrappers against realistic Supabase RPC-shaped
mocks. They assert RPC names and `p_` argument shapes, normalization, strict response validation,
deleted-content rejection, raw-error propagation for safe mapping, stable category mapping, and
the absence of message-content logging. No component or Playwright messaging test exists because
Task 005 intentionally adds no user-facing messaging surface.

Realtime unit tests cover every version-1 event schema, unsupported versions/names, sensitive
field rejection, deterministic topic construction, private channel configuration, current-session
Realtime authentication, status normalization, malformed payload handling, idempotent cleanup,
gap assessment, and event-to-query impact mapping.

`npm run test:concurrency` is a local-only integration harness. It refuses non-loopback API and
database URLs, uses three independently authenticated clients, waits for the local database
Broadcast replication slot after the first private join, and verifies:

- simultaneous reciprocal conversation creation and one inbox event per participant;
- real private conversation/inbox joins plus unrelated and cross-user denial;
- 20 concurrent unique sends with contiguous sequences and one event per mutation;
- concurrent identical retries returning one row/event without sequence loss;
- conflicting payloads persisting at most one winner with no extra event;
- out-of-order delivered/read calls converging on the maximum state without duplicate state
  events.

This suite remains outside `npm run check` because it requires Docker, Auth, Realtime, and multiple
sessions. CI runs it after the clean database reset and pgTAP suite.

## CI

CI installs locked dependencies, checks formatting, lints, runs unit tests, builds the web
application, starts local Supabase, resets and tests the database, installs Chromium, and runs the
local-backed Playwright suite without production credentials. The npm Supabase wrapper sets
`DO_NOT_TRACK=1` so unreachable analytics endpoints cannot turn successful tests into false
command failures.
