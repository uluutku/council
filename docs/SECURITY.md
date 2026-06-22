# Security

## Privacy model

Council is server-readable private messaging, not end-to-end encrypted messaging. Connections are
encrypted in transit and infrastructure encrypts stored data at rest. Trusted server
infrastructure can read messages and media when required to operate the service.

Access through the application must be limited to authorized conversation members with
authentication and Row Level Security.

## Secret management

The browser may receive only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The Supabase anon
key is public by design and does not replace RLS.

`OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` are server-only. They must
live in local server secret files or deployment secret stores, never in Vite variables, source
control, browser bundles, logs, or client responses.

## Database and storage

RLS is mandatory for every product table and must be introduced in the same migration as the
table. Every policy requires positive and negative pgTAP coverage. Client-side checks are
convenience only.

Message media uses a private Storage bucket (`message-attachments`); see "Private attachment
security" below. Access is checked before any short-lived signed URL is created.

## Profile discovery and social privacy

Direct profile-table reads are intentionally narrower than discovery. A user can read their own
full profile and profiles connected by a pending or accepted relationship. Stranger discovery
must use `search_profiles`, which requires authentication, at least two literal search
characters, and a maximum result limit of 25.

Search returns only ID, username, display name, avatar path, status text, and relationship
status. It never returns email addresses, biographies, Auth records, or private settings. Users
without usernames are not discoverable. A target that disables contact requests is hidden from
strangers but remains visible to someone with an existing relationship record.

Blocking is private and directional at the storage layer: only the blocker can select a block
row. Social behavior treats a block in either direction as mutual isolation. Blocking and
relationship deletion occur in one transaction, profile search hides both users from each other,
and new requests fail in either direction. Unblocking never restores removed relationships.

The blocked-users settings screen reads through the dedicated `list_my_blocked_users` function
rather than the profiles table, because profile RLS intentionally hides a blocked pair from each
other. That function returns only rows the caller created, so a user blocked by someone else is
never exposed to that other user, and it returns no email, biography, or private settings. Profile
policies are not weakened to support the screen.

## Contact UI privacy and error handling

The contacts UI enforces the same privacy posture as the database. No screen ever reveals that
another user blocked the caller. When a contact request fails because the target blocked the
caller or disabled contact requests, the UI shows a single generic "this person is not available
right now" message; the block and privacy rejection paths are mapped to the same user-facing text
so the two cases are indistinguishable. Database errors are mapped to a fixed set of categories
(validation, query-too-short, user-unavailable, request-no-longer-pending, action-not-permitted,
rate-limited, network, session-expired, backend-unavailable, and unknown). Raw SQL, stack traces,
internal function names, and UUIDs are never rendered, and private profile data is never logged.
A confirmed session loss redirects to login; ordinary backend errors do not. Discovery is driven
only by the bounded `search_profiles` RPC (the client performs no username enumeration or direct
profile-table search), and contact, block, and unblock mutations run only through the
`auth.uid()`-scoped database functions. The minimal contact, request, search, and blocked-user
contracts never include email addresses.

## Direct-message authorization

Council messages are server-readable plaintext within the trusted PostgreSQL/Supabase boundary;
this does not change the explicit no-E2EE privacy model. Authenticated users may read a
conversation, its pair/membership data, messages, and reactions only while their `auth.uid()` is a
stored member. RLS-backed table grants are read-only. Conversation creation, message writes,
edits, tombstones, reactions, and receipt updates are available only through fixed-search-path
security-definer functions.

The database derives every sender and receipt owner from `auth.uid()`. Browser input cannot set a
sender, add a member, advance another member's receipt, or directly mutate any messaging table.
Unrelated and anonymous callers receive no conversation existence information through table reads
or listing functions.

Contact removal and blocking do not erase historical membership, so both original participants
retain their existing history. They cannot send, edit, or add reactions unless the pair is
currently accepted and unblocked. Blocking and removed-contact failures use the same generic
messaging-unavailable result and never expose block direction. Own-message deletion and
own-reaction removal remain permitted so a user can remove their own historical contribution.
Unblocking alone restores no send permission.

