begin;
select plan(28);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a8000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'artifact-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'artifact-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

create temporary table afix(label text primary key, id uuid);
grant select, insert on afix to authenticated, anon, service_role;
insert into afix select 'agent', id from public.ai_agents where slug = 'council-assistant';

set local request.jwt.claim.sub = 'a8000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into afix select 'conv_a', id from public.get_or_create_ai_conversation(
  (select id from afix where label = 'agent'), null
);
reset role;
set local request.jwt.claim.sub = 'b8000000-0000-4b00-8b00-000000000002';
set local role authenticated;
insert into afix select 'conv_b', id from public.get_or_create_ai_conversation(
  (select id from afix where label = 'agent'), null
);
reset role;

insert into public.ai_messages(conversation_id, role, content)
values
  ((select id from afix where label = 'conv_a'), 'assistant', 'Authoritative weekly plan'),
  ((select id from afix where label = 'conv_b'), 'assistant', 'Other user response');
insert into afix select 'message_a', id from public.ai_messages where content = 'Authoritative weekly plan';
insert into afix select 'message_b', id from public.ai_messages where content = 'Other user response';

set local request.jwt.claim.sub = 'a8000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select lives_ok(
  $$ select public.create_ai_artifact(
    (select id from afix where label = 'message_a'), 'plan', 'Weekly plan', null,
    'a8000000-0000-4a00-8a00-000000000010'
  ) $$,
  'owner creates an artifact from an authoritative assistant message'
);
insert into afix
select 'artifact', (public.list_my_ai_artifacts(true, 10) ->> 'id')::uuid limit 1;

select is(
  public.get_ai_artifact((select id from afix where label = 'artifact')) ->> 'current_content',
  'Authoritative weekly plan',
  'initial content comes from the server message'
);
select is(
  (public.get_ai_artifact((select id from afix where label = 'artifact')) ->> 'current_version_number')::int,
  1,
  'artifact begins at version one'
);
select is(
  jsonb_array_length(public.get_ai_artifact((select id from afix where label = 'artifact')) -> 'versions'),
  1,
  'initial immutable version is present'
);
select is(
  public.create_ai_artifact(
    (select id from afix where label = 'message_a'), 'plan', 'Weekly plan', null,
    'a8000000-0000-4a00-8a00-000000000010'
  ) ->> 'id',
  (select id::text from afix where label = 'artifact'),
  'artifact creation retry is idempotent'
);
select throws_ok(
  $$ select public.create_ai_artifact(
    (select id from afix where label = 'message_a'), 'document', 'Changed', null,
    'a8000000-0000-4a00-8a00-000000000010'
  ) $$,
  'P0001', 'idempotency_conflict',
  'conflicting creation request is rejected'
);
select throws_ok(
  $$ select public.create_ai_artifact(
    (select id from afix where label = 'message_b'), 'plan', 'Stolen', null,
    'a8000000-0000-4a00-8a00-000000000011'
  ) $$,
  'P0001', 'source_message_unavailable',
  'cross-user source message is rejected'
);

