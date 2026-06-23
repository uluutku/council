# Task 007: Inbox and Realtime Text Chat Interface

## Objective

Implement Council's complete human text-messaging frontend on top of the Task 005 database and the
Task 006 Realtime foundation: an inbox, direct-conversation creation from contacts, a conversation
screen with paginated history, optimistic and idempotent sending, replies, editing, deletion,
reactions, derived delivery/read display, unread counts, realtime synchronization with gap and
reconnect reconciliation, messaging-unavailable privacy, a responsive desktop/mobile-web layout,
accessibility, and unit, component, and Playwright tests. No Storage, media, typing, presence,
notifications, billing, AI, or group chat was added, and no disabled controls advertise them.

## Initial verification (Task 006 baseline)

Task 006 commit `a18fc96` was confirmed committed with a clean tree. The full baseline passed
before any change:

- `npm run supabase:reset`: PASS
- `npm run db:test`: PASS, 450 assertions over 14 files
- `npm run test:concurrency`: PASS
- `npm run check`: PASS (shared schemas + 154 web tests + production build)
- `npm run test:e2e`: PASS, 7 scenarios

## Routes and navigation

Added under the authenticated shell:

```text
/app/messages                    inbox (list pane) + active conversation pane
/app/messages/:conversationId    a single direct conversation
```

`MessagingLayout` renders the conversation list in a sidebar and the active conversation through an
`<Outlet/>`. A `data-view` attribute (derived from the route param) drives a desktop split view and
full-screen conversation routing on narrow screens. The conversation id is validated as a UUID; an
invalid or inaccessible id renders the same generic "This conversation is unavailable." screen. The
authenticated header gained a Messages link with an accessible unread badge derived from the inbox
query, and the home dashboard copy was updated. Accepted contacts gained a Message action that calls
`create_or_get_direct_conversation` and navigates to the conversation, passing the known peer and
`can_send` via router state for an immediate header.

## Frontend architecture

- `features/messaging/api`: existing wrappers (`messagingApi.js`, `messagingErrors.js`) plus a new
  user-facing `messagingErrorMessages.js` that collapses every availability/access cause into two
  generic messages.
- `features/messaging/utils`: message flatten/de-dup, safe text tokenization (plain text +
  `http(s)` linkify only), date/time formatting, receipt derivation, reaction summarization, and
  peer identity helpers.
- `features/messaging/queries`: infinite-query option factories for the inbox and per-conversation
  history, plus centralized cache helpers (`messageCache.js`, `conversationCache.js`).
- `features/messaging/hooks`: `useConversations`, `useConversationMessages`,
  `useConversationRealtime`, `useInboxRealtime`, `useSendMessage`, `useMessageMutations`,
  `useConversationReceipts`, `useConversationSummary`, `useUnreadCount`, `useStartConversation`.
- `features/messaging/components`: conversation list/item, header, message list/bubble, composer,
  actions, reaction picker/chips, reply preview, edit form, deleted/tombstone, unavailable banner,
  realtime status, date separator, optimistic message, skeleton/feedback.
- `features/messaging/pages`: `InboxPage` (desktop placeholder pane) and `ConversationPage`.

TanStack Query owns all messaging server state; optimistic outgoing state lives in `useSendMessage`,
never in the query cache. No messaging state was placed in Zustand.

## Inbox and pagination

The inbox is a keyset-paginated infinite query ordered by `(updated_at, id)` exactly as
`list_my_conversations` returns it; ordering is never recomputed from event arrival. Items show peer
initials/name, optional username, last-message preview ("Start the conversation", "Message deleted",
or a "You:"-prefixed excerpt; deleted text is never exposed), timestamp, unread count, selection,
and a messaging-unavailable hint. A bounded "Load more" control pages further. Realtime inbox events
invalidate the list rather than reordering locally.

Message history is an infinite query: the newest page loads first and older windows page in with an
exclusive `before_sequence` cursor. Pages are flattened, de-duplicated by id, and sorted ascending.
Initial open scrolls to newest; own sends and near-bottom incoming messages scroll to bottom;
otherwise a "new messages" indicator appears; loading older messages preserves scroll position.

## Optimistic send and reconciliation

Each send generates a client UUID used as the backend idempotency key. On success the authoritative
row is written into the message cache and the optimistic placeholder is removed, so the realtime
echo and any refetch converge to exactly one message (de-duplicated by id). A failed send stays
visible with retry/remove controls; retry reuses the same client id and payload. Optimistic messages
are never marked delivered or read.

## Realtime integration

`useInboxRealtime` runs at the shell level and invalidates the conversation list on validated inbox
events (and contacts + the affected conversation on availability changes). `useConversationRealtime`
subscribes to the active conversation: message/reaction events trigger targeted invalidation of the
message query, peer receipt events update outgoing-receipt state, availability events refresh inbox
and contacts without inferring a cause. Sequence gaps are assessed with the Task 006 helper, and the
window is refetched on (re)subscribe, focus/visibility resume, and after any gap, so offline-missed
messages reconcile on reconnect. Malformed events are dropped by the transport layer; payloads are
never logged. Channels are torn down on conversation change, route change, and logout.