Soft deletion clears `messages.content`, removes reactions on that message, and preserves the
message ID, sender, sequence, timestamp, and reply graph as a tombstone. Listing and preview
functions explicitly return null deleted content. Message bodies and reaction values must never
enter operational logs; the browser wrappers perform no message logging.

## Private attachment security

Attachments are stored in a private bucket; no object is ever public. The bucket enforces a 10 MB
size limit and the supported MIME allowlist (JPEG, PNG, WebP, GIF, PDF, plain text, Markdown).
HTML, SVG, executables, scripts, archives, audio, video, Office documents, and unknown MIME types
are rejected. Validation checks both the declared MIME type and the file extension in the browser
and again in the database; the browser `accept` attribute is treated as advisory only.

Uploads are authorized, not arbitrary. A member first reserves an attachment through
`create_message_attachment_upload`, which derives the uploader from `auth.uid()`, checks send
permission for the conversation, validates type and size, and fixes the single Storage path the
upload may use. Storage INSERT RLS permits a write only when the object name matches a pending
reservation owned by the caller, so a client cannot upload into another conversation, reuse another
user's upload, or choose its own path. `send_message` re-verifies, under the conversation lock,
that every attachment ID is owned by the sender, belongs to the conversation, is finalized, and is
unattached before linking at most four to a message. The idempotency hash includes the attachment
IDs, so a retry with a different attachment set is a conflict.

Attachment metadata is readable only by conversation members through RLS; unrelated and anonymous
users receive nothing. Message listing returns attachment metadata, never a permanent or public
URL. Images and documents are reached only through short-lived signed URLs (about ten minutes) that
are created on demand after a Storage SELECT RLS authorization check, cached in memory only, never
persisted, never written to logs, and never placed in Realtime payloads. The signed-URL cache is
keyed by attachment ID, expires before the server URL does, is evicted when a message is deleted,
and is cleared on sign-out.

Deleting a message clears its text, removes its reactions, and deletes its attachment metadata
rows. Because Storage SELECT RLS requires a live attached metadata row, every later signed-URL
request for that object fails, so deletion revokes access even though physical object cleanup is a
best-effort follow-up. Filenames are always rendered as text and never injected into HTML; image
alt text is the sanitized filename, not an invented interpretation of the image. No attached image
or file is interpreted by AI in this milestone.

## Realtime privacy

All Council channels are private and use exact deterministic UUID topics. Conversation receive
authorization derives from durable membership, while inbox authorization derives from
`auth.uid()`. Removed contacts and blocked participants remain authorized for their historical
conversation topic because they retain history access. Unrelated and anonymous users cannot join.

Browser roles cannot insert or update `realtime.messages`, and Council defines no Broadcast INSERT
policy. Durable events originate only from trusted database triggers. Production deployments must
disable Realtime public-channel access in project settings in addition to the application always
using `private: true`.

Broadcast payloads contain no message body, deleted content, reaction value, email, biography,
settings, block direction, availability cause, token, or free-form metadata. Availability events
are identical regardless of block, unblock, removal, or acceptance. Browser modules strictly
validate every event and never log payload contents or JWTs.

Realtime delivery is not trusted as durable or complete. Channel errors, timeouts, reconnection,
browser resume, network restoration, authentication refresh, missing sequence, or sequence gaps
require database reconciliation through the existing bounded RPCs.

## Messaging UI privacy and rendering

Message content is always rendered as plain text. The UI never uses raw HTML or
`dangerouslySetInnerHTML`, never renders arbitrary markdown, and never builds automatic rich
previews or executes embedded content. The only enrichment is linkifying bare `http(s)` URLs; those
anchors always carry `rel="noopener noreferrer"` and open in a new tab, and non-`http(s)` schemes
(such as `javascript:` or `data:`) are never turned into links. Long words, URLs, and line breaks
wrap inside the bubble without horizontal overflow, and the 8,000-character backend limit is
enforced in the composer and editor.

The messaging-unavailable state is generic. When sending is unavailable the UI shows only
"Messaging is currently unavailable for this conversation." and never discloses who blocked whom,
whether a block happened, whether contact status changed, or why availability changed. Access and
existence failures collapse to the same "This conversation is unavailable." screen, so a
nonexistent, inaccessible, or blocked conversation cannot be distinguished, and no error difference
reveals another conversation's existence. History stays readable after contact removal or blocking;
only sending, editing, and adding reactions are disabled, while a sender may still delete their own
messages and remove their own reactions where the backend permits.

