# Operations

Council is not yet approved for production operation. This document defines the minimum operating
model that must be satisfied before a public launch.

## Release Gates

Every release candidate must have:

- A passing hosted Quality gates workflow for the exact commit.
- A local `npm run verify:local:strict` run on a clean checkout with Docker, Supabase, Deno,
  Chromium, and the required local configuration available.
- A local `npm run mobile:verify` run.
- A manual Android emulator smoke test for mobile releases.
- An iOS simulator build on macOS before any iOS release.
- A tracked-file secret scan covering web, mobile, Supabase, docs, and workflow files.
- A written rollback note for the migrations and client build being released.

No release should proceed with skipped database/RLS, Edge Function, concurrency, or Playwright
stages unless the skipped stage is explicitly accepted in the release note with an owner and
follow-up date.

## Deployment Checklist

Before deploy:

- Confirm the target Supabase project URL and project reference.
- Confirm no local `.env`, signing, Firebase, Apple, service-role, or OpenRouter secret files are
  staged.
- Run database migrations against staging first.
- Run staging smoke tests for authentication, contacts, human messaging, AI generation with the
  mock or configured provider, attachments, artifacts, and Premium code redemption.
- Verify Realtime private topics reject anonymous and unrelated users.
- Verify private Storage buckets remain private.
- Verify `ai-chat` has server-only provider credentials and no wildcard browser CORS.

After deploy:

- Verify login, onboarding, message send, AI stream, attachment upload/download, and sign out.
- Review function logs for error category spikes without inspecting private content.
- Confirm no failed migrations, failed Edge Function deploys, or unexpected Storage policy changes.
- Record the deployed commit and migration range.

## Rollback

Client rollback:

- Re-deploy the previous known-good web build.
- Re-distribute the previous known-good mobile build when app-store rollout controls allow it.
- Keep the current database if the release used only backward-compatible additive migrations.

Database rollback:

- Applied migrations are immutable and are not edited.
- Add a forward corrective migration for additive mistakes.
- Restore from backup only for destructive data corruption, after preserving incident evidence.
- Never run ad hoc SQL against production without recording the statement, actor, reason, and
  expected blast radius.

Edge Function rollback:

- Re-deploy the previous function bundle.
- Confirm idempotency and run-refund behavior with a mock-provider generation before re-enabling
  live provider traffic.

## Monitoring Requirements

Production requires monitoring for:

- Supabase Auth availability and elevated authentication failures.
- PostgreSQL errors, migration failures, lock contention, and slow RPCs.
- Realtime subscription errors and authorization failures.
- Storage upload/finalize errors and signed-access failures.
- `ai-chat` generation start, completion, failure category, refund, latency, token count, and cost
  aggregates.
- Premium-code redemption failures and rate-limit activity.
- Foreground and background notification dispatch failure rates once push dispatch is enabled.
- Web and mobile client crashes or unhandled errors without private content.

Logs may include stable identifiers, error categories, latency, counts, and estimated cost. Logs
must not include message bodies, prompts, memories, document contents, image bytes, tokens,
credentials, signed URLs, access codes, or provider request/response bodies.

## Backups and Restore Drills

Production readiness requires:

- Automated database backups with retention appropriate for the launch risk.
- Documented Storage backup posture for private buckets.
- A quarterly restore drill into a non-production project.
- A restore validation checklist covering auth users, profiles, relationships, conversations,
  messages, attachments metadata, AI conversations, memories, artifacts, Premium grants, and RLS.

## Incident Response

For any privacy, authorization, credential, or data-integrity incident:

1. Freeze releases except emergency fixes.
2. Preserve logs and deployment state without copying private content into issue trackers.
3. Rotate affected server-side secrets.
4. Disable affected Edge Functions or clients if containment requires it.
5. Identify the first affected commit, migration, or configuration change.
6. Add regression tests before closing the incident.
7. Document user impact, data classes involved, remediation, and remaining risk.

## Security Review Gate

Before public launch, an independent reviewer should audit:

- All `SECURITY DEFINER` functions and grants.
- RLS policies and pgTAP negative coverage.
- Service-role Edge Function paths.
- Signed media access and private bucket policies.
- Realtime topic authorization.
- AI entitlement, reservation, refund, and idempotency paths.
- Mobile local persistence and push-token storage.
- Deep-link validation and safe redirect handling.

The audit result should be tracked with findings, fixes, and explicitly accepted residual risks.
