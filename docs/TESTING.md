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

The database suite now contains six pgTAP files with 176 assertions. Task 002 contributes five
files and 174 assertions covering:

- Auth-triggered profile/settings creation and cascading deletion;
- profile normalization, constraints, immutable ownership fields, and own-row RLS;
- private settings validation and owner-only access;
- bounded profile discovery, privacy settings, block filtering, and minimal return fields;
- request, response, reciprocal acceptance, rejection retry, removal, blocking, and unblocking;
- participant visibility, anonymous denial, direct-mutation denial, and internal-helper grants.

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

## CI

CI installs locked dependencies, checks formatting, lints, runs unit tests, builds the web
application, installs Chromium, and runs the Playwright smoke test without production credentials.
Database CI is deferred until a stable Docker-backed Supabase job is added. Local database tests
are mandatory for database tasks. The npm Supabase wrapper sets `DO_NOT_TRACK=1` so unreachable
analytics endpoints cannot turn successful local tests into a false command failure.
