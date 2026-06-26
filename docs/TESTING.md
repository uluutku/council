# Testing

Council uses two verification layers:

- Hosted quality gates in `.github/workflows/quality-gates.yml` run on pushes to `main`, pull
  requests, and manual dispatch. They execute the no-secret stages that can run on clean GitHub
  runners: formatting, linting, shared/web tests, production web build, AI Edge static check,
  offline AI evaluations, Flutter dependency resolution, mobile formatting, mobile static analysis,
  mobile unit/widget tests, and an Android debug build.
- Local strict verification remains the authority for infrastructure-dependent stages that need
  Docker, local Supabase, local Realtime/Auth, local Chromium, emulators, or local secrets.

## Local Commands

```bash
npm run verify:local
npm run verify:local:quick
npm run verify:local:strict
npm run eval:ai:offline
```

`npm run verify:local:quick` runs formatting, linting, shared/frontend tests, and the production
build. `npm run verify:local` also attempts local Supabase startup, database reset, schema lint,
database/RLS tests, AI Edge integration, messaging concurrency, and Playwright E2E. It skips
infrastructure-dependent stages when local prerequisites are unavailable. `verify:local:strict`
uses the same local-only stages but exits nonzero if an expected stage is skipped or failed. A
fully provisioned local machine needs Docker running, the repository-managed Supabase CLI, pinned
local Deno 2.1.4 from `npm install`, and local Chromium from Playwright.

Result semantics:

- PASS means the stage executed locally and returned success.
- FAIL means the stage executed locally and returned a failure.
- SKIPPED means the stage did not execute because a local prerequisite was unavailable. Skipped is
  not counted as passed.

Logs and local eval results are written only under `.local-test-results/`, which is gitignored and
never uploaded automatically.

Hosted workflow artifacts intentionally do not include private local logs or secrets. Database/RLS,
Edge integration, Playwright, messaging concurrency, mobile integration tests, iOS simulator
builds, and live AI evaluations remain local-only until their prerequisites are available in a
controlled runner without exposing server credentials.

## Local prerequisites

Use the repository-managed Supabase wrapper instead of a separate global install:

```bash
node scripts/supabase.mjs --version
node scripts/supabase.mjs start
```

Docker must be installed and the daemon must be running before Supabase-backed stages can execute.
The Edge Function check uses the pinned local Deno package:

```bash
npm run deno:check:ai
```

## Test Categories

- Shared schemas: environment-neutral Zod contracts and boundary validation.
- Frontend units/components: Vitest and Testing Library coverage for routes, components, API
  wrappers, caches, rendering, and security-sensitive UI states.
- Database/RLS: pgTAP tests against local Supabase migrations for authorized and denied paths.
- Concurrency: local multi-session messaging and Realtime integration checks.
- AI Edge: local mock-provider integration for authorization, credits, persistence, retries,
  images, documents, forwarding, artifacts, and safe error mapping.
- Browser E2E: Playwright Chromium scenarios against local Vite and local Supabase.
- Offline AI evaluations: deterministic synthetic prompt and context behavior checks.
- Optional live AI evaluations: explicitly confirmed local-only provider checks that are not a
  release gate.

## Database security tests

Every future RLS policy must include positive tests for permitted actors and negative tests for
non-members, other users, unauthenticated sessions, or blocked relationships as applicable.
Tests must also cover function execution grants and private media access paths when introduced.

The database matrix covers:

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

Realtime database tests verify exact topic helpers, trigger/function presence, private receive
policy behavior, client Broadcast denial, malformed/similar-prefix rejection, member/owner
authorization, minimal event payloads, transaction failure behavior, idempotent event suppression,
edits/deletes, reaction no-ops, coherent receipt advancement, generic availability payloads, and
one logical block event per topic.

Tests create deterministic `auth.users` rows inside transactions. They simulate real API
authorization with:

```sql
set local request.jwt.claim.sub = '<user uuid>';
set local role authenticated;
```

Anonymous cases clear the subject and use `set local role anon`. Fixture setup runs as the
database owner, but authorization assertions run under the actual API roles and exercise RLS and
grants. Every file rolls back its fixtures.

