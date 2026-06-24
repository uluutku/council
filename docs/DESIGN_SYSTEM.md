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

### Color Palette

Council supports light and dark appearance modes. The light palette follows `DESIGN.md` and the
designer chat export: a pale lavender surface system, Primary Indigo for global actions,
navigation, and outgoing chat bubbles, Human Blue as a secondary/informational color, and AI Violet
for synthetic intelligence touchpoints. The dark palette is implemented as semantic token
overrides, preserving the same information hierarchy with layered charcoal surfaces, softened
borders, and premium lavender accent values that stay calmer than the light-mode indigo.

| Token                          | Value                 |
| ------------------------------ | --------------------- |
| `--background`                 | `#fbf8ff`             |
| `--surface`                    | `#fbf8ff`             |
| `--surface-elevated`           | `#ffffff`             |
| `--surface-hover`              | `#f9fafb`             |
| `--surface-active`             | `#e7e7f5`             |
| `--surface-muted`              | `#f3f2ff`             |
| `--text-primary`               | `#191b25`             |
| `--text-secondary`             | `#464555`             |
| `--text-tertiary`              | `#777587`             |
| `--border`                     | `#c7c4d8`             |
| `--border-strong`              | `#777587`             |
| `--divider`                    | `#d9d9e7`             |
| `--accent`                     | `#3525cd`             |
| `--accent-hover`               | `#4d44e3`             |
| `--accent-soft`                | `#e2dfff`             |
| `--accent-contrast`            | `#ffffff`             |
| `--ai-accent`                  | `#5c00ca`             |
| `--ai-accent-soft`             | `#f5f3ff`             |
| `--success` / `--success-soft` | `#1d7a49` / `#dcefe3` |
| `--warning` / `--warning-soft` | `#92600f` / `#f5ead2` |
| `--danger` / `--danger-soft`   | `#ba1a1a` / `#ffdad6` |
| `--info` / `--info-soft`       | `#0051d5` / `#dbe1ff` |
| `--message-incoming`           | `#f2f4f7`             |
| `--message-outgoing`           | `#3525cd`             |
| `--message-outgoing-text`      | `#ffffff`             |
| `--focus-ring`                 | `#4d44e3`             |
| `--selection`                  | `#e7e7f5`             |

Rules:

- The indigo `--accent` is the only global action color. White (`--accent-contrast`) text on
  `--accent` clears WCAG AA for UI text.
- Navigation and collection-row selected states use a soft tint plus a 4px active-edge indicator.
- Human outgoing messages use Primary Indigo (`#3525cd`) as shown in the designer export. AI
  assistant replies use faint violet surfaces (`#f5f3ff`) with a violet border (`#ddd6fe`).
- Status backgrounds always use the `-soft` token; never tint with ad-hoc `color-mix` per surface.
- AI identity color is `--ai-accent`; per-agent avatar hues remain derived from the violet family
  and must stay muted.

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

- Desktop: branded label navigation sidebar plus a content area.
- Messages: navigation sidebar, resizable collection panel, and main conversation panel.
- Contacts: navigation sidebar, resizable collection panel, and selected Human/AI contact surface;
  Human contacts contains accepted contacts, discovery, and requests in one content view.
- Artifacts: navigation sidebar, resizable collection panel, and selected library/detail surface.
- Settings and Pro Status: navigation sidebar, resizable collection panel, and selected account
  surface.
- Mobile: one panel at a time, with bottom navigation and route-preserving back behavior.

The desktop navigation sidebar is 16rem wide to match the designer export. The message collection
panel defaults to 320 pixels and is clamped between 320 and 480 pixels. Its preferred width is
stored locally. Each application panel owns its own scrolling; authenticated pages should not rely
on browser-level page scrolling.

## Components

Shared primitives (all token-based across light and dark mode):

- `MessengerShell`, branded navigation sidebar, mobile bottom navigation.
- `MessagingLayout` / collection-panel model, shared by the primary app sections so panel headers,
  selected rows, resizing, and scrolling behave consistently.
- `ContactsLayout`, using the same collection-panel model for Human contacts and AI contacts rather
  than horizontal top tabs; discovery and requests live inside Human contacts.
- `ArtifactsLayout` and `SettingsLayout`, using the same collection-panel model for non-chat
  sections rather than standalone centered pages.
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

The Messages surface lists both human conversations and AI character conversations. Human chat
headers show the display name plus online/last-seen presence only; usernames are not shown in the
active chat header. AI chat headers show the agent or persona name and its description, because AI
contacts do not have last-seen presence and are treated as available unless archived.

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

Theme selection is exposed in Preferences as a dark-mode switch backed by the existing
`user_settings.theme` value. The application still accepts `system`, `light`, and `dark` at the
runtime boundary; the switch saves explicit `light` or `dark`, while existing `system` values
continue to follow `prefers-color-scheme`.

All app surfaces must use semantic tokens rather than hardcoded light colors. If a component needs a
theme-specific treatment, scope it to `:root[data-theme='dark']` and keep layout, spacing, and
interaction states identical between themes.

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
