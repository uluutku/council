# Task 020: Messenger UI Foundation and Human Messaging Redesign

Task 020 begins the frontend redesign. It adds no backend features and does not re-enable hosted CI.

## Audit Notes

Existing styling system:

- The web app uses one global CSS file with CSS custom properties, feature class names, and a
  persisted light/dark/system theme controller.
- Tailwind, shadcn, Radix, and an icon library are not established.
- Layout, component, dialog, message, AI, contact, settings, and artifact styles currently share
  the same global namespace.

Components that can be retained:

- Messaging data hooks, Supabase API wrappers, realtime subscriptions, cache reconciliation,
  optimistic send handling, attachment draft handling, typing, presence, receipts, search, and
  privacy-safe error mapping.
- Existing dialog behavior for confirmation and forwarding while broader primitive work remains
  deferred.
- Human message plain-text rendering and safe link tokenization.
- Existing AI, artifacts, contacts, and settings feature components as route content inside the
  new shell.

Components that should be replaced or reshaped:

- `AuthenticatedLayout` should become a full-height application shell with an icon-first
  navigation rail and mobile navigation rather than a top navigation bar.
- `MessagingLayout` should become a messenger-style shell with a collection panel, resizable
  desktop inbox, and single-panel mobile behavior.
- `ConversationPage.jsx` should stop owning all orchestration state directly and delegate
  controller, dialog, and selection responsibilities to focused hooks.
- Conversation list rows, conversation header, timeline, bubbles, composer, and shared
  loading/empty/error states need visual redesign.

New shared primitives needed:

- Messenger shell, navigation rail, mobile navigation, collection panel, content panel, route
  skeleton, icon button, empty state, and compact status banner.
- Design tokens for surface hierarchy, text hierarchy, borders, accent, message bubbles, spacing,
  radius, shadow, typography, motion, panel widths, header height, composer sizing, avatars, and
  touch targets.

Main layout problems:

- Authenticated pages use browser-level scrolling and a top app header, which prevents a true
  daily-use messenger frame with independently scrolling panels.
- Messaging uses a fixed two-column grid inside padded page content rather than occupying the full
  viewport.
- Conversation and inbox panes do not share a reusable shell with AI, artifacts, contacts, and
  settings.
- Desktop empty state is visually generic and does not communicate a messenger workspace.

Accessibility problems found:

- Navigation is text-heavy and lacks icon-button tooltip affordances for a rail layout.
- Some icon-like controls are text buttons in dense rows, making the information hierarchy noisy.
- Route loading falls back to whole-page behavior rather than local skeletons.
- Message action controls depend heavily on hover visibility, though focus-within is present.

Responsive problems found:

- Narrow messaging routes switch panes, but the authenticated shell still has a compact top nav
  rather than a dedicated mobile app navigation model.
- The composer and message region are constrained by page padding and inherited app-content sizing.
- Collection panel width is fixed and not user-adjustable on desktop.
- The current shell risks page-level scroll in authenticated areas instead of panel-owned scroll.

## Implementation Record

Implemented scope:

- Added Council semantic design tokens for surfaces, text, borders, accent, message bubbles,
  spacing, radius, shadows, type, motion, panel widths, header height, composer sizing, avatars,
  touch targets, focus, and selection.
- Added `docs/DESIGN_SYSTEM.md` with token, layout, component, responsive, accessibility, theme,
  primitive, and "no AI slop" rules.
- Added `lucide-react` as the single icon family for the redesigned shell and messaging actions.
- Replaced the authenticated top navigation with `MessengerShell`, an icon-first navigation rail
  and mobile bottom navigation.
- Redesigned `MessagingLayout` as a collection panel plus content panel, with a locally persisted
  resizable desktop conversation list.
- Redesigned conversation rows with stable height, selected/hover/focus states, unread/mute
  indicators, timestamp hierarchy, presence text, and attachment/deleted previews.
- Redesigned the conversation header, message timeline background, grouped bubble styling, date
  separators, jump-to-latest button treatment, and composer surface.
- Extracted conversation orchestration into `useConversationController`,
  `useConversationSelection`, and `useConversationDialogs`.
- Added route-level lazy loading for major authenticated areas with local skeletons.
- Added optional local UI review tooling through `npm run ui:review`, writing screenshots only to
  `.local-test-results/ui-review/`.
- Added focused tests for shell navigation and resizable collection panel bounds.

Preserved behavior:

- Database contracts, RLS, realtime reconciliation, message idempotency, attachment authorization,
  search authorization, typing authorization, presence privacy, notification privacy, Premium
  logic, AI runtime, and local-only verification policy.
- Human messages remain plain text with safe `http(s)` linkification only.

Known limitations:

- AI, artifacts, contacts, and settings now sit inside the new shell but are not deeply redesigned
  in this task.
- Dialogs remain existing custom components; a broader accessible primitive pass is deferred.
- The local screenshot review command is for human inspection, not pixel-perfect regression
  gating.