## AI Evaluation

`npm run eval:ai:offline` runs synthetic local cases under `evals/ai/`. These verify deterministic
application behavior such as prompt ordering, memory inclusion/exclusion, forwarded and document
context delimiting, artifact distrust, persona separation, unsupported capability honesty, and
prompt truncation boundaries.

`npm run eval:ai:live -- --confirm` is optional and local-only. It requires a local OpenRouter
configuration, prints the configured model and case limit before starting, uses bounded synthetic
cases only, writes safe aggregate results under `.local-test-results/`, and is not run by
`verify:local`.

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

Playwright uses one validated loopback application origin. By default it is
`http://127.0.0.1:4173`; override it with `PLAYWRIGHT_BASE_URL` only for a local `http` origin with
an explicit port. If a scenario fails before navigation with an invalid or missing base URL, check
that variable first and run `npm run test:e2e -- --list` to confirm the app config is being loaded.

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
the absence of message-content logging.

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
sessions. `npm run verify:local` runs it after local Supabase startup, reset, and pgTAP when those
prerequisites are available.

## Messaging UI tests

Vitest and React Testing Library cover the messaging frontend. Utility tests assert the safe
text-rendering rules (plain text, `http(s)`-only linkification, rejection of `javascript:`/`data:`
schemes, trailing-punctuation handling), message-page flatten/de-duplication and older-cursor
derivation, calendar-day comparison, receipt derivation and monotonic peer-receipt merge,
reaction summarization, peer name/initials, and the error map that collapses every
availability/access cause into the two generic messages. Component tests cover the inbox list
(empty state, rendering, deleted preview, "You:" preview, unread count, selected state, error/retry,
and the bounded load-more control), the composer (validation, Enter to send, Shift+Enter newline,
IME-composition safety, the character counter near the limit, and the reply preview/cancel), and
the contacts Message action (opening/creating a conversation and navigating, plus the generic
unavailable message on failure).

The conversation page is tested as an integration surface with the messaging API and the realtime
transport mocked over a small in-memory server model, so optimistic sends, realtime echoes, and
refetches converge against one source of truth. These tests assert: rendering of own/peer messages,
edited state, deleted tombstones, and reply references; a generic unavailable screen for an
inaccessible conversation; the empty-conversation prompt; an optimistic send that confirms to
exactly one message and is not duplicated by a realtime echo; a failed send that stays visible and
converges to one message after a retry that reuses the same client id; editing and deleting the
sender's own message (with no edit/delete controls on another user's message); a confirmation
dialog and tombstone on deletion; adding a reaction that reconciles through a refetch; and the
messaging-unavailable state hiding the composer, showing the generic banner, and still allowing
deletion. Realtime-hook tests cover subscribe and cleanup, reconcile on (re)subscribe, targeted
invalidation on message events, peer-only receipt handling, ignoring events for other
conversations, cleanup on unmount, and resubscribe with old-channel cleanup on conversation change.

Playwright covers nine multi-user messaging scenarios against local Supabase, each provisioning its
own onboarded accepted contacts in separate browser contexts and cleaning them up afterward:
creating a conversation from Contacts, sending, and the recipient seeing unread then having it clear
on read; realtime delivery and replies between two open clients with no duplication; a failed send
(via a one-time intercepted `send_message` response) retried with the same client id that persists
exactly one message through reload; replies that stay linked through edit and deletion (the reply
excerpt shows "Message deleted"); reactions added and removed reconciling on both clients; contact
removal keeping history readable while disabling the composer and still allowing the sender to
delete an old message; blocking disabling sending for both with no block disclosure to the blocked
user; reaccepting a removed contact reusing the same conversation with no duplicate; and
reconnection reconciling messages a client missed while offline. Message-content assertions are
scoped to the message-history list so the inbox sidebar's last-message preview is not mistaken for a
duplicate. The interception helper alters only a test response and never weakens production code.

## Hosted CI

Hosted CI is intentionally disabled. Do not trigger GitHub Actions or recreate hosted runner jobs
to obtain verification results. If GitHub branch protection still requires removed status checks,
the repository owner must update those repository settings.
