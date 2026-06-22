begin;

select plan(31);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a3000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'memory-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b3000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'memory-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

create temporary table mfix (label text primary key, id uuid);
grant insert, select on mfix to authenticated, anon, service_role;

insert into mfix (label, id)
select 'agent1', id from public.ai_agents where slug = 'council-assistant';
insert into mfix (label, id)
select 'agent2', id from public.ai_agents where slug = 'writing-editor';

set local request.jwt.claim.sub = 'a3000000-0000-4a00-8a00-000000000001';
set local role authenticated;

insert into mfix (label, id)
select 'conv1', id from public.get_or_create_ai_conversation(
  (select id from mfix where label = 'agent1'), null
);
insert into mfix (label, id)
select 'conv2', id from public.get_or_create_ai_conversation(
  (select id from mfix where label = 'agent2'), null
);

select is(
  (select memory_mode from public.get_ai_memory_settings((select id from mfix where label = 'conv1'))),
  'curated',
  'new AI conversations default to curated memory'
);

insert into mfix (label, id)
select 'memory1', id from public.create_ai_memory(
  (select id from mfix where label = 'conv1'),
  'personal_fact',
  'My preferred name is Utku.',
  null
);

select is(
  (select content from public.list_ai_memories((select id from mfix where label = 'conv1'))),
  'My preferred name is Utku.',
  'the owner can create and list a memory'
);
select is(
  (select count(*)::int from public.ai_memories),
  1,
  'the owner can read their memory through RLS'
);
select is(
  (select count(*)::int from public.list_ai_memories((select id from mfix where label = 'conv2'))),
  0,
  'memories are scoped to one AI conversation'
);

reset role;
set local request.jwt.claim.sub = 'b3000000-0000-4b00-8b00-000000000002';
set local role authenticated;

select is(
  (select count(*)::int from public.ai_memories),
  0,
  'another user cannot read memory rows'
);
select throws_ok(
  $$ select * from public.list_ai_memories((select id from mfix where label = 'conv1')) $$,
  'P0001', 'ai_conversation_not_found',
  'another user cannot list memories for the owner conversation'
);
select throws_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'other', 'intruder', null) $$,
  'P0001', 'ai_conversation_not_found',
  'another user cannot create a memory in the owner conversation'
);
select throws_ok(
  $$ select * from public.update_ai_memory(
       (select id from mfix where label = 'memory1'), 'other', 'changed') $$,
  'P0001', 'memory_not_found',
  'another user cannot update the owner memory'
);
select throws_ok(
  $$ select public.delete_ai_memory((select id from mfix where label = 'memory1')) $$,
  'P0001', 'memory_not_found',
  'another user cannot delete the owner memory'
);
select throws_ok(
  $$ select * from public.set_ai_memory_mode(
       (select id from mfix where label = 'conv1'), 'conversation_only') $$,
  'P0001', 'ai_conversation_not_found',
  'another user cannot change the owner memory mode'
);

-- Create source messages through the trusted generation path.
reset role;
set local role service_role;
insert into mfix (label, id)
select 'run1', run_id from public.start_ai_generation(
  'a3000000-0000-4a00-8a00-000000000001',
  (select id from mfix where label = 'conv1'),
  'a3100000-0000-4a10-8a10-000000000001',
  'Remember this source message',
  'test-model'
);
reset role;
insert into mfix (label, id)
select 'source1', user_message_id from public.ai_runs where id = (select id from mfix where label = 'run1');
set local role service_role;
insert into mfix (label, id)
select 'assistant1', assistant_message_id from public.complete_ai_generation(
  (select id from mfix where label = 'run1'), 'Source reply', 1, 1, null, null
);

insert into mfix (label, id)
select 'run2', run_id from public.start_ai_generation(
  'a3000000-0000-4a00-8a00-000000000001',
  (select id from mfix where label = 'conv2'),
  'a3200000-0000-4a20-8a20-000000000002',
  'Other conversation source',
  'test-model'
);
reset role;
insert into mfix (label, id)
select 'source2', user_message_id from public.ai_runs where id = (select id from mfix where label = 'run2');
set local role service_role;
select * from public.complete_ai_generation(
  (select id from mfix where label = 'run2'), 'Other reply', 1, 1, null, null
);

reset role;
set local request.jwt.claim.sub = 'a3000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select lives_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'instruction',
       'Use concise explanations.', (select id from mfix where label = 'source1')) $$,
  'a user message from the same conversation can be a memory source'
);
select throws_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'other',
       'wrong conversation', (select id from mfix where label = 'source2')) $$,
  'P0001', 'invalid_memory_source',
  'a user message from another AI conversation cannot be a source'
);
select throws_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'other',
       'assistant source', (select id from mfix where label = 'assistant1')) $$,
  'P0001', 'invalid_memory_source',
  'an assistant message cannot be a memory source'
);
select throws_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'other', repeat('x', 501), null) $$,
  'P0001', 'invalid_memory',
  'memory content is limited to 500 characters'
);
select throws_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'other', '   ', null) $$,
  'P0001', 'invalid_memory',
  'empty memory content is rejected'
);
select throws_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'secret_profile', 'x', null) $$,
  'P0001', 'invalid_memory',
  'unknown memory categories are rejected'
);

