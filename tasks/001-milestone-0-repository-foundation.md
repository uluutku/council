# Task 001 — Milestone 0 Repository Foundation

## Objective

Create the production-quality Council repository foundation without implementing product
features.

## User story

As a Council developer, I need a consistent local application, database, test, and documentation
foundation so later milestones can add secure product behavior incrementally.

## Context

Council is a private, server-readable web messenger for human direct messaging and clearly
labeled AI contacts. The locked product and engineering decisions are recorded in `docs/`.

## In scope

- npm workspace and developer scripts
- React/Vite web scaffold and placeholder routes
- shared Zod schema package
- browser-safe environment validation
- local Supabase configuration, extension migration, and pgTAP smoke test
- unit, component, route, security-boundary, and Playwright smoke tests
- CI, architecture documentation, and coding-agent instructions

## Out of scope

Authentication, profiles, contacts, messaging, product tables, Storage policies, billing, AI
calls, personas, memory, tools, artifacts, and forwarding.

## Locked decisions

React uses JavaScript. Edge Functions may later use Deno TypeScript. npm workspaces, Supabase,
OpenRouter, DeepSeek, Zod, Vitest, and Playwright remain locked choices.

## Database changes

Enable `pgcrypto` and `pg_trgm`. Create no product tables. Defer `vector` until semantic retrieval
is implemented.

## RLS changes

None because no product tables are created.

## Backend changes

Add local Supabase configuration and an empty shared Edge Function utility directory. No Edge
Function is implemented.

## Frontend changes

Add the application shell, placeholder routes, global error boundary, environment guard,
Supabase client wrapper, Query client, local UI store, and responsive CSS foundation.

## Security considerations

Only public Supabase browser variables are accepted. Server-secret variable names are excluded
from frontend source. The repository documents server-readable privacy, RLS-first authorization,
private Storage, restricted logging, and the external AI provider boundary.

## Error and loading states

Missing browser configuration and unhandled render failures display explicit safe error states.
Product loading states are deferred with product features.

## Acceptance criteria

The root install, quality, build, browser, Supabase, and database commands exist. Quality, unit,
build, and browser checks pass without Supabase. Supabase and pgTAP checks require a local Docker
daemon.

## Required tests

- shared-schema validation
- browser environment validation
- component rendering
- route and not-found rendering
- frontend server-secret boundary
- Playwright landing/login smoke flow
- pgTAP extension smoke test

## Documentation updates

Create all product, architecture, security, database, AI runtime, memory, testing, roadmap, task
workflow, and agent instruction documents required by Task 001.

## Completion gate

Task 001 is complete when non-Docker checks pass and Docker-backed Supabase checks pass in an
environment with Docker available. Any host-level Docker blocker must be reported explicitly.
