# Task 004: User Discovery and Contact Management UI

## Objective

Implement Council's complete web experience for discovering users, sending and answering contact
requests, managing accepted contacts, and blocking/unblocking, built on the Task 002 database
contracts. No conversations or messaging.

## User story

As a Council user, I can find people, send and respond to contact requests, see my contacts and
pending requests, remove a contact, block or unblock a user, and trust that nobody can tell I
blocked them.

## Context

Task 003 was verified and committed as the checkpoint `8b9f62a` (parent `03632f0`). This task
reuses the existing social database functions and adds one narrow read function for the
blocked-users screen.

## In scope

- contact routes: `/app/contacts`, `/app/contacts/discover`, `/app/contacts/requests`, and
  `/app/settings/blocked`
- a focused contacts feature area (api, queries, components, pages, hooks, utils)
- Supabase wrappers for the eight existing social functions plus `list_my_blocked_users`
- a new `list_my_blocked_users` database function, grants, and pgTAP tests
- extended shared schemas and their tests
- discovery with a two-character minimum, ~300 ms debounce, and stale-result safety
- request, accept, reject, remove, block, and unblock flows with accessible states
- a pending incoming-request count in navigation
- unit, component, and multi-user local-Supabase Playwright coverage

## Out of scope

Conversations, messages, inbox, chat UI, Realtime, typing/read receipts, Storage/avatar uploads,
billing, AI, groups, request cancellation, OAuth, MFA, account deletion, and admin UI.

## Locked decisions

Presentational components never call Supabase directly. All cross-user mutations run through the
`auth.uid()`-scoped database functions. Discovery uses the bounded `search_profiles` RPC, never a
table scan. TanStack Query owns server state under stable `contacts.*` keys; no contact data is
duplicated into Zustand. Blocking is never disclosed to the blocked user. Realtime is deferred.

## Database changes

Added `20260621230000_add_list_my_blocked_users.sql`. `list_my_blocked_users()` is a stable
security-definer function returning `id`, `username`, `display_name`, `avatar_path`,
`status_text`, and `blocked_at` for the caller's own block rows only. It derives identity from
`auth.uid()`, uses `set search_path = public, pg_temp`, revokes default execution from `public`,
`anon`, and `authenticated`, and grants execute only to `authenticated`. No existing migration was
modified and no profile policy was weakened. A migration was required because profile RLS hides
blocked pairs from each other, so a plain profile join cannot back the screen.

## Implementation summary

- Shared schemas (`packages/schemas`): added `contactRelationshipSchema`, `contactListItemSchema`
  /`contactListSchema`, `contactRequestItemSchema`/`contactRequestListSchema`,
  `profileSearchResultSchema`/`profileSearchResultsSchema`, `blockedUserItemSchema`/
  `blockedUserListSchema`, `contactActionOutcomeSchema`/`contactActionResultSchema`, and
  `contactSearchFormSchema`, with `.strict()` objects so unexpected fields (including any email)
  are rejected.
- API wrappers (`features/contacts/api/contactsApi.js`): `searchProfiles`, `sendContactRequest`,
  `respondContactRequest`, `removeContact`, `blockUser`, `unblockUser`, `listMyContacts`,
  `listMyContactRequests`, and `listMyBlockedUsers`. Each validates its response and throws the
  raw error for mapping. `sendContactRequest` derives a `request_sent` / `now_contacts` /
  `already_contacts` outcome from the returned relationship row and an optional known-contact hint.
- Error mapping (`utils/contactErrors.js`): maps SQLSTATEs and messages to fixed categories; the
  block and privacy rejections collapse to one generic "not available" message.
- Queries/mutations: `queries/contactQueries.js` query options and `queries/contactMutations.js`
  mutation hooks with precise invalidation; `lib/query-keys/contacts.js` for stable keys;
  `hooks/useDebouncedValue.js` and `hooks/usePendingRequestCount.js`.
- Components: `ContactAvatar`, `ContactStatusBadge`, `ContactActionMenu`, `ConfirmDialog`
  (focus-trapping, Escape-closing, focus-restoring), `RemoveContactDialog`, `BlockUserDialog`,
  `UnblockUserDialog`, `ContactCard`, `ContactList`, `ContactSearchResult`, `ContactRequestCard`,
  and shared loading/error/empty feedback.
- Pages: `ContactsPage`, `DiscoverContactsPage`, `ContactRequestsPage`, `BlockedUsersPage`, plus a
  `ContactsLayout` sub-navigation. Router and the authenticated/settings navigation were updated;
  the Contacts nav shows the pending incoming-request count.

## Decisions and deviations

- Discovery exposes only a coarse `relationship_status` (`accepted`, `pending`, `rejected`, or
  none), so a pending result is shown as "Request pending" and directed to the Requests page
  rather than inventing an incoming/outgoing direction the contract does not provide.
- Outgoing requests are view-only. The database defines no request cancellation, so none was
  added; `remove_contact` was not overloaded for pending requests.
- The optional `/app/contacts/:userId` detail route was not added; it would have been a
  placeholder only.
- `ContactActionMenu` is a labelled button group rather than a popup menu so every action is
  directly reachable by keyboard.
- A browser-safe placeholder Supabase URL/key was added to the Vitest config so the client can be
  constructed under jsdom; tests still mock the API modules and never reach the network.

## Deferred work

Conversations and messaging, Realtime-backed counts and presence, Storage/avatars, request
cancellation, and reporting remain deferred.

## Results

- `npm run supabase:reset`: pass.
- `npm run db:test`: pass, 201 assertions across 8 files (was 190; +11 for
  `list_my_blocked_users`).
- Supabase schema lint: clean.
- `npm run check`: pass (shared schemas 42 tests, web unit/component 102 tests, production build
  succeeds).
- `npm run test:e2e`: pass, 7 Playwright tests (smoke, auth/account, and 5 contact scenarios).
