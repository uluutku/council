# Council

[![CI](https://github.com/uluutku/council/actions/workflows/ci.yml/badge.svg)](https://github.com/uluutku/council/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D22-3c873a)
![License](https://img.shields.io/badge/license-source--available-blue)

Council is a private web messenger I am building one milestone at a time. The plan is easy to say
and slow to do: put real people and AI contacts in the same app, keep the two clearly apart, and
be honest that the server can read your messages.

It is a work in progress. The account and contact layers are finished and tested. The database
foundation for direct conversations and text messages now exists, but the inbox, chat interface,
Realtime delivery, media, and the AI side come later. The rest of this README is the honest
status, not a pitch.

## What works today

You can register, verify your email, recover a password, and stay signed in across reloads. You
pick a username when you onboard, edit your profile, and set your theme, notification, and privacy
preferences.

The contact layer is done:

- find people by username or display name,
- send contact requests and answer the ones you receive,
- see incoming and outgoing requests separately,
- remove a contact, block someone, and unblock them later.

The PostgreSQL messaging foundation is also implemented and tested: accepted contacts can create
one canonical direct conversation, persist sequenced text messages, reply, edit, soft-delete,
react, and advance delivered/read state through controlled database functions. Existing history
remains readable after contact removal or blocking, while new writes are denied until an
accepted, unblocked relationship exists again.

## What it can't do yet

There is no chat interface or inbox. The browser does not yet query or display the new message
records. There is no Realtime subscription, typing indicator, file or image support, notification
delivery, or AI contact. None of it is faked in the UI on purpose, because a disabled "Message"
button that goes nowhere is worse than no button at all. There is also no mobile app, no group
chats, and no billing.

So right now Council has the account, contact, and secure database foundations of a messenger,
without the user-facing chat experience.

## Why it is built this way

Most apps bolt AI on as a sidebar. I wanted an AI contact to sit in the contact list like any
other contact, clearly labelled as AI, with no confusion about who you are talking to and no
surprise about when your text leaves for a model provider.

Council is server-readable, not end-to-end encrypted, and it says so plainly. Traffic is encrypted
in transit and stored data is encrypted at rest, but the server can read messages and media so the
product can run and, later, so AI contacts can reply. If you need end-to-end encryption, this is
not that.

The part I spent the most time on is keeping the privacy rules in the database, not in the
interface. Every table has row-level security. Every action that touches another user (sending a
request, accepting one, blocking someone) goes through a database function that decides who you
are from your session, not from whatever the browser claims. The browser cannot write a
relationship or a block row directly, even if it tries.

One example I like: if someone blocks you, nothing in the app tells you. A blocked request and a
request to someone who simply turned discovery off return the same "not available" message, so you
cannot tell them apart. The blocked-users screen only ever shows people you blocked, behind its own
database function, because the normal rules hide a blocked pair from each other.

## How it is built

The browser is treated as untrusted. It gets the public Supabase URL and the anon key, and nothing
else. Server-only secrets never get a `VITE_` prefix and never reach the bundle. Authorization is
PostgreSQL row-level security plus a small set of security-definer functions, not hidden buttons.

- React, Vite, and React Router for the app, in JavaScript with JSDoc at the edges.
- TanStack Query for server state, Zustand only for client-only UI state, and Zod for validation,
  shared from one package so the same rules run in the browser and in tests.
- Supabase Auth and PostgreSQL today. Realtime, Storage, and Edge Functions later.
- OpenRouter with DeepSeek as the planned model, plus a separate vision model, once AI contacts
  exist, behind a server-checked entitlement.

Discovery goes through one bounded function that needs at least two characters, caps the number of
results, and filters out blocked and privacy-hidden users on the server. The client never lists
users on its own.

Direct-message writes are function-only. Conversation creation locks the canonical user pair,
message sends lock the conversation row while allocating the next sequence, and sender/client
UUIDs make network retries idempotent. Conversation and message listing are bounded and
cursor-based. The browser-facing wrappers validate the returned rows with strict shared schemas,
but no route or visual messaging feature consumes them yet.

## Run it locally

You need Node 22 or newer, npm 11 or newer, and Docker for local Supabase.

```bash
npm install
cp .env.example .env.local
npm run supabase:start
npm run dev
```

Once Supabase is up, put its two public values in `.env.local`:

```text
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local public anon key>
```

Those are the only two values that belong in a Vite env file. Local Supabase turns off email
confirmation so you can register without a mailer, and Mailpit at `http://127.0.0.1:54324` catches
local recovery emails.

## Routes

| Area       | Routes                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Auth       | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` |
| Onboarding | `/onboarding`                                                                 |
| App        | `/app`                                                                        |
| Contacts   | `/app/contacts`, `/app/contacts/discover`, `/app/contacts/requests`           |
| Settings   | `/app/settings/{profile,preferences,security,blocked}`                        |

## Commands

| Command                  | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `npm run dev`            | Start the web application                                      |
| `npm run check`          | Format check, lint, unit and component tests, production build |
| `npm run test`           | Unit and component tests                                       |
| `npm run test:e2e`       | Playwright browser flows (needs local Supabase)                |
| `npm run db:test`        | pgTAP database tests (needs local Supabase)                    |
| `npm run supabase:reset` | Recreate the local database from migrations                    |

`npm run check` does not need Supabase. The database and browser tests do.

## How it is tested

The privacy claims above are checked at every layer, not just asserted here.

- Database (pgTAP): 397 assertions over 13 files cover account/social authorization plus direct
  conversation uniqueness, message sequencing and idempotency, replies, tombstones, reactions,
  receipts, pagination, relationship changes, RLS isolation, and direct-write denial.
- Unit and component: the contact API wrappers, the error mapping, the search debounce and
  stale-result handling, messaging schemas and API wrappers, and the loading, empty, success, and
  error states on every existing page.
- Browser (Playwright): multi-user flows against real local Supabase, covering discovery and
  acceptance, removal, blocking in both directions, unblocking, and the contact-request privacy
  setting. Each test makes and cleans up its own users.

## Layout

```text
apps/web/          React web application and browser tests
packages/schemas/  Runtime validation shared across trust boundaries
supabase/          Local services, migrations, and pgTAP tests
docs/              Product, architecture, security, and engineering decisions
tasks/             The task specs this was built from, kept as history
```

If you want the design before the code, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/SECURITY.md](docs/SECURITY.md).

## Status

Council has not had a security audit and is not production-ready. It is built one milestone at a
time, and [docs/ROADMAP.md](docs/ROADMAP.md) is the real list of what is and is not done. The
source is public to read; see [LICENSE](LICENSE) for what you may do with it.
