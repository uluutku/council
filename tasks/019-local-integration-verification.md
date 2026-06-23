# Task 019: Complete Local Integration Verification

Task 019 is a maintenance milestone. It adds no product features and does not re-enable hosted CI.

Implemented scope:

- Started Docker Desktop locally and verified the repository-managed Supabase CLI path.
- Added pinned local Deno 2.1.4 support for Edge Function validation.
- Added `npm run deno:check:ai` and wired the Deno prerequisite into local verification.
- Validated the decomposed `ai-chat` modules with `deno check` and local mock Edge integration.
- Ran local Supabase reset, schema lint, database/RLS tests, AI Edge integration, messaging
  concurrency, and Playwright E2E on the local machine.
- Made Playwright use one validated loopback application origin before relative navigation.
- Added a repo-root Playwright config and runner wrapper so root `npm run test:e2e` loads the app
  config and preserves Playwright flags.
- Repaired the flaky artifact scenarios by preventing parallel test username collisions.
- Documented Docker daemon, pinned Deno, strict verification, and Playwright base URL diagnostics.

Flaky artifact findings:

- The earlier `page.goto: invalid URL` failure came from root-level Playwright invocation that did
  not guarantee the app config and its `baseURL` were loaded.
- The reproduced local repeat failure was a username collision: long prefixes such as
  `artifactflow` kept the timestamp-heavy portion and truncated away enough uniqueness, so parallel
  workers attempted the same onboarding username.
- The fix keeps random entropy inside the 24-character username limit and validates the app origin
  before any relative `page.goto` can run.

Hosted verification remains disabled. No GitHub Actions workflow is added or triggered, and normal
verification never runs live OpenRouter calls.

Intentional deferrals:

- Full TypeScript migration
- `ConversationPage` refactor
- Multi-browser matrix
- Automated accessibility gate
- Coverage thresholds
- Mutation testing
- Provider fallback
- Service-worker push
- Production deployment operations
