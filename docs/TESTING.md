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

## CI

CI installs locked dependencies, checks formatting, lints, runs unit tests, builds the web
application, starts local Supabase, resets and tests the database, installs Chromium, and runs the
local-backed Playwright suite without production credentials. The npm Supabase wrapper sets
`DO_NOT_TRACK=1` so unreachable analytics endpoints cannot turn successful tests into false
command failures.
