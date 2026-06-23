begin;
select plan(16);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a7000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated',
  'reliable@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()
);

create temporary table rfix(label text primary key, id uuid);
grant select, insert on rfix to authenticated, service_role;
insert into rfix
select 'agent', id from public.ai_agents where slug = 'council-assistant';
set local request.jwt.claim.sub = 'a7000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into rfix
select 'conversation', id from public.get_or_create_ai_conversation(
  (select id from rfix where label = 'agent'), null
);

reset role;
insert into public.ai_messages(conversation_id, role, content, client_message_id, created_at)
select (select id from rfix where label = 'conversation'),
  case when n % 2 = 0 then 'assistant' else 'user' end,
  'message-' || lpad(n::text, 3, '0'),
  extensions.gen_random_uuid(),
  '2026-01-01 00:00:00+00'::timestamptz + (n || ' seconds')::interval
from generate_series(1, 250) as n;

set local role authenticated;
select is(
  (select content from public.list_ai_messages(
    (select id from rfix where label = 'conversation'), 50, null, null
  ) order by created_at, id limit 1),
  'message-201',
  'initial AI page starts at the newest bounded window'
);
select is(
  (select content from public.list_ai_messages(
    (select id from rfix where label = 'conversation'), 50, null, null
  ) order by created_at desc, id desc limit 1),
  'message-250',
  'initial AI page includes the newest message'
);

insert into rfix
select 'cursor-id', id from public.ai_messages
where content = 'message-201';
select is(
  (select content from public.list_ai_messages(
    (select id from rfix where label = 'conversation'), 50,
    (select created_at from public.ai_messages where id = (select id from rfix where label = 'cursor-id')),
    (select id from rfix where label = 'cursor-id')
  ) order by created_at, id limit 1),
  'message-151',
  'older-page cursor returns the next older window'
);
select is(
  (select count(*) from public.list_ai_messages(
    (select id from rfix where label = 'conversation'), 50,
    (select created_at from public.ai_messages where id = (select id from rfix where label = 'cursor-id')),
    (select id from rfix where label = 'cursor-id')
  )),
  50::bigint,
  'older page has no duplicate boundary message'
);

reset role;
update public.ai_messages set created_at = '2026-01-02 00:00:00+00'
where content in ('message-249', 'message-250');
set local role authenticated;
select results_eq(
  $$ select id from public.list_ai_messages(
    (select id from rfix where label = 'conversation'), 2, null, null
  ) order by created_at, id $$,
  $$ select id from public.ai_messages
     where content in ('message-249', 'message-250') order by created_at, id $$,
  'equal timestamps use ID as a deterministic tie-breaker'
);

reset role;
insert into public.ai_credit_accounts(user_id, trial_started_at, trial_expires_at)
values ('a7000000-0000-4a00-8a00-000000000001', now(), now() + interval '7 days')
on conflict (user_id) do nothing;
create temporary table expired_run(id uuid);
grant select on expired_run to service_role;
with inserted as (
  insert into public.ai_runs(user_id, conversation_id, status, credit_reserved, lease_expires_at)
  values (
    'a7000000-0000-4a00-8a00-000000000001',
    (select id from rfix where label = 'conversation'),
    'running', true, now() - interval '1 minute'
  ) returning id
)
insert into expired_run select id from inserted;

set local role service_role;
select is(
  (select recovered_count from public.recover_expired_ai_runs(
    'a7000000-0000-4a00-8a00-000000000001', (select id from rfix where label = 'conversation')
  )),
  1,
  'expired run is recovered'
);
select is((select status from public.ai_runs where id = (select id from expired_run)), 'failed',
  'recovered run is terminal');
select is((select credit_reserved from public.ai_runs where id = (select id from expired_run)), false,
  'recovery releases reservation');
select is(
  (select recovered_count from public.recover_expired_ai_runs(
    'a7000000-0000-4a00-8a00-000000000001', (select id from rfix where label = 'conversation')
  )),
  0,
  'recovery is idempotent'
);

reset role;
create temporary table completion_run(id uuid);
grant select on completion_run to service_role;
with inserted as (
  insert into public.ai_runs(user_id, conversation_id, status, credit_reserved)
  values (
    'a7000000-0000-4a00-8a00-000000000001',
    (select id from rfix where label = 'conversation'),
    'running', true
  ) returning id
)
insert into completion_run select id from inserted;

set local role service_role;
select isnt(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from completion_run), 'stable answer', 1, 2, 0, 'request'
  )),
  null::uuid,
  'completion creates an assistant message'
);
select is(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from completion_run), 'stable answer', 1, 2, 0, 'request'
  )),
  (select assistant_message_id from public.ai_runs where id = (select id from completion_run)),
  'same completion safely replays'
);
select is(
  (select count(*) from public.ai_messages
   where id = (select assistant_message_id from public.ai_runs where id = (select id from completion_run))),
  1::bigint,
  'completion retry creates no duplicate assistant message'
);
select throws_ok(
  $$ select * from public.complete_ai_generation(
    (select id from completion_run), 'conflicting answer', 1, 2, 0, 'request'
  ) $$,
  'P0001', 'idempotency_conflict',
  'conflicting completed result is rejected'
);
select is(
  (select credits_remaining from public.fail_ai_generation(
    (select id from completion_run), 'backend_unavailable', 'failed'
  )),
  (select trial_credits_remaining from public.ai_credit_accounts
   where user_id = 'a7000000-0000-4a00-8a00-000000000001'),
  'completed run is never refunded'
);
select is((select status from public.ai_runs where id = (select id from completion_run)), 'completed',
  'failure compensation cannot overwrite completion');
select ok(
  (select lease_expires_at <= now() from public.ai_runs where id = (select id from completion_run)),
  'completed run closes its lease'
);

select * from finish();
rollback;
