# Task 016: Persistent AI Artifacts

Status: implemented

## Scope

Council users can save an assistant response as a private artifact, edit it through immutable
versions, request a revision from the same AI contact, review the streamed proposal before saving,
restore older content as a new version, archive or restore artifacts, and export the current saved
version as Markdown or plain text.

## Implementation

- Added owner-scoped `ai_artifacts` and immutable `ai_artifact_versions` with narrow, idempotent
  RPCs and a 100-active-artifact limit.
- Source creation reloads authoritative assistant content and validates conversation/contact scope.
- Added `/app/artifacts` and `/app/artifacts/:artifactId` with search, filtering, editing, history,
  restore, archive, AI revision review, unsaved-change protection, and local export.
- Added a focused `ai-chat` artifact-revision operation using the existing provider, lease,
  deadline, credit reservation/refund, and strict stream contracts.
- AI proposals remain separate from the saved artifact until an explicit idempotent save.

## Security and privacy

- RLS and RPC authorization deny anonymous and cross-user access.
- Artifact text is plain, untrusted content and is never rendered as raw HTML.
- Artifact content is sent to an AI contact only for an explicit revision request.
- No artifact content is written to memory, logs, human conversations, or Realtime payloads.
- Archived custom personas retain readable artifacts but cannot perform AI revisions.

## Verification

- Database coverage includes ownership denial, immutable numbering, authoritative source messages,
  idempotency, restore, archive, and active limits.
- Edge coverage includes ownership, identity, prompt boundaries, archived-persona denial, credits,
  replay, and no automatic overwrite.
- Frontend and Playwright coverage includes creation, manual save, revision review/save/discard,
  reload, restore, export, unsaved-change warning, and cross-user denial.

## Deferred

Public sharing, collaboration, comments, PDF/DOCX export, background revision, semantic search,
artifact memory, and billing remain out of scope.