select is(
  (public.create_ai_artifact_version(
    (select id from afix where label = 'artifact'), 'Manual revision', 'user',
    'a8000000-0000-4a00-8a00-000000000012', 1
  ) ->> 'current_version_number')::int,
  2,
  'manual save appends version two'
);
select is(
  (public.create_ai_artifact_version(
    (select id from afix where label = 'artifact'), 'Manual revision', 'user',
    'a8000000-0000-4a00-8a00-000000000012', 1
  ) ->> 'current_version_number')::int,
  2,
  'manual save retry is idempotent'
);
reset role;
set local role service_role;
select throws_ok(
  $$ update public.ai_artifact_versions set content = 'mutated'
     where artifact_id = (select id from afix where label = 'artifact') $$,
  'P0001', 'immutable_artifact_version',
  'versions cannot be updated'
);
select throws_ok(
  $$ delete from public.ai_artifact_versions
     where artifact_id = (select id from afix where label = 'artifact') $$,
  'P0001', 'immutable_artifact_version',
  'versions cannot be deleted'
);
reset role;
set local request.jwt.claim.sub = 'a8000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (public.restore_ai_artifact_version(
    (select id from afix where label = 'artifact'), 1,
    'a8000000-0000-4a00-8a00-000000000013'
  ) ->> 'current_version_number')::int,
  3,
  'restore creates a new current version'
);
select is(
  public.get_ai_artifact((select id from afix where label = 'artifact')) ->> 'current_content',
  'Authoritative weekly plan',
  'restored content matches the older version'
);
select throws_ok(
  $$ select public.create_ai_artifact_version(
    (select id from afix where label = 'artifact'), 'Forged AI version', 'ai',
    'a8000000-0000-4a00-8a00-000000000015', 3
  ) $$,
  'P0001', 'invalid_request',
  'browser cannot forge AI-created provenance'
);
reset role;
create temporary table artifact_revision_run(id uuid);
grant select on artifact_revision_run to authenticated;
with inserted as (
  insert into public.ai_runs(
    user_id, conversation_id, status, credit_reserved, artifact_id,
    artifact_client_request_id, artifact_request_hash, artifact_instruction,
    proposed_artifact_content, completion_payload_hash, completed_at
  ) values (
    'a8000000-0000-4a00-8a00-000000000001',
    (select id from afix where label = 'conv_a'),
    'completed', false, (select id from afix where label = 'artifact'),
    'a8000000-0000-4a00-8a00-000000000016',
    encode(extensions.digest(
      (select id::text from afix where label = 'artifact')
      || chr(31) || (
        select current_version_number::text from public.ai_artifacts
        where id = (select id from afix where label = 'artifact')
      ) || chr(31) || 'Make concise',
      'sha256'
    ), 'hex'),
    'Make concise',
    'Trusted AI proposal', encode(extensions.digest('Trusted AI proposal', 'sha256'), 'hex'), now()
  ) returning id
)
insert into artifact_revision_run select id from inserted;
set local request.jwt.claim.sub = 'a8000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (public.save_ai_artifact_revision(
    (select id from artifact_revision_run),
    'a8000000-0000-4a00-8a00-000000000017'
  ) ->> 'current_content'),
  'Trusted AI proposal',
  'AI revision save copies the trusted completed proposal'
);
select is(
  (public.save_ai_artifact_revision(
    (select id from artifact_revision_run),
    'a8000000-0000-4a00-8a00-000000000017'
  ) ->> 'current_version_number')::int,
  4,
  'AI revision save is idempotent'
);
reset role;
create temporary table stale_revision_run(id uuid);
grant select on stale_revision_run to authenticated;
with inserted as (
  insert into public.ai_runs(
    user_id, conversation_id, status, credit_reserved, artifact_id,
    artifact_client_request_id, artifact_request_hash, artifact_instruction,
    proposed_artifact_content, completion_payload_hash, completed_at
  ) values (
    'a8000000-0000-4a00-8a00-000000000001',
    (select id from afix where label = 'conv_a'),
    'completed', false, (select id from afix where label = 'artifact'),
    'a8000000-0000-4a00-8a00-000000000018',
    encode(extensions.digest(
      (select id::text from afix where label = 'artifact')
      || chr(31) || (
        select current_version_number::text from public.ai_artifacts
        where id = (select id from afix where label = 'artifact')
      ) || chr(31) || 'Rewrite',
      'sha256'
    ), 'hex'),
    'Rewrite', 'Stale proposal',
    encode(extensions.digest('Stale proposal', 'sha256'), 'hex'), now()
  ) returning id
)
insert into stale_revision_run select id from inserted;
set local request.jwt.claim.sub = 'a8000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select lives_ok(
  $$ select public.create_ai_artifact_version(
    (select id from afix where label = 'artifact'), 'Newer manual edit', 'user',
    'a8000000-0000-4a00-8a00-000000000019', 4
  ) $$,
  'a manual edit can advance while an AI proposal remains unsaved'
);
select throws_ok(
  $$ select public.save_ai_artifact_revision(
    (select id from stale_revision_run),
    'a8000000-0000-4a00-8a00-000000000020'
  ) $$,
  'P0001', 'artifact_version_conflict',
  'a stale AI proposal cannot replace a newer saved version'
);
select lives_ok(
  $$ select public.rename_ai_artifact(
    (select id from afix where label = 'artifact'), 'Renamed plan'
  ) $$,
  'owner can rename an artifact'
);
select lives_ok(
  $$ select public.archive_ai_artifact((select id from afix where label = 'artifact')) $$,
  'owner can archive an artifact'
);
select throws_ok(
  $$ select public.create_ai_artifact_version(
    (select id from afix where label = 'artifact'), 'Blocked edit', 'user',
    'a8000000-0000-4a00-8a00-000000000014', 3
  ) $$,
  'P0001', 'artifact_archived',
  'archived artifact blocks new versions'
);
select lives_ok(
  $$ select public.restore_ai_artifact((select id from afix where label = 'artifact')) $$,
  'owner restores an archived artifact'
);

reset role;
set local request.jwt.claim.sub = 'b8000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is((select count(*) from public.ai_artifacts), 0::bigint,
  'RLS hides artifact metadata from another user');
select is((select count(*) from public.ai_artifact_versions), 0::bigint,
  'RLS hides versions from another user');
select throws_ok(
  $$ select public.get_ai_artifact((select id from afix where label = 'artifact')) $$,
  'P0001', 'artifact_not_found',
  'cross-user RPC reveals no artifact'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select count(*) from public.ai_artifacts $$,
  '42501', null,
  'anonymous artifact table access is denied'
);
select throws_ok(
  $$ select public.list_my_ai_artifacts(true, 10) $$,
  '42501', null,
  'anonymous artifact RPC execution is denied'
);

reset role;
insert into public.ai_artifacts(
  user_id, ai_conversation_id, agent_id, type, title,
  create_request_id, create_payload_hash
)
select
  'a8000000-0000-4a00-8a00-000000000001',
  (select id from afix where label = 'conv_a'),
  (select id from afix where label = 'agent'),
  'document', 'Limit ' || n, extensions.gen_random_uuid(),
  repeat('a', 64)
from generate_series(1, 99) n;
set local request.jwt.claim.sub = 'a8000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.create_ai_artifact(
    (select id from afix where label = 'message_a'), 'plan', 'Over limit', null,
    'a8000000-0000-4a00-8a00-000000000099'
  ) $$,
  'P0001', 'artifact_limit_reached',
  'active artifact limit is enforced'
);

select * from finish();
rollback;