## Replies, editing, deletion, reactions

Replies attach to active or deleted messages, show an author + short excerpt (or "Message deleted"),
and jump to a loaded target; an unloaded target shows a safe unavailable state. Editing is inline at
the message (a small justified deviation from a composer edit-mode): non-blank/length validated,
saved through `edit_message`, shows "edited", preserves the original on failure, and is suppressed
when messaging becomes unavailable. Deletion is confirmed, allowed even when messaging is
unavailable, replaces content with a tombstone, clears reactions, and keeps linked replies. The
reaction set is `👍 ❤️ 😂 😮 😢`; adds are blocked when unavailable while removing an existing own
reaction stays allowed, and `reaction.changed` reconciles via refetch.

## Receipts

`useConversationReceipts` advances the caller's own delivered/read monotonically and debounced:
delivered whenever an open conversation has reconciled messages, read only while active and visible.
The peer's read/delivered sequences are learned from realtime receipt events, so the newest outgoing
message shows one derived indicator: Sent, then Delivered, then Read. Advancing read patches the
inbox cache so the unread badge clears without a
refetch.

## Messaging-unavailable privacy

History stays readable after contact removal or blocking. When sending is unavailable the composer
is replaced by a single generic banner; editing and adding reactions are disabled while deletion and
own-reaction removal remain. The banner and the access-error screen never disclose blocking,
direction, contact-status change, or cause. Reaccepting a contact restores the composer and reuses
the existing conversation.

## Accessibility and responsiveness

Reuses the existing design tokens and theme. The conversation list uses navigation/link semantics
with an accessible per-conversation name including unread; the message list is a labelled live
region announcing additions politely without stealing focus; the composer and edit form are
labelled; message actions and reactions are keyboard-accessible buttons with emoji + count labels;
the delete dialog traps and restores focus; page titles change per route/conversation; focus is
placed on the conversation header on open. The layout is a desktop split view and full-screen
conversation routing on narrow screens with safe-area padding, no horizontal overflow, and
reduced-motion support.

## Regression fixed

`realtime/subscription.js` was made synchronous (create channel, register handlers, refresh auth
without blocking, subscribe, and return the handle immediately). The previous `await setAuth()`
before channel creation prevented synchronous teardown, so React StrictMode's mount/unmount/mount
cycle in development left two channels joining the same private topic and wedged the subscription
("Connecting…" forever). The two realtime hooks and the two transport unit-test mocks were updated
to the synchronous contract; the Task 006 realtime unit tests (which `await` the call) continue to
pass because awaiting a plain object is a no-op. Production behavior is unchanged.

## Tests added

- Shared/unit utility tests: safe text rendering, message-page helpers, datetime, receipts,
  reactions, peer helpers, and the generic error map.
- Component tests: conversation list, composer, the contacts Message action.
- Conversation-page integration tests over an in-memory server model: rendering, access/unavailable
  states, optimistic send + realtime-echo de-dup, failed-send retry with the same client id,
  edit/delete (with confirmation/tombstone), reactions, and unavailable behavior.
- Realtime-hook tests: subscribe/cleanup, reconcile-on-subscribe, targeted invalidation, peer-only
  receipts, ignoring other conversations, unmount cleanup, conversation-switch resubscribe.
- Playwright: nine multi-user scenarios (create/send/unread/read, realtime delivery + replies,
  failed-send retry/idempotency, replies linked through edit/delete, reactions, contact removal,
  blocking privacy, reacceptance reuse, reconnection reconciliation).

Web unit/component tests grew from 154 to 203. Playwright grew from 7 to 16 scenarios.

## Database scope

No migration was needed; the UI is built entirely on the Task 005/006 contracts. No existing
migration was modified.

## Final results

- `npm run supabase:reset`: PASS
- `npm run db:test`: PASS, 450 assertions
- `npm run test:concurrency`: PASS
- `npm run check`: PASS (shared schemas + 203 web tests + production build)
- `npm run test:e2e`: PASS, 16 scenarios (7 existing + 9 new)
- Supabase schema lint: PASS

## Decisions and deviations

- Editing is inline at the message rather than a composer edit-mode; both are accessible and the
  composer stays focused on new messages and replies.
- The conversation header peer identity and `can_send` come from the inbox summary, paging the
  bounded inbox list to locate a conversation opened by direct URL; navigation state provides an
  immediate header when arriving from Contacts or the inbox.
- Sign-out clears the entire query cache (`queryClient.clear()`) so no private messaging data
  survives a session change.
- The unread badge and inbox-derived unread count are bounded by the pages the inbox has loaded.

## Deferred / out of scope

Typing indicators, presence/online status, push or browser notifications, attachments/media/voice,
avatar uploads, group chats, AI contacts, billing, and end-to-end encryption remain unimplemented
and are not advertised in the UI.

## Known issues

None outstanding. Realtime e2e scenarios depend on local Supabase Realtime and Docker; they pass in
parallel but use single-worker-friendly waits and generous timeouts for reconnection.
