begin;

select plan(28);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'ai-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b1000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'ai-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

create temporary table aifix (label text primary key, id uuid, txt text);
grant insert, select on aifix to authenticated, anon, service_role;

insert into aifix (label, id) select 'agent', id from public.ai_agents where slug = 'council-assistant';

-- ---- A (authenticated) read paths ----
set local request.jwt.claim.sub = 'a1000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select is(
  (select count(*)::int from public.list_ai_agents() where slug = 'council-assistant'),
  1,
  'an authenticated user can list the built-in agent'
);

insert into aifix (label, id)
select 'conv', id from public.get_or_create_ai_conversation((select id from aifix where label = 'agent'));

select is(
  (select access_state from public.get_my_ai_access()),
  'trial_available',
  'a fresh user has an available, unstarted trial'
);
select is(
  (select trial_credits_remaining from public.get_my_ai_access()),
  20,
  'the initial allowance is twenty credits'
);

-- ---- A cannot read private tables or mutate directly ----
select throws_ok(
  $$ select * from public.ai_agent_prompt_versions $$,
  '42501', null, 'browser users cannot read the private prompt table'
);
select throws_ok(
  $$ select * from public.ai_runs $$,
  '42501', null, 'browser users cannot read run metadata'
);
select throws_ok(
  $$ insert into public.ai_messages (conversation_id, role, content)
     values ((select id from aifix where label = 'conv'), 'assistant', 'forged') $$,
  '42501', null, 'browser users cannot insert AI messages'
);
select throws_ok(
  $$ update public.ai_credit_accounts set trial_credits_remaining = 999 $$,
  '42501', null, 'browser users cannot change their own credit balance'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a1000000-0000-4a00-8a00-000000000001',
       (select id from aifix where label = 'conv'),
       'c1000000-0000-4c00-8c00-000000000009', 'x', 'mock') $$,
  '42501', null, 'browser users cannot call the privileged generation function'
);

-- ---- Generation as the service role (the Edge Function) ----
reset role;
set local role service_role;

insert into aifix (label, id)
select 'run1', run_id from public.start_ai_generation(
  'a1000000-0000-4a00-8a00-000000000001',
  (select id from aifix where label = 'conv'),
  'c1000000-0000-4c00-8c00-000000000001', 'hello there', 'mock-model'
);

reset role;
select is(
  (select trial_credits_remaining from public.ai_credit_accounts where user_id = 'a1000000-0000-4a00-8a00-000000000001'),
  19, 'the first generation reserves exactly one credit'
);
select isnt(
  (select trial_started_at from public.ai_credit_accounts where user_id = 'a1000000-0000-4a00-8a00-000000000001'),
  null, 'the trial starts on the first generation'
);
insert into aifix (label, txt)
select 'started', trial_started_at::text from public.ai_credit_accounts
where user_id = 'a1000000-0000-4a00-8a00-000000000001';

set local role service_role;
select isnt(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from aifix where label = 'run1'), 'hi from the assistant', 5, 7, 0.0001, 'req-1')),
  null, 'completing a run persists an assistant message'
);

-- Second generation with a new client id.
insert into aifix (label, id)
select 'run2', run_id from public.start_ai_generation(
  'a1000000-0000-4a00-8a00-000000000001',
  (select id from aifix where label = 'conv'),
  'c1000000-0000-4c00-8c00-000000000002', 'second prompt', 'mock-model'
);
reset role;
select is(
  (select trial_credits_remaining from public.ai_credit_accounts where user_id = 'a1000000-0000-4a00-8a00-000000000001'),
  18, 'a second generation reserves another credit'
);
select is(
  (select trial_started_at::text from public.ai_credit_accounts where user_id = 'a1000000-0000-4a00-8a00-000000000001'),
  (select txt from aifix where label = 'started'),
  'the trial start time never changes once set'
);
set local role service_role;
select isnt(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from aifix where label = 'run2'), 'second answer', 1, 1, null, null)),
  null, 'the second run completes'
);

-- Idempotent replay of client id 2 must not consume another credit.
select is(
  (select is_replay from public.start_ai_generation(
    'a1000000-0000-4a00-8a00-000000000001',
    (select id from aifix where label = 'conv'),
    'c1000000-0000-4c00-8c00-000000000002', 'second prompt', 'mock-model')),
  true, 'replaying the same client id is flagged as a replay'
);
reset role;
select is(
  (select trial_credits_remaining from public.ai_credit_accounts where user_id = 'a1000000-0000-4a00-8a00-000000000001'),
  18, 'an idempotent replay does not consume another credit'
);

-- Reserve then fail: the credit is refunded exactly once.
set local role service_role;
insert into aifix (label, id)
select 'run3', run_id from public.start_ai_generation(
  'a1000000-0000-4a00-8a00-000000000001',
  (select id from aifix where label = 'conv'),
  'c1000000-0000-4c00-8c00-000000000003', 'third prompt', 'mock-model'
);
reset role;
select is(
  (select trial_credits_remaining from public.ai_credit_accounts where user_id = 'a1000000-0000-4a00-8a00-000000000001'),
  17, 'reserving a third generation decrements again'
);
set local role service_role;
select is(
  (select credits_remaining from public.fail_ai_generation(
    (select id from aifix where label = 'run3'), 'provider_unavailable', 'failed')),
  18, 'a failed run refunds its reserved credit'
);
select is(
  (select credits_remaining from public.fail_ai_generation(
    (select id from aifix where label = 'run3'), 'provider_unavailable', 'failed')),
  18, 'a second failure does not refund again (no balance inflation)'
);

-- Exhausted and expired trials cannot reserve.
reset role;
update public.ai_credit_accounts set trial_credits_remaining = 0
where user_id = 'a1000000-0000-4a00-8a00-000000000001';
set local role service_role;
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a1000000-0000-4a00-8a00-000000000001',
       (select id from aifix where label = 'conv'),
       'c1000000-0000-4c00-8c00-000000000004', 'blocked', 'mock-model') $$,
  'P0001', 'credits_exhausted', 'an exhausted trial cannot reserve a generation'
);
reset role;
update public.ai_credit_accounts
set trial_credits_remaining = 5, trial_expires_at = now() - interval '1 day'
where user_id = 'a1000000-0000-4a00-8a00-000000000001';
set local role service_role;
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a1000000-0000-4a00-8a00-000000000001',
       (select id from aifix where label = 'conv'),
       'c1000000-0000-4c00-8c00-000000000005', 'blocked', 'mock-model') $$,
  'P0001', 'trial_expired', 'an expired trial cannot reserve a generation'
);

-- ---- B sees none of A's data ----
reset role;
set local request.jwt.claim.sub = 'b1000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is(
  (select count(*)::int from public.list_my_ai_conversations()), 0,
  'a second user lists none of the first user conversations'
);
select is(
  (select count(*)::int from public.ai_conversations), 0,
  'a second user cannot read the first user conversation rows'
);
select is(
  (select count(*)::int from public.ai_messages), 0,
  'a second user cannot read the first user messages'
);
select throws_ok(
  $$ select * from public.list_ai_messages((select id from aifix where label = 'conv'), 100) $$,
  'P0001', 'ai_conversation_not_found', 'a second user cannot list messages in another conversation'
);

-- ---- Anonymous access is denied ----
reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok($$ select * from public.ai_agents $$, '42501', null, 'anon cannot read agents');
select throws_ok($$ select * from public.list_ai_agents() $$, '42501', null, 'anon cannot list agents');
select throws_ok($$ select * from public.get_my_ai_access() $$, '42501', null, 'anon cannot read AI access');

select * from finish();

rollback;
