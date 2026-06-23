# Design System

Council uses a restrained messenger design system built on semantic CSS custom properties and
plain React components. Tailwind and a full component-library migration are not part of the current
frontend architecture.

## Tokens

Core semantic color tokens:

- `--background`, `--surface`, `--surface-elevated`, `--surface-hover`, `--surface-active`,
  `--surface-muted`
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-inverse`
- `--border`, `--border-strong`, `--divider`
- `--accent`, `--accent-hover`, `--accent-soft`, `--accent-contrast`
- `--success`, `--warning`, `--danger`, `--info`
- `--message-incoming`, `--message-outgoing`, `--message-outgoing-text`
- `--focus-ring`, `--selection`

Layout and interaction tokens:

- Spacing: `--space-1` through `--space-6`
- Radius: `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`
- Shadow: `--shadow-sm`, `--shadow-md`
- Type: `--font-size-xs`, `--font-size-sm`, `--font-size-md`, `--font-size-lg`
- Motion: `--motion-fast`, `--motion-normal`
- Shell: `--nav-rail-width`, `--collection-panel-width`, `--header-height`
- Messaging: `--composer-min-height`, `--avatar-sm`, `--avatar-md`, `--touch-target`

Legacy aliases such as `--color-background`, `--color-surface`, `--color-text`, and
`--color-border` remain mapped to the semantic tokens so older feature surfaces continue to work
while they are redesigned.

## Layout

Authenticated routes render inside a full-height application shell:

- Desktop: navigation rail plus a content area.
- Messages: navigation rail, resizable collection panel, and main conversation panel.
- Mobile: one panel at a time, with bottom navigation and route-preserving back behavior.

The message collection panel defaults near 368 pixels and is clamped between 300 and 480 pixels.
Its preferred width is stored locally. Each application panel owns its own scrolling; authenticated
pages should not rely on browser-level page scrolling.

## Components

Approved shared primitives for this phase:

- `MessengerShell`
- `IconButton`
- `MessagingLayout` collection/content panels
- Route skeletons
- Messaging empty, error, and skeleton states
- Existing confirmation and forwarding dialogs

`lucide-react` is the single icon family. Icons are decorative unless an icon-only control uses an
accessible label. Do not mix icon packs.

## Messaging Rules

Conversation rows must keep a stable height and reserve room for unread and mute indicators so
badges do not cause layout jumps. Human message content remains plain text with safe `http(s)`
linkification only. Markdown is not enabled for human messages.

Message bubbles use compact padding, moderate radii, and subtle grouped-corner changes for adjacent
messages from the same sender. Outgoing and incoming messages are distinct through semantic message
tokens, not loud gradients or novelty styling.

The composer is part of the conversation surface, not a detached decorative capsule. It keeps the
attachment action, multiline input, reply preview, upload state, retry/error feedback, Enter to
send, Shift+Enter newline, IME safety, and Escape reply cancellation.

## Responsive Model

Supported breakpoint behavior:

- Wide desktop: rail, collection panel, and main content are visible.
- Compact desktop/tablet: rail remains, collection panel stays usable, and message text does not
  shrink unnaturally.
- Narrow/mobile: inbox and conversation are separate route-driven views; the conversation header
  shows a back action; safe-area insets are respected.

Avoid horizontal overflow, squeezed three-column mobile layouts, and page-level scrollbars inside
the authenticated application.

## Themes

Light theme uses soft neutral application backgrounds, clear panels, hairline dividers, and a
restrained teal Council accent. Dark theme uses layered dark neutral surfaces rather than pure
black, with muted text tuned for readability and non-glowing accents.

All new components should use semantic tokens. Do not hardcode unrelated colors in feature
components.

## Accessibility

Required:

- Semantic navigation and headings.
- Visible focus rings on keyboard navigation.
- Icon-only controls with accessible labels and titles.
- Touch targets generally at least 40 to 44 pixels.
- Screen-reader-friendly unread labels without duplicate announcements.
- Stable empty/error/loading states that do not shift major layout.
- Reduced-motion support through `prefers-reduced-motion`.

Messaging updates should be announced sparingly. Do not announce every realtime token or every AI
stream chunk through live regions.

## No AI Slop

Avoid generic AI-app visual language:

- No purple glow or neon borders.
- No oversized marketing typography inside the app shell.
- No decorative bento grids, fake dashboards, glass cards, or excessive blur.
- No random pill shapes where a standard icon or compact control is clearer.
- No generated illustrations for core messenger states.

Council should look like a serious daily communication product.
