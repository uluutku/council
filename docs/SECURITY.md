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

Message media will use private Storage buckets. Access must be checked before short-lived signed
URLs are created. Milestone 0 does not create buckets or policies.

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

## Disclosure and assurance

A responsible-disclosure process and monitored security contact must be established before
production launch. Until then, security reports should be directed privately to the repository
owner.

Council has not received an independent security audit and is not production-ready.
