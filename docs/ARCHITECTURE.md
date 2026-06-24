# Architecture

## System context

```mermaid
flowchart LR
  User[Browser user]
  Web[Council React web app]
  Supabase[Supabase platform]
  Edge[Supabase Edge Functions]
  OpenRouter[OpenRouter]
  Models[DeepSeek and vision model]

  User --> Web
  Web -->|Public anon credential + user session| Supabase
  Web -->|Authenticated requests| Edge
  Edge -->|Service-side data access| Supabase
  Edge -->|Application-owned credential| OpenRouter
  OpenRouter --> Models
```

## Boundaries

The browser is untrusted. It receives only the public Supabase URL and anon key. Authorization
must be enforced by PostgreSQL Row Level Security and server-side functions, never by hidden UI
alone.

Supabase PostgreSQL, Auth, Realtime, Storage, and Edge Functions form Council's trusted
infrastructure boundary. Connections are encrypted in transit, stored data is protected at rest
by the platform, and private content is restricted through authentication, Row Level Security,
and private storage. Delivery, search, attachments, and requested AI features require trusted
infrastructure processing, so Council does not claim end-to-end encryption. Service-role
credentials remain inside this boundary.

OpenRouter and selected model providers are external data processors. Only content explicitly
sent or forwarded to an AI contact may cross this boundary. Application-owned credentials are
used; users do not supply provider keys.

## Server components

The implemented `ai-chat` Edge Function authenticates requests, validates fail-closed CORS,
reserves the product credit, loads private conversation context, processes explicitly attached
images and documents, calls OpenRouter or the local mock provider, streams bounded responses, and
finalizes or refunds the run idempotently. Its runtime is split into request handling, validation,
SSE, generation orchestration, artifact revision orchestration, media processing, provider calls,
and run-lifecycle helpers. Upload and signed-access flows use narrow database RPCs plus private
Storage buckets. Unimplemented tools, billing, export, and background processing remain outside
the current runtime.

## Repository architecture

- `apps/web` owns the responsive React application, routes, browser integration, and web tests.
- `packages/schemas` owns environment-neutral Zod schemas shared at runtime boundaries.
- `supabase` owns local service configuration, immutable migrations, Edge Functions, and pgTAP
  tests.
- `docs` records locked product, architecture, security, and operational decisions.
- `tasks` retains bounded implementation specifications as project history.
- `evals` stores small synthetic AI behavior evaluation cases that run locally only.

The web application uses JavaScript with JSDoc where types clarify boundaries. This keeps the
locked frontend language while ESLint, runtime validation, and tests provide guardrails.
Supabase Edge Functions may use TypeScript because Deno supports it directly and server
boundaries benefit from static checking. Shared schemas remain JavaScript so both environments can
consume them without a compilation step.

## Runtime flow

TanStack Query manages server state, Zustand manages local UI state, React Router owns
navigation, and the Supabase JavaScript SDK is created from validated browser-safe configuration.

## Web shell and design system

The authenticated web application uses a full-height messenger shell. Desktop primary tabs render
inside a branded label navigation sidebar and a panel-owned content area. Messages, Contacts,
Artifacts, Settings, and Pro Status use the same resizable collection-panel plus content-panel
section model so navigation placement, scrolling, selected rows, and panel resizing are consistent
across the app. Narrow screens switch to a single route-driven panel with mobile bottom navigation.
Browser-level page scrolling is avoided inside the authenticated shell where practical.

The visual system is based on semantic CSS custom properties documented in
`docs/DESIGN_SYSTEM.md`. Legacy color variables remain mapped to the semantic tokens so older AI,
artifact, contact, and settings surfaces can adopt the shell before their focused redesigns. The
single icon family is `lucide-react`. The web app applies the user theme preference stored in
settings: light and dark apply directly, while `system` follows the browser
`prefers-color-scheme` result.

## Account and social database boundary

```mermaid
flowchart LR
  Browser[Authenticated browser]
  RLS[Direct reads and own-row updates through RLS]
  RPC[Validated social database functions]
  Tables[Profiles, settings, relationships, blocks]
  Auth[Supabase Auth users]

  Browser --> RLS
  Browser --> RPC
  RLS --> Tables
  RPC --> Tables
  Auth -->|Creation trigger| Tables
```

The authenticated browser may directly select its own profile and settings, update explicitly
granted own-row columns, select visible participant relationships, and select blocks it created.
General stranger discovery is not a table scan: it goes through the bounded
`search_profiles` function and returns a minimal shape.

