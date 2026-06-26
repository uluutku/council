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