select is(
  (select memory_mode from public.set_ai_memory_mode(
     (select id from mfix where label = 'conv1'), 'conversation_only')),
  'conversation_only',
  'the owner can switch to conversation-only mode'
);
select throws_ok(
  $$ select * from public.set_ai_memory_mode(
       (select id from mfix where label = 'conv1'), 'automatic') $$,
  'P0001', 'invalid_memory_mode',
  'unsupported memory modes are rejected'
);
select is(
  (select count(*)::int from public.list_ai_memories((select id from mfix where label = 'conv1'))),
  2,
  'conversation-only mode preserves saved memories'
);

-- Curated prompt includes only this conversation's approved memories and keeps
-- the platform instructions first.
select * from public.create_ai_memory(
  (select id from mfix where label = 'conv2'), 'project', 'Memory from contact two.', null
);
select * from public.set_ai_memory_mode((select id from mfix where label = 'conv1'), 'curated');

reset role;
set local role service_role;
insert into mfix (label, id)
select 'run3', run_id from public.start_ai_generation(
  'a3000000-0000-4a00-8a00-000000000001',
  (select id from mfix where label = 'conv1'),
  'a3300000-0000-4a30-8a30-000000000003',
  'What do you remember?',
  'test-model'
);
select ok(
  (select system_prompt like '%My preferred name is Utku.%'
   from public.load_ai_run_context((select id from mfix where label = 'run3'))),
  'curated mode includes approved memory in the server prompt'
);
select ok(
  (select system_prompt not like '%Memory from contact two.%'
   from public.load_ai_run_context((select id from mfix where label = 'run3'))),
  'prompt context excludes memory from another AI conversation'
);
select ok(
  (select position('platform rules always apply' in system_prompt)
        < position('User-approved memory' in system_prompt)
   from public.load_ai_run_context((select id from mfix where label = 'run3'))),
  'platform instructions retain precedence over memory'
);
select * from public.complete_ai_generation(
  (select id from mfix where label = 'run3'), 'Utku', 1, 1, null, null
);

reset role;
set local request.jwt.claim.sub = 'a3000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select * from public.set_ai_memory_mode((select id from mfix where label = 'conv1'), 'conversation_only');
reset role;
set local role service_role;
insert into mfix (label, id)
select 'run4', run_id from public.start_ai_generation(
  'a3000000-0000-4a00-8a00-000000000001',
  (select id from mfix where label = 'conv1'),
  'a3400000-0000-4a40-8a40-000000000004',
  'Try without memory',
  'test-model'
);
select ok(
  (select system_prompt not like '%My preferred name is Utku.%'
   from public.load_ai_run_context((select id from mfix where label = 'run4'))),
  'conversation-only mode excludes stored memory from the prompt'
);
select * from public.complete_ai_generation(
  (select id from mfix where label = 'run4'), 'No memory used', 1, 1, null, null
);

reset role;
set local request.jwt.claim.sub = 'a3000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select lives_ok(
  $$ select public.delete_ai_memory((select id from mfix where label = 'memory1')) $$,
  'the owner can delete one memory'
);
select * from public.set_ai_memory_mode((select id from mfix where label = 'conv1'), 'curated');
reset role;
set local role service_role;
insert into mfix (label, id)
select 'run5', run_id from public.start_ai_generation(
  'a3000000-0000-4a00-8a00-000000000001',
  (select id from mfix where label = 'conv1'),
  'a3500000-0000-4a50-8a50-000000000005',
  'After deletion',
  'test-model'
);
select ok(
  (select system_prompt not like '%My preferred name is Utku.%'
   from public.load_ai_run_context((select id from mfix where label = 'run5'))),
  'deleted memory is excluded from future prompt context'
);
select * from public.complete_ai_generation(
  (select id from mfix where label = 'run5'), 'Deleted', 1, 1, null, null
);

reset role;
set local request.jwt.claim.sub = 'a3000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  public.delete_all_ai_memories((select id from mfix where label = 'conv1')),
  1,
  'delete-all removes the remaining memory in the selected conversation'
);
select is(
  public.delete_all_ai_memories((select id from mfix where label = 'conv1')),
  0,
  'delete-all is idempotent when no memories remain'
);
select ok(
  (select count(*) > 0 from public.list_ai_messages((select id from mfix where label = 'conv1'), 100)),
  'clearing memories does not delete AI message history'
);

do $$
begin
  for i in 1..50 loop
    perform public.create_ai_memory(
      (select id from mfix where label = 'conv1'), 'other', 'memory ' || i, null
    );
  end loop;
end $$;
select throws_ok(
  $$ select * from public.create_ai_memory(
       (select id from mfix where label = 'conv1'), 'other', 'fifty first', null) $$,
  'P0001', 'memory_limit_reached',
  'a conversation cannot exceed fifty active memories'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from public.ai_memories $$,
  '42501', null,
  'anonymous users cannot read memory rows'
);
select throws_ok(
  $$ select * from public.list_ai_memories((select id from mfix where label = 'conv1')) $$,
  '42501', null,
  'anonymous users cannot call memory RPCs'
);

select * from finish();

rollback;