Deleted content is removed from every visible client cache the moment deletion is authoritatively
confirmed: the tombstone (content `null`) replaces the row in the message cache, reactions are
cleared, and reply excerpts that pointed at the message render "Message deleted" rather than the
former content. Realtime event payloads are never logged, and all private messaging queries are
dropped from the cache on sign-out (`queryClient.clear()`), so no message content, preview, or
receipt state survives a session change. Realtime channels are torn down on conversation change,
route change, and logout.

## Mutation restrictions

Authenticated clients cannot directly insert, update, or delete contact relationships or block
rows. Cross-user actions are available only through explicit database functions that derive the
actor from `auth.uid()`. Profile and settings updates use column-level grants plus own-row RLS;
ownership IDs and creation timestamps are not client-writable.

Security-definer functions must use a fixed safe search path, qualify protected objects, expose
only minimal return shapes, and receive explicit execution grants. Anonymous execution is
revoked. Internal arbitrary-identity helpers are not executable by authenticated clients.

## Session and recovery handling

The Supabase browser client persists and refreshes sessions. Council does not manually store,
decode, log, or copy access and refresh tokens into React context, Zustand, or TanStack Query.
Protected content is withheld until initial session hydration and account queries finish.

Logout clears user-scoped query data only after the Auth operation succeeds. Current-session and
global logout use Supabase's supported scopes. Global logout revokes refresh sessions, while an
already-issued short-lived access token may remain valid until expiry.

Password-reset requests always display the same confirmation regardless of account existence.
Recovery links redirect only to configured Council URLs. The reset form requires either a
Supabase `PASSWORD_RECOVERY` event or an explicit password-change intent initiated from the
security screen; an ordinary authenticated session is not treated as recovery.

Navigation return paths are accepted only when they are internal `/app` or `/onboarding`
destinations. Absolute URLs, protocol-relative URLs, JavaScript URLs, and guest-route loops are
normalized to `/app`.

Auth and database provider errors are mapped to fixed user-facing categories. Raw SQL, stack
traces, sessions, verification links, and recovery tokens are never rendered or intentionally
logged.

## Local Auth testing

The Playwright admin helper executes only in Node test code and obtains local credentials from
`supabase status` at runtime. It refuses non-HTTP or non-loopback Supabase URLs before creating,
deleting, or generating links for test users. No service-role credential is committed or exposed
through a `VITE_*` variable.

## Logging

Logs must never contain full message bodies, images, complete prompts, stored memories,
authentication tokens, provider keys, Supabase secret keys, or tool secrets. Operational logs may
contain identifiers, error codes, token counts, latency, and estimated cost when those fields are
needed and appropriately retained.

## AI provider boundary

AI requests use application-owned OpenRouter credentials. DeepSeek is the primary language-model
family. A separate vision-capable model may receive an image only after the user attaches it
directly to an AI message or explicitly forwards it. AI features require a server-verified trial
or Pro entitlement.

### First AI contact (Task 009)

`OPENROUTER_API_KEY` and `OPENROUTER_TEXT_MODEL` are server-only and read only by the `ai-chat`
Edge Function; they are never placed in a `VITE_*` variable, returned to the browser, or logged. The
private system prompt lives in `ai_agent_prompt_versions`, which no browser role can read; only
service-role generation paths load it. Public agent identity (`ai_agents`) is the only AI metadata
exposed to authenticated users.

AI message and run creation never go through a public insert RPC. The browser cannot insert, update,
or delete AI messages, runs, or credit balances; assistant messages cannot be forged. All privileged
writes are performed by the Edge Function through service-role-only functions that derive nothing
sensitive from client input beyond the validated conversation id, client id, and bounded content.

Access is enforced server-side. A credit is reserved atomically before a generation and refunded
exactly once on provider failure (guarded so a balance can never inflate). The trial starts once,
expires after seven days, and is denied when exhausted or expired — the UI shows an honest message
and never a fake upgrade checkout. Only the service-role `admin_set_ai_credits` hook (future billing)
may change balances or Pro status.

