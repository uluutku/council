# Hosted CI Disabled

Task 018 retired the former GitHub-hosted CI workflow. The deleted workflow previously ran
formatting, linting, unit tests, production builds, local Supabase database checks, AI Edge
integration, messaging concurrency, and Playwright E2E on `ubuntu-latest` runners for pushes and
pull requests.

Verification is now local-only:

```bash
npm run verify:local
npm run verify:local:quick
npm run verify:local:strict
```

Do not recreate a hosted workflow to satisfy branch protection. If GitHub settings still require
old status checks, the repository owner must update those settings.