Cross-user social mutations use narrowly scoped security-definer functions. Those functions
derive the actor from `auth.uid()`, validate target and state, use a fixed
`search_path = public, pg_temp`, and serialize pair mutations with transaction-level advisory
locks. Clients cannot directly insert, update, or delete relationships or blocks.

The private helper schema is not exposed as an API schema. Authenticated users receive only the
schema/function access required for profile RLS; arbitrary-identity block/contact helpers remain
non-executable.

## Web authentication lifecycle

```mermaid
flowchart TD
  Start[Application starts]
  Session[Supabase getSession]
  Events[Auth state subscription]
  Account[Profile and settings queries]
  Guest[Guest routes]
  Onboarding[Username onboarding]
  App[Protected application]

  Start --> Session
  Start --> Events
  Session -->|No session| Guest
  Session -->|Session| Account
  Events --> Account
  Account -->|Username missing| Onboarding
  Account -->|Username present| App
```

Supabase Auth is the only session source of truth. `AuthProvider` hydrates the existing browser
session, subscribes to Auth events, and exposes session/account states through React context.
Tokens remain inside the Supabase client and are never copied to Zustand, query data, or logs.

TanStack Query owns the current profile and settings. Queries are enabled only for authenticated
users, and profile/settings creation races receive bounded retries because rows are created by
the Auth database trigger. Profile errors remain distinct from signed-out state. Logout removes
all `account` query keys after Supabase completes the session operation.

Guest, onboarding, and protected guards wait for hydration before rendering or redirecting.
Protected redirects carry only an internal route in navigation state. Login passes that value
through a strict internal-path allowlist before navigation.

Presentational components call focused Auth and account API modules rather than using Supabase
directly. Profile changes use `set_my_profile`; preferences use `update_my_settings`, which
merges supported fields without deleting unrelated stored JSON keys.

Profile avatars use the private `profile-avatars` Storage bucket. The browser uploads an image to
an owner-prefixed path, then commits that path through `set_my_profile`; visible contacts resolve
avatars through short-lived signed URLs after Storage SELECT RLS confirms profile visibility.

Password recovery is marked only by Supabase's `PASSWORD_RECOVERY` event. Ordinary authenticated
sessions can reach the same password form only after an explicit security-screen action stored
temporarily in session storage.

## Contacts feature boundary

The contacts experience lives in a focused feature area under
`apps/web/src/features/contacts`: an `api` module of Supabase wrappers, `queries` for query
options and mutation hooks, presentational `components`, `pages`, `hooks`, and pure `utils`.
Presentational components never call Supabase directly; only the `api` wrappers do, and every
wrapper validates returned rows with the shared `@council/schemas` contracts before the data
reaches a component. The authenticated Contacts route uses the same collection-panel layout model
as Messages: a vertical selector for Human contacts and AI contacts, with the selected contact
surface rendered in the content panel. The Human contacts surface includes accepted contacts,
people discovery, and incoming/outgoing requests as sections in one scrollable view.

All cross-user social writes (sending, responding to, removing, blocking, and unblocking) go
through the existing security-definer database functions. The browser never inserts, updates, or
deletes relationship or block rows. Discovery deliberately avoids direct profile-table
enumeration: it calls the bounded `search_profiles` RPC, which requires at least two characters,
caps results, and applies privacy and block filtering server-side. The blocked-users screen uses
the dedicated `list_my_blocked_users` function because profile RLS hides blocked pairs from each
other.

TanStack Query owns all contacts server state under stable `contacts.*` query keys
(`list`, `requests`, `blocked`, and per-query `search`). Mutations invalidate exactly the buckets
the database contract can change rather than relying on optimistic updates. Only transient form
and dialog state is component-local; no contact data is duplicated into Zustand. A pending
incoming-request count is derived from the shared requests query and shown in navigation.

Contact lists refresh on focus, normal stale-time expiry, and successful mutations. Human
conversation and inbox synchronization use the private Realtime design described below.

## Direct messaging database boundary

```mermaid
flowchart LR
  Browser[Authenticated browser API wrapper]
  RPC[Messaging security-definer functions]
  Conversations[Conversations and canonical pairs]
  Members[Conversation members and receipts]
  Messages[Sequenced messages and reactions]
  Social[Accepted contacts and blocks]

  Browser -->|Validated bounded RPC calls| RPC
  RPC --> Conversations
  RPC --> Members
  RPC --> Messages
  RPC --> Social
  Browser -->|Member-only reads through RLS| Conversations
  Browser -->|Member-only reads through RLS| Members
  Browser -->|Member-only reads through RLS| Messages
```

