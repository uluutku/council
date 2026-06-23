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
- `--ai-accent`, `--ai-accent-soft`, `--ai-accent-contrast`
- `--success`, `--success-soft`, `--warning`, `--warning-soft`, `--danger`, `--danger-soft`,
  `--info`, `--info-soft`
- `--message-incoming`, `--message-outgoing`, `--message-outgoing-text`
- `--focus-ring`, `--selection`

### Color palette (final values)

The palette is a neutral slate/graphite foundation with a single restrained indigo Council accent
(matching the product's auth/marketing direction). Status colors carry a paired muted `-soft`
background for chips, banners, and inline notices. AI identity uses a calm steel-blue
(`--ai-accent`) that is deliberately distinct from the indigo action accent so AI and human
surfaces never read as the same thing.

| Token                          | Light                 | Dark / System         |
| ------------------------------ | --------------------- | --------------------- |
| `--background`                 | `#e9edf1`             | `#0f1318`             |
| `--surface`                    | `#f7f9fb`             | `#161b21`             |
| `--surface-elevated`           | `#ffffff`             | `#1d242b`             |
| `--surface-hover`              | `#eef2f6`             | `#232b33`             |
| `--surface-active`             | `#e3eaf1`             | `#28383b`             |
| `--surface-muted`              | `#f1f4f7`             | `#12161b`             |
| `--text-primary`               | `#161b22`             | `#e9eef2`             |
| `--text-secondary`             | `#515a66`             | `#aeb8c2`             |
| `--text-tertiary`              | `#6c7682`             | `#828d98`             |
| `--border`                     | `#d6dde5`             | `#2a323b`             |
| `--border-strong`              | `#b5bfca`             | `#3f4a55`             |
| `--divider`                    | `#e5e9ef`             | `#222a31`             |
| `--accent`                     | `#4f46e5`             | `#8c88f7`             |
| `--accent-hover`               | `#4338ca`             | `#a5a1fb`             |
| `--accent-soft`                | `#e7e6fb`             | `#2a2756`             |
| `--accent-contrast`            | `#ffffff`             | `#131233`             |
| `--ai-accent`                  | `#3a6aa3`             | `#7fa6d6`             |
| `--ai-accent-soft`             | `#e0e8f3`             | `#1c2738`             |
| `--success` / `--success-soft` | `#1d7a49` / `#dcefe3` | `#6fc795` / `#15291d` |
| `--warning` / `--warning-soft` | `#92600f` / `#f5ead2` | `#e0ad62` / `#2c2414` |
| `--danger` / `--danger-soft`   | `#b23a3a` / `#f6e1e0` | `#ef8a8a` / `#342020` |
| `--info` / `--info-soft`       | `#2f6aa3` / `#dde8f3` | `#84b4e6` / `#16222f` |
| `--message-incoming`           | `#ffffff`             | `#1e252c`             |
| `--message-outgoing`           | `#e4e2fb`             | `#302c61`             |
| `--message-outgoing-text`      | `#1f1b4d`             | `#eae9fb`             |
| `--focus-ring`                 | `#6366f1`             | `#8c88f7`             |
| `--selection`                  | `#e7e6fc`             | `#2a2756`             |

Rules:

- The indigo `--accent` is the only brand action color. White (`--accent-contrast`) text on
  `--accent` and dark text on the lightened dark-mode accent both clear WCAG AA for UI text.
- Navigation and collection-row selected states are soft tints (`--accent-soft`, `--selection`),
  never a full saturated fill.
- The outgoing message tint is intentionally low-saturation so long bubbles never glare.
- Status backgrounds always use the `-soft` token; never tint with ad-hoc `color-mix` per surface.
- AI identity color is `--ai-accent`; per-agent avatar hues remain derived but must stay muted.
- Dark mode uses layered slate surfaces (`#0f1318` → `#1d242b`), never pure black, and lightened
  (not glowing) accents.

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

Shared primitives (all token-based, light + dark):

- `MessengerShell`, navigation rail, mobile bottom navigation.
- `MessagingLayout` / collection-panel model — also adopted by the AI area (`AiLayout`) so AI and
  human messaging share the resizable collection panel + content panel by construction.
- `IconButton`, route skeletons, messaging empty / error / skeleton states.
- Buttons: `.button`, `.button--secondary`, `.button--small`, `.button--full`, `.button--danger`
  — consistent sizing/radius, token fills with `--accent-contrast` text, hover/active/disabled and
  `:focus-visible` states. Inside `.primary-navigation`, `.button` keeps its own contrast (the nav
  link color rule is scoped with `:not(.button)`).
- Forms: `.form-field` (input/textarea/select/label/help), invalid + focus states, `.form-status`
  with `-soft` tone backgrounds for error/success/info/neutral. Checkboxes use `accent-color`.
- Panels/cards `.panel`, dialogs (`.dialog-overlay`/`.dialog-panel`/`.dialog-actions`), and
  surface list rows shared across contacts, artifacts, AI, and settings.

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
restrained indigo Council accent. Dark theme uses layered dark neutral surfaces rather than pure
black, with muted text tuned for readability and non-glowing accents.

The public authentication experience (login, register, recovery) is a full-screen split: a calm
indigo-tinted marketing panel on the left and a focused auth card on the right, framed by a shared
top bar and footer (`AuthLayout`). The marketing panel is decorative and collapses on narrow
viewports, leaving the centered card.

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

## Known inconsistencies (reserved for final cross-product polish)

These are intentionally deferred to the final whole-product polish pass; none break the build,
tests, or the desktop experience:

- **AI mobile model.** On phones the AI area shows the assistant catalogue (content panel) at the
  `/app/ai` index and hides the conversation-list collection panel, so a phone user can browse and
  start an assistant instead of an empty list. The trade-off is that the AI conversation list is
  not shown on mobile at the index — a "recent AI chats" affordance could be added later.
- **Content-page heading scale.** Artifacts still uses a larger heading than the compact headers on
  contacts/settings. Harmonize the content-page (`.app-page`) heading scale across surfaces.
- **`.auth-heading h1` shares a selector group** with `.settings-section h1` / `.app-page h1` at a
  marketing scale; auth/onboarding scope a more specific override. Split the combined selector so
  app and settings headings get their own scale.
- **`.error-state` is shared** by contacts and the messaging region; the later messaging rule adds
  messaging-specific margins that win on contacts pages. Rename per-surface or drop `.error-state`
  from the messaging selector list.
- **Composer attachment chips** (`.attachment-draft` / `.attachment-rejections`) are shared between
  the AI composer and the messaging composer; reconcile to one token-based definition.
- **`.form-status` soft-banner** treatment is currently scoped to `.auth-card`. Consider promoting
  the soft-background status banner to the shared `.form-status` selector everywhere.
- **Code-block surface.** `.ai-code-block` / artifact code uses a fixed dark editor surface in both
  themes by design (a code block should read as an editor). If a `--code-surface` / `--code-text`
  token pair is later added, swap the fixed hex values for it.
- **Route-focus outline.** `useRouteFocus` moves focus to the page heading on navigation; the
  `:focus-visible` ring is prominent on headings. Consider a softer programmatic-focus treatment.
