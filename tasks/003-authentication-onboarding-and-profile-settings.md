# Task 003 — Authentication, Onboarding, and Profile Settings

## Objective

Implement Council's complete first-release email/password authentication, username onboarding,
profile settings, account preferences, security screen, and local-Supabase browser tests.

## User story

As a Council user, I can create and recover an account, maintain a persistent session, choose my
discoverable username, edit profile/preferences, and securely log out.

## Context

Tasks 001 and 002 were committed as baseline `03632f0`. This task uses Supabase Auth and the
existing RLS-protected profile/settings layer.

## In scope

- registration, verification state, login, logout, recovery, and password update
- Auth provider, account queries, route guards, and safe return paths
- username onboarding and authenticated shell
- profile, preferences, theme, and security settings
- partial settings database function
- unit, component, pgTAP, and local-Supabase Playwright coverage

## Out of scope

Contacts UI, conversations, messaging, Realtime messaging, Storage/avatar uploads, push
notifications, billing, AI, groups, OAuth, MFA, account deletion, email change, and admin UI.

## Locked decisions

Supabase Auth owns session state. Tokens never enter Zustand or application logs. TanStack Query
owns profile/settings data. Cross-user social behavior remains outside this task.

## Database changes

Add `update_my_settings` in a new migration. It derives the user from `auth.uid()`, validates
supported partial patches, merges them into existing settings, and preserves unknown stored keys.
No tables are added.

## RLS changes

None. Existing owner-only settings RLS remains unchanged; the new function has explicit
authenticated execution and anonymous denial.

## Backend changes

No Edge Function is added. Supabase Auth and PostgreSQL RPCs provide the required backend
behavior.

## Frontend changes

Add all Task 003 routes, Auth/Query/theme providers, guards, focused API wrappers, forms,
authenticated/settings layouts, accessible account states, and responsive styling.

## Security considerations

Restrict redirects to internal application paths, use generic recovery responses, require real
recovery state or explicit change intent, clear private query data on logout, never expose tokens,
and restrict Node admin helpers to loopback Supabase URLs.

## Error and loading states

Distinguish hydration, signed-out, unonboarded, onboarded, account-backend failure, validation,
credentials, verification, conflict, rate limit, network, expired session, and unknown errors.

## Acceptance criteria

Registration, onboarding, login, logout, recovery, profile and preference persistence, theme,
route guards, database tests, application checks, and local-Supabase Playwright tests pass.

## Required tests

Shared schemas, providers, guards, redirects, error mapping, forms, profile/preferences, logout,
settings RPC authorization, and the complete local browser account lifecycle.

## Documentation updates

Update README, architecture, security, database, testing, roadmap, CI behavior, and retained task
history.

## Completion gate

`npm run supabase:reset`, `npm run db:test`, `npm run check`, and `npm run test:e2e` must all pass.