Human direct conversations are separated into a general `conversations` row and a
`direct_conversation_pairs` row. The pair stores one sorted UUID tuple, allowing the general
conversation table to support future AI conversation types without pretending those conversations
have two human users. Task 005 implements only the `direct` type.

`create_or_get_direct_conversation` acquires the same transaction-level advisory lock used by
social pair mutations. It rechecks the accepted-contact and block state under that lock, returns
the existing canonical conversation when present, or transactionally inserts the conversation,
pair, and exactly two membership rows. Reciprocal requests therefore converge on one row.

`send_message` uses the conversation row update as the sequence allocation lock. Incrementing
`last_sequence` and returning it in the same statement gives concurrent sends unique monotonic
sequences. A sender/client-message UUID is unique across the sender, and a server-generated hash
of the normalized original payload distinguishes a valid retry from key reuse with changed
conversation, content, or reply target. The hash remains after content deletion so a retry cannot
silently create a replacement message.

Delivered and read state lives on each membership row. Functions lock the conversation, reject
negative or future sequences, and update with `greatest` so delayed events cannot move state
backward. Reading also advances delivery. The sender is automatically advanced through each
successful own send.

Historical reads depend only on conversation membership. Current accepted-contact and block state
is consulted for creation, sending, editing, and adding reactions. Removing a contact or blocking
therefore preserves history but returns one generic unavailable state for new writes. Own-message
deletion and own-reaction removal remain available. Reaccepting the pair resumes the original
conversation.

Deleting a human direct chat is owner-scoped. The browser calls the
`delete_conversation_for_me` RPC, which records a deletion marker on the caller's
`conversation_preferences` row through the current sequence. The shared conversation, membership,
peer history, and realtime authorization remain intact. The deleting user no longer sees messages
at or before that sequence in inbox, message listing, search, or message-window reads; a later
message makes the conversation visible again with unread counts starting after the deletion marker.

The web messaging feature includes the inbox, conversation route, composer, paginated message
interface, optimistic sends, replies, editing, tombstones, reactions, receipts, private
attachments, and Realtime reconciliation. The database remains authoritative after reconnects or
event gaps. AI conversations use separate owner-scoped tables and authorization rather than the
direct-human membership model.

## AI conversation boundary

AI contacts and private custom personas each own persistent user-scoped conversations. The browser
can read bounded history but cannot create assistant messages or mutate runs directly. The
`ai-chat` function uses service-role-only generation functions, product-credit reservation,
deterministic idempotency hashes, bounded run leases, and retry-idempotent completion. Initial AI
history loads the newest page and older pages use an exclusive `(created_at, id)` cursor.

Deleting an AI chat uses the `delete_ai_conversation` RPC. Because AI conversations are
owner-scoped, the row and dependent owner-only history are deleted by cascade. The underlying
built-in AI contact or custom persona is not deleted. Active generation runs block deletion so a
reserved credit cannot be orphaned outside the normal completion/failure lifecycle.

Curated memories are explicit owner-managed rows. Direct AI image and PDF/TXT/Markdown uploads use
separate private buckets and server-only analysis caches. Forwarded human text is an immutable
owner-only snapshot; the AI is never added to the human conversation.

Built-in AI cards render server-supplied `avatar_key` values. Custom persona avatars use the
private `persona-avatars` bucket and owner-prefixed paths stored on `ai_personas`; AI conversation
list projections return that value as `avatar_key` so custom persona chats use the same image.

## Secure Realtime delivery

Council uses database-originated Supabase Broadcast, not browser-originated Broadcast and not
Postgres Changes. Mutation triggers call `realtime.send` with a custom minimal payload in the same
transaction as the authoritative row change. Failed transactions therefore commit neither state
nor event, and idempotent/no-op RPC paths do not reach event-producing triggers.

Topics are centralized and deterministic:

```text
conversation:{conversation_id}
user:{user_id}:inbox
```

Conversation topics carry message create/edit/delete, reaction, receipt, and generic availability
events. Inbox topics carry conversation create/change and the same generic availability event.
Every payload has version `1`, a UUID transport event ID, event name, timestamp, and only the
applicable conversation/entity/sequence identifiers. Message content, reaction values, profiles,
settings, and social-state causes never enter Broadcast payloads.

Private-channel authorization is evaluated through RLS on `realtime.messages`. Exact conversation
topics require persistent conversation membership, so historical subscribers remain authorized
after contact removal or blocking. Exact inbox topics require the topic UUID to equal
`auth.uid()`. Topic parsing is anchored and fail-closed. Browser roles have no
`realtime.messages` INSERT permission or INSERT policy.

