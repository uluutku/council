# Mobile 001 Flutter Application

Baseline: `f2e784d81ac8bb1917d95dc759b4471d81f4e3cb`.

Implemented a Flutter mobile app in `apps/mobile` using the existing Council Supabase backend.
Android and iOS projects are generated. Android local validation is supported on Windows; iOS
build validation is deferred to a macOS host.

Important decisions:

- One backend only: Supabase Auth, RLS, RPCs, Storage, Realtime, and `ai-chat`.
- Client-side secrets are limited to public Supabase configuration.
- Local mobile data is user-scoped and cleared on sign out.
- Realtime remains a hint and screen state refreshes through authoritative RPC reads.
- Production push delivery remains blocked by external Firebase/APNs credentials.

Follow-up mobile parity fixes:

- Theme, privacy, notification, and chat-background settings now read and write the existing
  `user_settings` row through the same `user_id` contract used by web.
- The app shell now applies saved theme mode instead of forcing system theme.
- Discover search now runs live with debounce against the existing profile search RPC.
- Built-in AI contacts now render as public metadata cards with tone tags, avatar handling, and
  provider disclosure.
- AI conversations now preserve backend `avatar_key`, `updated_at`, and `last_message_at`, and
  appear in the Chats tab under AI chats.
- Human and AI message bubbles now use Council indigo, neutral incoming surfaces, and AI accent
  surfaces aligned with the web design tokens.
- AI conversation ordering now follows the backend chronological order without client reversal,
  and AI sends render an immediate optimistic user bubble plus thinking/typing indicators until
  the streamed assistant response is reconciled.
- Shared animated mobile panels, list rows, status pills, and empty states now cover Chats, AI,
  Contacts, Artifacts, Profile, and Settings.
- Blocked users now use `list_my_blocked_users` and `unblock_user` instead of a placeholder screen.
- Message search now calls `search_my_conversations` and `search_my_messages`.
- Artifacts now include mobile search, type filtering, archive/restore, native sharing, version
  save, and unsaved-change protection on the existing artifact RPCs.
- Appearance settings now show live previews for `clean`, `grid`, `paper`, and `midnight` chat
  backgrounds before saving through `update_my_settings`.