Prompts, message content, responses, API keys, JWTs, and provider request bodies are never logged;
operational logs carry only run id, status category, model id, token counts, cost, and duration. Raw
provider errors are reduced to a fixed set of safe categories before reaching the browser. The
deterministic mock provider is for local automated tests only and refuses to run against a
non-local Supabase project. The local Playwright/edge test helpers refuse non-loopback Supabase URLs
and use no committed service-role secret.

### AI contacts and custom personas (Task 010)

Built-in contacts keep their private prompts in `ai_agent_prompt_versions`, which no browser role
can read. Custom personas (`ai_personas`) are owner-scoped by RLS: another user cannot discover,
read, edit, open, or chat with them, and anonymous access is denied. The owner's own instructions
are returned only to that owner for editing. All persona mutations go through narrow security-definer
RPCs; direct table mutation is denied. A conversation is bound to exactly one built-in agent or one
owned persona, and `start_ai_generation` re-verifies that binding (and ownership) on every
generation, so a conversation id cannot be used to reach another user's persona.

The provider prompt is assembled entirely on the server. The browser sends only the conversation id,
client id, and message content — never raw system instructions. Council's platform safety preamble
is always prepended and cannot be replaced or overridden by built-in prompts or custom instructions;
personas may shape style but cannot grant themselves access to human conversations, other users,
files, credentials, hidden prompts, nonexistent tools, or the internet, and the UI never claims such
capabilities. Archived personas keep their history readable but cannot start new generations until
restored.

### Transparent AI memory (Task 011)

AI memory is explicit and conversation-scoped. `ai_memories` has owner-only RLS, direct browser
mutation is denied, and narrow security-definer RPCs derive ownership from `auth.uid()`. The
database verifies conversation ownership, source-message scope and role, 500-character content,
and the 50-memory limit. Anonymous and cross-user access reveal no memory existence.

Memory mode is restricted to `curated` or `conversation_only`. Curated rows are loaded server-side
after platform/contact/style instructions and are marked unable to override platform rules.
Conversation-only mode does not retrieve them. Hard deletion removes memory from future context;
clearing memory does not clear history. Memory content is excluded from logs, analytics, runtime
metadata, and browser-visible assembled prompts. Sign-out clears memory query caches.

### Private AI images (Task 012)

AI images use the private `ai-chat-images` bucket and owner-scoped metadata. The browser reserves a
validated path through a narrow RPC, uploads only to that path, and finalizes before generation.
RLS denies metadata and object access to other users and anonymous callers. Signed URLs are
short-lived, memory-only, conversation-keyed, and cleared on sign-out.

The Edge Function rechecks ownership/state/count/size, downloads bytes with trusted access,
validates MIME signatures, computes SHA-256, and sends base64—not a signed URL—to the configured
vision provider. Structured analyses are browser-inaccessible, user-scoped cache rows and are never
logged or treated as memory. Generation payload hashes include sorted attachment IDs; provider
failures refund the single reserved credit exactly once.

### Confirmed human-message forwarding (Task 013)

The AI never becomes a member of a human conversation. A forwarding user must explicitly select
active text messages, review the exact package, choose an owned AI destination, and confirm.
`start_ai_generation` re-authorizes source membership and destination ownership, fetches source
content server-side, sorts it chronologically, derives only `You` or a safe display label, and
copies no email, settings, block state, reaction, deleted content, attachment metadata, image, or
file content.

`ai_context_imports` and `ai_context_import_items` are owner-only under RLS; browser roles have
read-only access to their own snapshots and no direct mutation grants. The other human participant
gets no access to the import, AI conversation, run, or response. Copied item updates are rejected,
so later source edits or deletion do not silently rewrite confirmed provenance. Request UUIDs bind
the destination, selection, and instruction; exact retries replay without another credit, while
changed payloads conflict.

Forwarded text is plain untrusted quoted context. Platform and persona instructions retain
precedence, copied content is not automatically written to memory, assembled prompts are not
returned, and copied text is excluded from operational logs. PDF/document analysis and all
attachment forwarding remain deferred until the end of the project.

## Disclosure and assurance

A responsible-disclosure process and monitored security contact must be established before
production launch. Until then, security reports should be directed privately to the repository
owner.

Council has not received an independent security audit and is not production-ready.
