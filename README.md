# Council

![Node](https://img.shields.io/badge/node-%3E%3D22-3c873a)
![License](https://img.shields.io/badge/license-source--available-blue)

Council is a private web messenger for conversations with people and AI contacts. Human and AI
contacts share one clear interface while remaining visibly distinct.

The application is built with a conservative security model. Connections are encrypted in
transit, stored data is protected at rest by the platform, files use private storage, and
PostgreSQL Row Level Security enforces access at the data boundary. Server credentials never enter
the browser bundle.

## Features

### Human messaging

- Private one-to-one conversations between accepted contacts
- Realtime delivery with database reconciliation after reconnects
- Replies, edits, soft deletion, reactions, and sent, delivered, and read states
- Private image and document attachments through short-lived signed URLs
- Typing indicators on private ephemeral channels
- Privacy-aware online and last-seen status
- Per-user conversation mute controls
- Foreground browser notifications with preview and sound preferences
- All, Unread, and Muted inbox filters
- Bounded conversation and message search with direct jumps to older results

### AI contacts

- Four built-in contacts: Council Assistant, Writing Editor, Study Coach, and Coding Partner
- Private custom personas with independent instructions and conversation history
- Streamed responses through a server-owned OpenRouter integration
- Safe GitHub-flavored Markdown for assistant messages, including tables, task lists, and copyable
  code blocks
- Explicit, user-managed memory with per-conversation controls
- Private image, PDF, TXT, and Markdown analysis
- Confirmation-gated forwarding of selected human messages to an AI contact
- No automatic memory extraction, hidden tools, or background web access

### Artifacts

- Save assistant responses as private working documents
- Immutable version history for manual edits, AI revisions, and restores
- Explicit review before saving an AI revision
- Markdown and plain-text export

### Premium access

- Owner-issued, single-use access codes
- Configurable access duration and AI credit balance
- 30 days and 100 credits by default
- Time and credits can stack through additional valid codes
- Premium credits are consumed before trial credits
- Failed provider requests refund the same reserved credit pool
- No payment provider, recurring billing, or unlimited generation

## Security design

Council treats the browser as untrusted:

- Every product table has Row Level Security.
- Cross-user mutations run through narrow database functions scoped to `auth.uid()`.
- Product writes use validation, authorization, bounded queries, and idempotency controls.
- Realtime events carry minimal data and reconcile against the database.
- Message and AI files live in private buckets.
- AI entitlements and credit reservations are enforced server-side.
- Provider and service-role credentials remain in server secret stores.
- Logs exclude message bodies, prompts, memories, files, access codes, and credentials.
- Database tests cover both authorized and denied paths.

Trusted infrastructure processes content for delivery, search, attachments, and explicitly
requested AI features. Council therefore does not claim end-to-end encryption. See
[docs/SECURITY.md](docs/SECURITY.md) for the complete trust model and controls.

## Technology

- React, Vite, React Router, TanStack Query, and Zustand
- JavaScript with JSDoc at trust boundaries
- Shared Zod schemas for runtime validation
- Supabase Auth, PostgreSQL, Realtime, Storage, and Edge Functions
- OpenRouter with configurable text, vision, and PDF models
- Vitest, Testing Library, pgTAP, and Playwright

## Run locally

Requirements:

- Node.js 22 or newer
- npm 11 or newer
- Docker for local Supabase

```bash
npm install
cp .env.example .env.local
npm run supabase:start
npm run dev
```

Add the local public values to `.env.local`:

```text
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local public anon key>
```

These are the only values that belong in a Vite environment file. For live AI replies, copy
`supabase/functions/.env.example` to the ignored `supabase/functions/.env`, add the server-only
OpenRouter key, and run:

```bash
npm run dev:ai
```

Automated AI tests use a deterministic local mock provider.

## Owner-issued Premium codes

Code creation requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the server environment.
Never place either value in a `VITE_*` variable or tracked file.

```bash
npm run premium:create-code -- --days 30 --credits 100
npm run premium:create-code -- --count 5 --days 30 --credits 100
```

The script prints the target project before creating codes and requires explicit confirmation for
a remote project. Only cryptographic hashes are stored. Each plaintext code is displayed once.

## Main routes

| Area           | Routes                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| Authentication | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` |
| Messages       | `/app/messages`, `/app/messages/search`, `/app/messages/:conversationId`      |
| AI             | `/app/ai`, `/app/ai/:conversationId`                                          |
| Artifacts      | `/app/artifacts`, `/app/artifacts/:artifactId`                                |
| Contacts       | `/app/contacts`, `/app/contacts/discover`, `/app/contacts/requests`           |
| Settings       | `/app/settings/{profile,preferences,access,security,blocked}`                 |

## Commands

| Command                       | Purpose                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `npm run dev`                 | Start the web application                                       |
| `npm run dev:ai`              | Start the local AI Edge Function                                |
| `npm run verify:local`        | Run the normal local verification orchestrator                  |
| `npm run verify:local:quick`  | Run local checks that do not require Docker or Supabase         |
| `npm run verify:local:strict` | Run local verification and fail if an expected stage is skipped |
| `npm run check`               | Run formatting, lint, unit tests, and production build          |
| `npm run eval:ai:offline`     | Run deterministic synthetic AI behavior evaluations             |
| `npm run eval:ai:live`        | Run opt-in live AI evaluations only with `-- --confirm`         |
| `npm run test:e2e`            | Run Playwright browser tests                                    |
| `npm run test:concurrency`    | Run multi-session messaging and Realtime tests                  |
| `npm run test:ai-edge`        | Run AI Edge Function tests                                      |
| `npm run db:test`             | Run pgTAP database tests                                        |
| `npm run supabase:reset`      | Recreate the local database from migrations                     |

## Verification

The test suite covers authentication and social privacy, messaging authorization, Realtime
recovery, private attachments, safe AI Markdown, AI credit accounting, artifacts, presence,
typing, mute behavior, notifications, search, Premium code redemption, and small offline AI
behavior checks.

Verification is local-only. `npm run verify:local` is the normal command. It runs available local
stages and prints PASS, FAIL, and SKIPPED rows. Infrastructure-dependent stages may be skipped
when Docker, Supabase, Chromium, required ports, or local configuration are unavailable. GitHub
Actions is not used as a hosted test runner. Optional live AI evaluations are never part of local
verification and may consume provider credits when explicitly confirmed.

## Repository

```text
apps/web/          React application and browser tests
packages/schemas/  Shared runtime validation
supabase/          Migrations, Edge Functions, and pgTAP tests
docs/              Product, architecture, security, and runtime documentation
tasks/             Completed implementation task records
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), and
[docs/ROADMAP.md](docs/ROADMAP.md) for implementation details and current scope. See
[LICENSE](LICENSE) for usage terms.