Availability events collapse acceptance, removal, block, and unblock changes into one shape
containing only the conversation ID. `block_user` inserts the block before deleting the accepted
relationship; the relationship trigger detects the block and defers to the block trigger,
preventing duplicate logical events.

### Reconciliation

Realtime is a synchronization hint, never the durable queue. Inbox consumers fetch
`list_my_conversations`, subscribe to their inbox, and refetch affected list state on valid
events. Conversation consumers use this race-safe order:

1. Join the private conversation topic and wait for `SUBSCRIBED`.
2. Fetch the current bounded message page from PostgreSQL.
3. Record the authoritative latest sequence.
4. Process later validated events.
5. Refetch after a sequence gap, event without sequence, reconnect, timeout, channel error,
   browser resume, network restoration, or authentication refresh.

The transport module owns only channels, validation, status normalization, and cleanup. It does
not mutate TanStack Query. A pure event-impact mapping tells later consumers which message,
conversation-list, detail, receipt, or contact areas require invalidation.

The transport `subscribeToPrivateEvents` is synchronous: it creates the channel, registers
handlers, refreshes auth without blocking, and subscribes in one synchronous call, returning the
channel handle immediately. This lets a React effect tear the channel down synchronously on
cleanup, so React StrictMode's mount/unmount/mount cycle in development never leaves two channels
joining the same private topic at once (which would otherwise wedge the subscription).

## Messaging frontend

The unified chat UI lives under `apps/web/src/features/messaging` and is wired into the
authenticated shell through Messages routes:

```text
/app/messages                       inbox (list pane) + placeholder/active conversation
/app/messages/:conversationId       a single direct human conversation
/app/messages/ai/:conversationId    a single owner-scoped AI conversation
```

`MessagingLayout` renders human and AI conversation entries in one resizable collection panel and
the active conversation through an `<Outlet/>`. The `/app/contacts/ai` route owns the AI contacts
catalogue for creating or opening AI contacts; created AI conversations navigate back into Messages.
The legacy `/app/ai` index redirects to that Contacts tab. On wide screens both panes show (list |
conversation). On narrow screens a single pane shows at a time, chosen by a `data-view` attribute
derived from the route param, giving full-screen conversation routing on mobile-web. The
conversation id is validated as a UUID before any query runs; an invalid id renders the same generic
"unavailable" screen as an inaccessible conversation.

`ConversationPage.jsx` composes route-level states and delegates coordination to
`useConversationController`, `useConversationSelection`, and `useConversationDialogs`. Query,
realtime, optimistic send, attachment, receipt, typing, mutation, selection, forwarding, and
dialog behavior remain backed by the existing hooks and database contracts.

### Query and cache ownership

TanStack Query owns all messaging server state. Stable keys live in `lib/query-keys/messaging.js`:

```text
messaging.conversations()          inbox (infinite query, keyset cursor)
messaging.messages(conversationId) per-conversation history (infinite query, before-sequence cursor)
```

The inbox is keyset-paginated by `(updated_at, id)` exactly as `list_my_conversations` returns it;
ordering is never recomputed locally from event arrival. Message history loads the newest page
first and pages older windows with an exclusive `before_sequence` cursor; pages are flattened,
de-duplicated by id, and sorted ascending for rendering. Cache mutations are centralized in
`queries/messageCache.js` (upsert/replace a message in place, clear deleted content) and
`queries/conversationCache.js` (patch the caller's own receipt fields to clear the unread badge
without a refetch). All messaging queries are dropped on sign-out via `queryClient.clear()`.

### Optimistic send and reconciliation

`useSendMessage` owns optimistic outgoing state per conversation, never the message query cache.
Each send generates a client UUID used as the backend idempotency key. On success the authoritative
row is written into the message cache and the optimistic placeholder is removed, so the realtime
echo and any refetch converge to exactly one message (de-duplicated by id). A failed send stays
visible with retry/remove controls; retry reuses the same client id and payload, which the backend
treats idempotently. Optimistic messages are never marked delivered or read.

### Realtime lifecycle and gap recovery

