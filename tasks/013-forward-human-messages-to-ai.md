# Task 013: Forward human messages to AI

Status: complete.

Users can select up to 20 active text messages in a human direct conversation, review and remove
items, choose a built-in AI contact or active custom persona, add an optional 2,000-character
instruction, and confirm. Attachments, attachment-only messages, deleted content, reactions, and
hidden metadata are excluded.

The existing `ai-chat` pipeline re-authorizes both conversations, fetches source text server-side,
creates an owner-only immutable provenance snapshot, reserves the normal credit, and streams the
response. Exact request retries are idempotent; conflicting request-ID reuse is rejected. The
destination AI history persists a plain-text context card, and the other human participant has no
access.

PDF and document analysis remains intentionally deferred until the end of the project.
