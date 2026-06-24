begin;

select plan(21);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('ad000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'delete-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bd000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'delete-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('cd000000-0000-4c00-8c00-000000000003', 'authenticated', 'authenticated', 'delete-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles set username = 'deletea', display_name = 'Delete A'
where id = 'ad000000-0000-4a00-8a00-000000000001';
update public.profiles set username = 'deleteb', display_name = 'Delete B'
where id = 'bd000000-0000-4b00-8b00-000000000002';
update public.profiles set username = 'deletec', display_name = 'Delete C'
where id = 'cd000000-0000-4c00-8c00-000000000003';

insert into public.contact_relationships(
  user_low_id, user_high_id, requested_by, status, responded_at
) values (
  'ad000000-0000-4a00-8a00-000000000001',
  'bd000000-0000-4b00-8b00-000000000002',
  'ad000000-0000-4a00-8a00-000000000001', 'accepted', now()
);

create temporary table dfix(label text primary key, id uuid, sequence bigint);
grant select, insert, update on dfix to authenticated, service_role, anon;

set local request.jwt.claim.sub = 'ad000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into dfix(label, id)
select 'human_conversation', conversation_id
from public.create_or_get_direct_conversation('bd000000-0000-4b00-8b00-000000000002');

insert into dfix(label, id, sequence)
select 'human_message_1', id, sequence
from public.send_message(
  (select id from dfix where label = 'human_conversation'),
  'ed000000-0000-4e00-8e00-000000000001',
  'Alpha before deletion',
  null
);

reset role;
set local request.jwt.claim.sub = 'bd000000-0000-4b00-8b00-000000000002';
set local role authenticated;
insert into dfix(label, id, sequence)
select 'human_message_2', id, sequence
from public.send_message(
  (select id from dfix where label = 'human_conversation'),
  'ed000000-0000-4e00-8e00-000000000002',
  'Beta before deletion',
  null
);

reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select deleted_through_sequence from public.delete_conversation_for_me(
    (select id from dfix where label = 'human_conversation')
  )),
  2::bigint,
  'a member deletes their human chat through the current sequence'
);
select is(
  (select count(*) from public.list_my_conversations()),
  0::bigint,
  'the deleted human chat is hidden from the deleting member inbox'
);
select is(
  (select count(*) from public.list_conversation_messages(
    (select id from dfix where label = 'human_conversation')
  )),
  0::bigint,
  'the deleting member no longer sees messages through the deleted sequence'
);
select is(
  (select count(*) from public.search_my_messages('Alpha')),
  0::bigint,
  'message search excludes deleted human chat history for the deleting member'
);
select is(
  (select deleted_through_sequence from public.conversation_preferences
   where conversation_id = (select id from dfix where label = 'human_conversation')),
  2::bigint,
  'the deleting member can read their own deletion preference'
);
select throws_ok(
  $$ update public.conversation_preferences
     set deleted_through_sequence = 0
     where conversation_id = (select id from dfix where label = 'human_conversation') $$,
  '42501', null,
  'a member cannot directly mutate their deletion preference'
);

reset role;
set local request.jwt.claim.sub = 'bd000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is(
  (select count(*) from public.conversation_preferences),
  0::bigint,
  'the peer cannot read the deleting member preference'
);
select is(
  (select count(*) from public.list_my_conversations()),
  1::bigint,
  'the peer still sees the shared human chat'
);
select is(
  (select count(*) from public.list_conversation_messages(
    (select id from dfix where label = 'human_conversation')
  )),
  2::bigint,
  'the peer still sees the original human chat history'
);
insert into dfix(label, id, sequence)
select 'human_message_3', id, sequence
from public.send_message(
  (select id from dfix where label = 'human_conversation'),
  'ed000000-0000-4e00-8e00-000000000003',
  'Gamma after deletion',
  null
);

reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select count(*) from public.list_my_conversations()),
  1::bigint,
  'a newer peer message makes the deleted human chat visible again'
);
select is(
  (select unread_count from public.list_my_conversations()
   where conversation_id = (select id from dfix where label = 'human_conversation')),
  1::bigint,
  'unread count starts after the deleted sequence'
);
select is(
  (select string_agg(content, ', ' order by sequence)
   from public.list_conversation_messages((select id from dfix where label = 'human_conversation'))),
  'Gamma after deletion',
  'only newer human messages are visible after deletion'
);
select throws_ok(
  $$ select * from public.get_message_window(
       (select id from dfix where label = 'human_conversation'),
       (select id from dfix where label = 'human_message_1'),
       10
     ) $$,
  'P0001', 'message_not_found',
  'message windows cannot reopen deleted human history'
);

reset role;
set local request.jwt.claim.sub = 'cd000000-0000-4c00-8c00-000000000003';
set local role authenticated;
select throws_ok(
  $$ select * from public.delete_conversation_for_me(
       (select id from dfix where label = 'human_conversation')
     ) $$,
  'P0001', 'conversation_not_found',
  'an unrelated user cannot delete another human conversation'
);

reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into dfix(label, id)
select 'agent', id from public.ai_agents where slug = 'council-assistant';
insert into dfix(label, id)
select 'ai_conversation', id
from public.get_or_create_ai_conversation((select id from dfix where label = 'agent'));

reset role;
set local role service_role;
insert into public.ai_messages(conversation_id, role, content)
values ((select id from dfix where label = 'ai_conversation'), 'user', 'AI history');

reset role;
set local request.jwt.claim.sub = 'bd000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select throws_ok(
  $$ select public.delete_ai_conversation((select id from dfix where label = 'ai_conversation')) $$,
  'P0001', 'ai_conversation_not_found',
  'another user cannot delete an AI conversation they do not own'
);

reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  public.delete_ai_conversation((select id from dfix where label = 'ai_conversation')),
  (select id from dfix where label = 'ai_conversation'),
  'the owner can delete an inactive AI conversation'
);
select is(
  (select count(*)::int from public.list_my_ai_conversations()),
  0,
  'deleted AI conversations leave the owner inbox'
);
select is(
  (select count(*)::int from public.ai_messages),
  0,
  'deleted AI conversations cascade owner-visible AI messages'
);

insert into dfix(label, id)
select 'ai_conversation_running', id
from public.get_or_create_ai_conversation((select id from dfix where label = 'agent'));
reset role;
set local role service_role;
insert into public.ai_runs(user_id, conversation_id, status, credit_reserved, credit_source)
values (
  'ad000000-0000-4a00-8a00-000000000001',
  (select id from dfix where label = 'ai_conversation_running'),
  'running',
  true,
  'trial'
);
reset role;
set local request.jwt.claim.sub = 'ad000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.delete_ai_conversation(
       (select id from dfix where label = 'ai_conversation_running')
     ) $$,
  'P0001', 'ai_run_in_progress',
  'AI chat deletion is rejected while a generation run is active'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from public.delete_conversation_for_me(
       (select id from dfix where label = 'human_conversation')
     ) $$,
  '42501', null,
  'anonymous users cannot delete human chats'
);
select throws_ok(
  $$ select public.delete_ai_conversation(
       (select id from dfix where label = 'ai_conversation_running')
     ) $$,
  '42501', null,
  'anonymous users cannot delete AI chats'
);

select * from finish();

rollback;