`useInboxRealtime` runs at the authenticated shell level: it subscribes to the user inbox topic and,
on any validated event, invalidates the conversation list (and, for availability changes, the
affected conversation's messages and the contact list). `useConversationRealtime` subscribes to the
active conversation topic. Message create/edit/delete and reaction events trigger targeted
invalidation of that conversation's message query; receipt events from the peer update outgoing
receipt state; availability events refresh the inbox and contacts without inferring a cause.
Sequence gaps are assessed with the Task 006 reconciliation helper, and the message window is
refetched on (re)subscribe, on focus/visibility resume, and after any gap, so messages missed
while offline are reconciled from the database on reconnect. Malformed events are dropped by the
transport layer before reaching UI state, and event payloads are never logged.

### Receipt behavior

`useConversationReceipts` advances the caller's own delivered/read receipts monotonically and
debounced: delivered advances whenever an open conversation has reconciled messages; read advances
only while the conversation is active and the document is visible. The peer's read/delivered
sequences are learned from realtime receipt events, so the newest outgoing message shows one
derived indicator: Sent until a receipt is observed, then Delivered, then Read.

## Private attachment storage and upload flow

Attachments live in a private `message-attachments` Storage bucket. The browser never selects its
own object path: it goes through a staged, database-authorized flow.

```mermaid
flowchart LR
  Browser[Authenticated browser]
  Reserve[create_message_attachment_upload]
  Bucket[Private Storage bucket]
  Finalize[finalize_message_attachment]
  Send[send_message + attachment IDs]

  Browser -->|1 validate + reserve| Reserve
  Reserve -->|returns the only allowed path| Browser
  Browser -->|2 upload bytes| Bucket
  Browser -->|3 confirm + dimensions| Finalize
  Browser -->|4 send with finalized IDs| Send
```

`create_message_attachment_upload` validates conversation membership, the MIME type, the
declared file extension, and the size, then inserts a `pending` `message_attachments` row and
returns a single derived path of the form
`conversations/{conversation_id}/{attachment_id}/{safe_filename}`. Storage INSERT RLS only allows a
write whose object name matches a pending reservation owned by the caller, so a client cannot upload
to an arbitrary conversation or an unreserved path. `finalize_message_attachment` confirms the
object exists and records optional image dimensions, moving the row to `ready`.

`send_message` takes an array of up to four finalized attachment IDs. Inside the conversation's
sequence-allocation lock it re-validates that each ID is owned by the sender, belongs to the
conversation, and is still `ready` and unattached, then attaches them to the new message in the same
transaction. The idempotency payload hash includes the sorted attachment IDs, so a retry with a
changed attachment set is a conflict rather than a silent replacement. A message may carry text,
attachments, or both, but never neither; the `messages.has_attachments` flag lets the content
tombstone constraint permit null content only when attachments are present.

Attachment metadata flows back through the existing message-returning functions as an
`attachments` JSON array (never a URL). Rendering resolves a short-lived signed URL per attachment
on demand and caches it in memory only. Deleting a message removes its `message_attachments`
rows; because Storage SELECT RLS requires a live attached row, every later signed-URL request for
that object then fails. Physical object cleanup is best-effort from the owning client; access
revocation does not depend on it.

The web attachment code lives under `apps/web/src/features/messaging`: `api/attachmentsApi.js`
wraps the reserve/finalize/remove RPCs and the signed-URL calls, `hooks/useAttachmentDraft.js` owns
the composer-side upload lifecycle, `hooks/useAttachmentUrl.js` plus `queries/attachmentUrlCache.js`
resolve and cache signed URLs, and the rendering components display thumbnails, file cards, and an
accessible image viewer.

## Task 017 messaging and access boundaries

AI assistant content uses one `SafeMarkdown` renderer for persisted history, streaming output, and
AI artifact proposals. Human messages, forwarded snapshots, memories, persona instructions,
filenames, and errors remain plain text. The renderer has no raw-HTML plugin, suppresses remote
images, permits only HTTP(S) links, and owns bounded table/code overflow plus copy feedback.

Typing uses private `conversation:{conversation_id}:ephemeral` Broadcast topics. Browser INSERT
authorization exists only for those member-only topics; durable conversation and inbox topics
remain database-originated. Presence is a throttled database heartbeat exposed through bounded
RPCs that apply accepted-contact, block, and privacy checks. Conversation mute is an owner-specific
row and does not affect unread state.

Message search uses `simple` full-text search over non-deleted human messages in conversations the
caller belongs to. A separate bounded message-window RPC opens old results without loading the
whole history. Foreground browser notifications consume identifier-only inbox events, re-fetch the
authorized message, and apply active-conversation, mute, preview, sound, and duplicate checks.

Premium codes are service-created, high-entropy, hash-only, single-use records. Redemption creates
an immutable owner-visible grant and extends `pro_expires_at` from the later of now or the existing
expiration. AI runs record whether they reserved a Premium or trial credit so completion, failure,
and stale-run recovery preserve exactly-once accounting.
