# Task 008: Private Image and File Attachments

## Objective

Add private image and file attachments to human direct messages on top of the Task 007 messaging
stack: a private Storage bucket, a staged and authorized upload/finalize flow, attachment-aware
sending with idempotency, member-only short-lived signed-URL access, composer picking with previews
and progress, message rendering with thumbnails, file cards, and an accessible image viewer, and
deletion that revokes attachment access. No AI image understanding, OCR, moderation, audio/video,
camera capture, avatar uploads, typing, presence, notifications, billing, or groups were added, and
no public bucket exists.

## Initial verification (Task 007 baseline)

Task 007 commit `5a13579` was confirmed committed with a clean tree. The baseline passed before any
change: `npm run supabase:reset`, `npm run db:test` (450 assertions / 14 files),
`npm run test:concurrency`, `npm run check` (203 web tests), and `npm run test:e2e` (16 scenarios).

## Database and Storage

One migration, `20260622020000_add_message_attachments.sql`:

- A private `message-attachments` Storage bucket (not public) with a 10 MB size limit and the
  supported MIME allowlist (JPEG, PNG, WebP, GIF, PDF, plain text, Markdown).
- A `message_attachments` table (id, conversation, nullable message, uploader, status, storage
  bucket/path, original filename, MIME type, size, optional width/height, timestamps) with CHECK
  constraints for status, size, supported MIME/extension, the attached↔message-id invariant, and a
  unique storage path. A trigger enforces that a linked attachment matches its message's
  conversation and sender. RLS lets the uploader and conversation members read metadata only.
- A `messages.has_attachments` flag and a relaxed content tombstone constraint so an active message
  may have null content only when it carries attachments.
- Storage object RLS scoped to the bucket: INSERT requires a pending reservation owned by the
  caller at exactly that path; SELECT requires the uploader or an attached row whose conversation
  the caller is a member of; DELETE is limited to the object owner. Helper functions derive the
  actor from `auth.uid()`.
- Functions `create_message_attachment_upload`, `finalize_message_attachment`,
  `remove_message_attachment`, a rebuilt `send_message` that accepts up to four finalized attachment
  IDs (four-argument callers still resolve via the defaulted parameter), and `list_conversation_messages`,
  `edit_message`, `delete_message` rebuilt to return an `attachments` JSON array. `delete_message`
  also deletes the attachment metadata, revoking signed-URL access.

## Upload and access flow

Reserve (validated, returns the only allowed path) → upload bytes directly to the private bucket
(INSERT RLS checks the reservation) → finalize (confirm object exists, record dimensions) → send
with finalized IDs (re-validated under the conversation lock and attached in the same transaction).
The idempotency hash includes the sorted attachment IDs. Downloads use short-lived signed URLs
created on demand after a Storage SELECT RLS check; URLs are cached in memory only, expire early,
are evicted on deletion, and cleared on sign-out. No signed URL is persisted, logged, or broadcast.

## Frontend

The composer gained an Attach button, a hidden validated file input, drag-and-drop, a pending
draft tray with previews, per-file upload status, remove, and retry, and send gating that waits
for every upload to finalize. A message may be text, attachments, or both. Optimistic messages show
local image previews and the Sending/Failed lifecycle with retry; retry reuses the same client id
and finalized IDs. Messages render bounded image thumbnails (with filename-based alt text) that open
a keyboard-accessible viewer (Escape to close, focus restore, no viewport overflow), and file cards
with Open/Download. Deleting a message removes its previews and evicts cached URLs; the viewer
closes if its message is deleted. Realtime payloads remain content- and attachment-free.

## Tests

- Database: `supabase/tests/014_message_attachments.test.sql` (27 assertions) covers metadata RLS,
  unrelated/anonymous denial, upload authorization, unsupported-type/size/count rejection,
  cross-user and cross-conversation attach denial, idempotent retry, payload conflict, and deletion
  revoking metadata and Storage access.
- Web: file validation, signed-URL cache lifecycle, attachment rendering and signed-URL failure,
  and composer picking/removal/send-gating/attachment-only send.
- Playwright: image upload with realtime delivery, member document open through a private signed
  URL, and deletion removing attachment access. The existing 16 scenarios still pass.

## Final verification

- `npm run supabase:reset` — PASS
- `npm run db:test` — PASS, 477 assertions over 15 files
- `npm run test:concurrency` — PASS (send_message change is backward compatible)
- `npm run check` — PASS (shared schemas + 221 web tests + production build)
- `npm run test:e2e` — PASS, 19 scenarios
- Supabase schema lint — PASS

## Deferred / known issues

- Physical Storage object deletion is best-effort from the owning client; access revocation does
  not depend on it. A background sweep for orphaned objects is deferred.
- Byte-level upload progress is shown as an indeterminate state; per-file percentage is deferred.
- Editing a message cannot change its attachments in this task.
