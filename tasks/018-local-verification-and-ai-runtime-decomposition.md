# Task 018: Local-First Verification and AI Runtime Decomposition

Task 018 is a maintenance milestone. It adds no product features.

Implemented scope:

- Disabled active GitHub-hosted test workflows by removing `.github/workflows/ci.yml`.
- Added `npm run verify:local`, `npm run verify:local:quick`, and `npm run verify:local:strict`.
- Kept verification local-only with PASS, FAIL, and SKIPPED reporting plus gitignored local logs.
- Decomposed `supabase/functions/ai-chat/index.ts` into focused request, orchestration, media,
  streaming, error, and run-lifecycle modules without changing the external request or SSE
  contracts.
- Replaced wildcard CORS fallback with explicit allowed origins, local mock loopback defaults, and
  fail-closed production behavior.
- Added small synthetic offline AI behavior evaluations under `evals/ai/`.
- Added an explicitly confirmed local-only live evaluation harness skeleton.
- Updated testing, runtime, roadmap, changelog, shared Edge Function, and README documentation.

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
