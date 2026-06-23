# Task 002: Profiles, Contacts, Blocking, and RLS Foundation

## Objective

Implement the first Council product database layer for profiles, private settings, discovery,
contact relationships, and blocking.

## User story

As an authenticated Council user, I need private profile/settings ownership and secure social
actions so later web screens can use database-enforced contracts without trusting the browser.

## Context

Task 002 is database-first. It does not implement React authentication, onboarding, contacts UI,
messaging, Storage, Realtime, billing, or AI behavior.

## In scope

- profiles, settings, canonical relationships, and blocks
- Auth creation trigger and timestamp/normalization triggers
- bounded profile discovery and social mutation/list functions
- RLS, column grants, function grants, and private helpers
- pgTAP authorization suite
- shared JavaScript/Zod contracts
- architecture, security, database, testing, and roadmap documentation

## Out of scope

All user-facing account/contact screens, conversations, messages, Realtime, Storage buckets,
reports UI, billing, AI, groups, mobile clients, lookup by email/phone, recommendations, and
contact importing.

## Locked decisions

The authenticated browser uses the Supabase anon client and user session. Actor identity always
comes from `auth.uid()`. Cross-user mutations use explicit security-definer database functions.

## Database changes

Create `profiles`, `user_settings`, `contact_relationships`, and `user_blocks` in one Task 002
migration. Canonical relationships use one row per sorted UUID pair. Enable RLS and add indexes,
constraints, triggers, comments, helpers, grants, and social functions.

## RLS changes

Profiles expose the own row and unblocked pending/accepted participant profiles. Settings are
owner-only. Relationships are participant-only. Blocks are visible only to the blocker.

## Backend changes

No Edge Function is added. PostgreSQL functions implement profile updates, bounded discovery,
requests, responses, removal, blocking, unblocking, and social listing.

## Frontend changes

No screens are added. Shared contracts are imported by a web unit test to prove workspace
consumption.

## Security considerations

Anonymous access and direct relationship/block writes are denied. Public functions have explicit
authenticated grants, derive actor identity, use a fixed search path, return minimal fields, and
serialize pair mutations. Search never returns email or settings data. Blocking removes social
state transactionally and hides both directions.

## Error and loading states

Database functions return explicit errors for unauthenticated calls, invalid input, missing
targets, disabled requests, blocked pairs, unauthorized responses, and invalid relationship
state. UI states are deferred.

## Acceptance criteria

A clean local reset applies the migration. All pgTAP, JavaScript, lint, formatting, and build
checks pass. No out-of-scope product feature is introduced.

## Required tests

The pgTAP suite covers creation triggers, cascades, constraints, profile/settings RLS, discovery,
contact workflows, blocks, anonymous access, direct mutation denial, and grants. Shared Zod
contracts include positive and negative unit tests.

## Documentation updates

Update database, security, architecture, testing, roadmap, README status, and retained task
history.

## Completion gate

`npm run supabase:reset`, `npm run db:test`, and `npm run check` must all succeed. Database tests
must execute against local Supabase before completion is claimed.
