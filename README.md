# Council

Council is a private web messenger that places direct conversations with real people and
persistent AI contacts in one inbox. Human and AI contacts remain clearly distinguished.

Council uses a server-readable privacy model. Traffic is encrypted in transit and hosted data is
encrypted at rest, but trusted server infrastructure can read messages and media. Council does
not claim end-to-end encryption. Content explicitly sent to AI contacts crosses the OpenRouter
provider boundary.

## Project status

The repository contains the Milestone 0 foundation and the database portion of accounts and
contacts. Profiles, private settings, discovery, contact requests, accepted contacts, and
blocking now have PostgreSQL functions, RLS, grants, shared validation, and pgTAP coverage.
Authentication screens and all contact UI remain unimplemented. Messaging, billing, and AI
features are also absent. The project is not production-ready.

## Stack

- React, JavaScript, Vite, and React Router
- TanStack Query, Zustand, and Zod
- Supabase Auth, PostgreSQL, Realtime, Storage, and Edge Functions
- Vitest, React Testing Library, Playwright, ESLint, and Prettier
- npm workspaces

## Prerequisites

- Node.js 22 or newer
- npm 11 or newer
- Docker Desktop or another Docker-compatible runtime for local Supabase

## Local setup

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set the browser-safe local Supabase values in `.env.local` after starting Supabase:

```text
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local public anon key>
```

Only those two public values belong in Vite environment files. `OPENROUTER_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` are future server-only settings. They must be
configured in the relevant server or deployment secret store and must never use the `VITE_`
prefix.

## Commands

| Command                   | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `npm run dev`             | Start the web application                   |
| `npm run dev:web`         | Start only the web workspace                |
| `npm run lint`            | Run ESLint                                  |
| `npm run format`          | Format supported files                      |
| `npm run format:check`    | Verify formatting                           |
| `npm run test`            | Run unit and component tests                |
| `npm run test:watch`      | Run web tests in watch mode                 |
| `npm run test:e2e`        | Run the Playwright smoke test               |
| `npm run build`           | Build the production web bundle             |
| `npm run check`           | Run formatting, lint, unit tests, and build |
| `npm run supabase:start`  | Start local Supabase                        |
| `npm run supabase:stop`   | Stop local Supabase                         |
| `npm run supabase:status` | Show local Supabase status                  |
| `npm run supabase:reset`  | Recreate the local database from migrations |
| `npm run db:test`         | Run pgTAP database tests                    |

`npm run check` intentionally does not require Supabase. Database tests are a separate command.

## Repository structure

```text
apps/web/          React web application and browser tests
packages/schemas/  Runtime validation shared across trusted boundaries
supabase/          Local services, migrations, database tests, and Edge Function utilities
docs/              Product, architecture, security, and engineering documentation
tasks/             Task specification template and retained project history
.github/workflows/ Continuous integration
```

Read [the architecture](docs/ARCHITECTURE.md) and [security model](docs/SECURITY.md) before making
implementation changes.
