# Council

[![CI](https://github.com/uluutku/council/actions/workflows/ci.yml/badge.svg)](https://github.com/uluutku/council/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D22-3c873a)
![License](https://img.shields.io/badge/license-source--available-blue)

Council is a private web messenger I am building one milestone at a time. The plan is easy to say
and slow to do: put real people and AI contacts in the same app, keep the two clearly apart, and
explain clearly when features require server-side processing.

It is a work in progress. The account and contact layers are finished and tested, and human text
messaging now works end to end: an inbox, a real conversation screen, optimistic sending, replies,
editing, deletion, reactions, and live Realtime synchronization between two people. Messages can
now also carry private image and file attachments. There are built-in AI contacts, including Council
Assistant, Writing Editor, Study Coach, and Coding Partner, plus private custom personas you create
yourself, all chattable with streamed DeepSeek responses through a server-owned OpenRouter
integration, gated by a short, server-enforced credit trial. Each AI contact also has transparent,
user-curated memory that can be edited, deleted, or disabled without deleting conversation history.
Users can also attach private JPEG, PNG, or WebP images directly to an AI prompt for analysis. The
user can now explicitly select up to 20 active text messages from a human conversation, review the
exact copied package, and send it to a built-in AI contact or active custom persona. The rest of
this README is the honest status, not a pitch. AI conversations also accept private PDF, TXT, and
Markdown documents for explicit, question-driven analysis.

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

Database mutations also emit private, content-free Realtime Broadcast hints to conversation
members and per-user inbox topics. These events are validated strictly in the browser and always
lead back to database reconciliation; Broadcast is not treated as message storage.

The human text-messaging interface is now built on top of all of this:

- a Message action on each accepted contact that opens or creates the single direct conversation,
- an inbox that lists your conversations with previews, timestamps, and unread counts,
- a conversation screen with paginated history, replies, editing, deletion, and a small reaction set,
- optimistic sends that reuse the backend idempotency key, retry the same client id on failure, and
  reconcile to exactly one authoritative message,
- live updates over Realtime with gap detection and reconnect/focus reconciliation from the database,
- honest Sent/Delivered/Read indicators on the newest outgoing message, and
- a responsive split view on desktop with full-screen conversation routing on narrow screens.

Messages can now include attachments: up to four images or documents per message (JPEG, PNG, WebP,
GIF, PDF, plain text, or Markdown, each up to 10 MB). Files upload to a private Storage bucket
through a staged, validated flow, render as bounded thumbnails or file cards, and are reached only
through short-lived signed URLs that conversation members request on demand. Deleting a message
removes its attachment metadata and revokes access.

The AI section (`/app/ai`) has four built-in contacts: Council Assistant, Writing Editor, Study
Coach, and Coding Partner. A "My personas" tab lets you create private custom personas with
your own instructions, tone, and verbosity. Each contact has its own persistent conversation;
sending a prompt streams a DeepSeek response token-by-token and persists it. Personas can be edited,
archived (history stays readable, new replies pause), and restored, and are visible only to you. AI
access is a server-enforced trial shared across every contact: 20 text-generation credits that start
on your first message and expire seven days later. Each completed generation spends one credit; a
failed provider request refunds it. The provider prompt is assembled on the server from a fixed
platform instructions followed by agent or persona instructions and untrusted user context.
Enforceable authorization remains outside the model. OpenRouter credentials live only on the
server, built-in prompts never reach the browser, and a deterministic local mock provider backs the
automated tests.

Each AI conversation defaults to Curated memory. Council includes only memories you explicitly save
or approve; there is no automatic extraction. The Memory panel supports add/edit/delete, confirmed
Remember-from-message, and Conversation only mode, which stores memories without sending them to
the model.

AI prompts may include up to two private images (5 MB each, 8 MB combined). Council uploads them to
a separate private bucket, discloses provider sharing before send, and uses a configured vision
model to produce structured context for the selected DeepSeek contact. Images and responses persist
on reload and remain scoped to the account and AI conversation.

AI prompts may also include up to two private PDF, TXT, or Markdown documents. TXT and Markdown are
decoded as plain UTF-8 text; text-based PDFs are sent as private base64 bytes to the configured
OpenRouter PDF parser, never by signed URL. The browser shows a disclosure and requires an explicit
Send action before processing. Persistent document cards expose only safe metadata and authorized
short-lived download links. Scanned PDFs are not OCRed.

Human-message forwarding is text-only and confirmation-gated. The review dialog shows sender
labels, timestamps, destination, optional instruction, provider disclosure, and attachment
exclusions. The server re-fetches selected text, creates an immutable owner-only snapshot, and
starts the normal idempotent AI generation flow. The AI never joins or observes the human
conversation, and the other participant cannot access the copied context or AI response.

## What it can't do yet

There is no typing indicator, presence or online status, or notification delivery. The AI side is
deliberately focused: text, curated memory, directly attached image and document understanding, and
explicit text-only human-message forwarding. It has no automatic memory extraction, OCR, Office or
HTML analysis, semantic document search, tools, web search, AI inside human conversations,
public/shared personas, or billing checkout (when the trial ends the app says so honestly rather
than showing a fake upgrade). There is no mobile app or group chat. None of these are faked in the
UI on purpose; there are no disabled controls advertising features that do not exist.

So Council now has working human text and attachment messaging plus a small AI-contact system,
including built-in assistants, private custom personas, and transparent per-contact memory, on top of its
account, contact, and secure database foundations, but not tools or billing.

## Why it is built this way

Most apps bolt AI on as a sidebar. I wanted an AI contact to sit in the contact list like any
other contact, clearly labelled as AI, with no confusion about who you are talking to and no
surprise about when your text leaves for a model provider.

Council protects data in transit and at rest. The current architecture uses server-side processing
and is not end-to-end encrypted. Private content is protected by authentication, database
authorization, and private storage; messaging and AI features require trusted server components to
process the content involved.

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
- Supabase Auth, PostgreSQL, private Realtime Broadcast, private Storage, and Edge Functions.
- OpenRouter with a configurable DeepSeek text model, a separate vision model, and a PDF parser,
  behind server-checked entitlement and idempotency controls.

Discovery goes through one bounded function that needs at least two characters, caps the number of
results, and filters out blocked and privacy-hidden users on the server. The client never lists
users on its own.

Direct-message writes are function-only. Conversation creation locks the canonical user pair,
message sends lock the conversation row while allocating the next sequence, and sender/client
UUIDs make network retries idempotent. Conversation and message listing are bounded and
cursor-based. The browser-facing wrappers validate the returned rows with strict shared schemas,
and the messaging UI now consumes them through TanStack Query: the inbox and per-conversation
message history are infinite queries, Realtime events trigger targeted invalidation or refetch
rather than direct writes, and message content is always rendered as plain text (no raw HTML, no
`dangerouslySetInnerHTML`, no automatic markdown; bare links are linkified with
`rel="noopener noreferrer"`).

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

For live AI replies, copy `supabase/functions/.env.example` to the gitignored
`supabase/functions/.env`, add the server-only OpenRouter key, and run `npm run dev:ai`. Missing
provider mode defaults to OpenRouter; automated tests explicitly select local-only mock mode.

## Routes

| Area       | Routes                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Auth       | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` |
| Onboarding | `/onboarding`                                                                 |
| App        | `/app`                                                                        |
| Messages   | `/app/messages`, `/app/messages/:conversationId`                              |
| Contacts   | `/app/contacts`, `/app/contacts/discover`, `/app/contacts/requests`           |
| Settings   | `/app/settings/{profile,preferences,security,blocked}`                        |

## Commands

| Command                    | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `npm run dev`              | Start the web application                                      |
| `npm run dev:ai`           | Start `ai-chat` from `supabase/functions/.env`                 |
| `npm run check`            | Format check, lint, unit and component tests, production build |
| `npm run test`             | Unit and component tests                                       |
| `npm run test:e2e`         | Playwright browser flows (needs local Supabase)                |
| `npm run test:concurrency` | Multi-session messaging and private Realtime integration tests |
| `npm run db:test`          | pgTAP database tests (needs local Supabase)                    |
| `npm run supabase:reset`   | Recreate the local database from migrations                    |

`npm run check` does not need Supabase. Database, concurrency, and browser tests do.

## How it is tested

The privacy claims above are checked at every layer, not just asserted here.

- Database (pgTAP): assertions cover account/social authorization plus direct
  conversation uniqueness, message sequencing and idempotency, replies, tombstones, reactions,
  receipts, pagination, relationship changes, Realtime authorization/events, RLS isolation, and
  direct-write denial.
- Unit and component: the contact and messaging API wrappers, the error mapping, the search
  debounce and stale-result handling, messaging and Realtime schemas/subscribers, gap detection,
  safe text rendering, optimistic-send reconciliation, edit/delete/reaction flows, receipt
  derivation, the realtime hooks (subscribe/cleanup/reconnect/gap/malformed/conversation-switch),
  and the loading, empty, success, and error states on every page.
- Multi-session integration: opposite-direction conversation creation, 20 concurrent sends,
  idempotent retry races, conflicting payloads, out-of-order receipts, actual private channel
  authorization, and database-originated Broadcast delivery.
- Browser (Playwright): multi-user flows against real local Supabase. The contact suite covers
  discovery, acceptance, removal, blocking in both directions, unblocking, and the contact-request
  privacy setting. The messaging suite covers creating and sending, realtime delivery and replies
  between two open clients, failed-send retry and idempotency, replies that stay linked through
  edit and deletion, reactions, contact removal, blocking privacy, reaccepting into the same
  conversation, and reconnection reconciliation. Each test makes and cleans up its own users.

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
