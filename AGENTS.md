# Coding agent rules

These instructions apply to every coding agent working in this repository.

## Required context

Before implementation, read `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY.md`.
Treat locked product decisions as immutable unless the user explicitly changes them.

## Engineering guardrails

- Never expose Supabase service-role credentials or OpenRouter credentials.
- Never place server secrets in `VITE_*` variables.
- Every new product table requires Row Level Security in the same migration.
- Every RLS policy requires positive and negative database tests.
- Never edit an already-applied migration; add a new migration.
- Validate every external input with Zod or an equivalent explicit validator.
- Never log message bodies, images, complete prompts, memories, tokens, credentials, or tool
  secrets.
- All future AI calls require server-side entitlement checks, cost controls, and an idempotency
  key.
- Do not introduce a dependency without a concrete reason tied to the active task.
- Do not add product features outside the active task scope.
- Update documentation whenever architecture, security, schema, or behavior changes.
- Run `npm run check` before declaring a task complete.
- Run relevant database and end-to-end tests when the task changes those boundaries.
- Report unresolved risks and failed commands honestly.

## Database changes

Product tables must be created through migrations. RLS must be enabled and policies must be
defined in the same migration. Tests must prove both an authorized path and a denied path.
Applied migrations are immutable project history.

## Completion response

Every completed implementation task must report:

1. Summary
2. Files changed
3. Commands run
4. Test results
5. Architecture decisions
6. Security implications
7. Deferred work
8. Known issues
