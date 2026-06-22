begin;

select plan(27);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a5000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'forward-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b5000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'forward-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c5000000-0000-4c00-8c00-000000000003', 'authenticated', 'authenticated', 'forward-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set username = case id
  when 'a5000000-0000-4a00-8a00-000000000001' then 'forward_alice'
  when 'b5000000-0000-4b00-8b00-000000000002' then 'forward_bob'
  else 'forward_cara'
end,
display_name = case id
  when 'b5000000-0000-4b00-8b00-000000000002' then 'Bob Safe'
  else null
end
where id in (
  'a5000000-0000-4a00-8a00-000000000001',
  'b5000000-0000-4b00-8b00-000000000002',
  'c5000000-0000-4c00-8c00-000000000003'
);

create temporary table ffix (label text primary key, id uuid);
grant insert, select, update on ffix to authenticated, anon, service_role;

insert into public.conversations (id, type, created_by, last_sequence)
values
  ('d5000000-0000-4d00-8d00-000000000001', 'direct', 'a5000000-0000-4a00-8a00-000000000001', 26),
  ('d5000000-0000-4d00-8d00-000000000002', 'direct', 'b5000000-0000-4b00-8b00-000000000002', 1);
insert into public.direct_conversation_pairs (
  conversation_id, user_low_id, user_high_id
)
values
  (
    'd5000000-0000-4d00-8d00-000000000001',
    'a5000000-0000-4a00-8a00-000000000001',
    'b5000000-0000-4b00-8b00-000000000002'
  ),
  (
    'd5000000-0000-4d00-8d00-000000000002',
    'b5000000-0000-4b00-8b00-000000000002',
    'c5000000-0000-4c00-8c00-000000000003'
  );
insert into public.conversation_members (conversation_id, user_id)
values
  ('d5000000-0000-4d00-8d00-000000000001', 'a5000000-0000-4a00-8a00-000000000001'),
  ('d5000000-0000-4d00-8d00-000000000001', 'b5000000-0000-4b00-8b00-000000000002'),
  ('d5000000-0000-4d00-8d00-000000000002', 'b5000000-0000-4b00-8b00-000000000002'),
  ('d5000000-0000-4d00-8d00-000000000002', 'c5000000-0000-4c00-8c00-000000000003');

insert into public.messages (
  id, conversation_id, sequence, sender_user_id, client_message_id,
  content, idempotency_payload_hash, created_at, deleted_at, has_attachments
)
values
  ('e5000000-0000-4e00-8e00-000000000001', 'd5000000-0000-4d00-8d00-000000000001', 1, 'a5000000-0000-4a00-8a00-000000000001', gen_random_uuid(), 'First decision', repeat('a', 64), '2026-06-20 10:00:00+00', null, false),
  ('e5000000-0000-4e00-8e00-000000000002', 'd5000000-0000-4d00-8d00-000000000001', 2, 'b5000000-0000-4b00-8b00-000000000002', gen_random_uuid(), 'Second question', repeat('b', 64), '2026-06-20 10:01:00+00', null, true),
  ('e5000000-0000-4e00-8e00-000000000003', 'd5000000-0000-4d00-8d00-000000000001', 3, 'a5000000-0000-4a00-8a00-000000000001', gen_random_uuid(), null, repeat('c', 64), '2026-06-20 10:02:00+00', now(), false),
  ('e5000000-0000-4e00-8e00-000000000004', 'd5000000-0000-4d00-8d00-000000000001', 4, 'b5000000-0000-4b00-8b00-000000000002', gen_random_uuid(), null, repeat('d', 64), '2026-06-20 10:03:00+00', null, true),
  ('e5000000-0000-4e00-8e00-000000000005', 'd5000000-0000-4d00-8d00-000000000002', 1, 'b5000000-0000-4b00-8b00-000000000002', gen_random_uuid(), 'Other conversation', repeat('e', 64), '2026-06-20 10:04:00+00', null, false),
  ('e5000000-0000-4e00-8e00-000000000006', 'd5000000-0000-4d00-8d00-000000000001', 5, 'a5000000-0000-4a00-8a00-000000000001', gen_random_uuid(), repeat('x', 7000), repeat('f', 64), '2026-06-20 10:05:00+00', null, false),
  ('e5000000-0000-4e00-8e00-000000000007', 'd5000000-0000-4d00-8d00-000000000001', 6, 'a5000000-0000-4a00-8a00-000000000001', gen_random_uuid(), repeat('y', 7000), repeat('1', 64), '2026-06-20 10:06:00+00', null, false),
  ('e5000000-0000-4e00-8e00-000000000008', 'd5000000-0000-4d00-8d00-000000000001', 7, 'a5000000-0000-4a00-8a00-000000000001', gen_random_uuid(), repeat('z', 7000), repeat('2', 64), '2026-06-20 10:07:00+00', null, false);

insert into public.messages (
  id, conversation_id, sequence, sender_user_id, client_message_id,
  content, idempotency_payload_hash, created_at
)
select
  ('e6000000-0000-4e00-8e00-' || lpad(series::text, 12, '0'))::uuid,
  'd5000000-0000-4d00-8d00-000000000001',
  series + 7,
  'a5000000-0000-4a00-8a00-000000000001',
  gen_random_uuid(),
  'bounded ' || series,
  repeat('3', 64),
  '2026-06-20 11:00:00+00'::timestamptz + series * interval '1 minute'
from generate_series(1, 19) as series;

set local request.jwt.claim.sub = 'a5000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into ffix (label, id)
select 'agent', id from public.ai_agents where slug = 'council-assistant';
insert into ffix (label, id)
select 'ai_a', id from public.get_or_create_ai_conversation(
  (select id from ffix where label = 'agent'), null
);

reset role;
set local request.jwt.claim.sub = 'b5000000-0000-4b00-8b00-000000000002';
set local role authenticated;
insert into ffix (label, id)
select 'ai_b', id from public.get_or_create_ai_conversation(
  (select id from ffix where label = 'agent'), null
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_context_imports'::regclass),
  'imports have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_context_import_items'::regclass),
  'import items have RLS enabled'
);

reset role;
set local role service_role;
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a5000000-0000-4a00-8a00-000000000001',
       (select id from ffix where label = 'ai_a'),
       gen_random_uuid(), 'summarize', 'text-model', '{}',
       'd5000000-0000-4d00-8d00-000000000002',
       array['e5000000-0000-4e00-8e00-000000000005'::uuid]) $$,
  'P0001', 'source_conversation_unavailable',
  'source-conversation membership is required'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a5000000-0000-4a00-8a00-000000000001',
       (select id from ffix where label = 'ai_b'),
       gen_random_uuid(), 'summarize', 'text-model', '{}',
       'd5000000-0000-4d00-8d00-000000000001',
       array['e5000000-0000-4e00-8e00-000000000001'::uuid]) $$,
  'P0001', 'ai_conversation_not_found',
  'destination AI ownership is required'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a5000000-0000-4a00-8a00-000000000001',
       (select id from ffix where label = 'ai_a'),
       gen_random_uuid(), 'summarize', 'text-model', '{}',
       'd5000000-0000-4d00-8d00-000000000001',
       array['e5000000-0000-4e00-8e00-000000000003'::uuid]) $$,
  'P0001', 'source_message_unavailable', 'deleted messages are rejected'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a5000000-0000-4a00-8a00-000000000001',
       (select id from ffix where label = 'ai_a'),
       gen_random_uuid(), 'summarize', 'text-model', '{}',
       'd5000000-0000-4d00-8d00-000000000001',
       array['e5000000-0000-4e00-8e00-000000000004'::uuid]) $$,
  'P0001', 'source_message_unavailable', 'attachment-only messages are rejected'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a5000000-0000-4a00-8a00-000000000001',
       (select id from ffix where label = 'ai_a'),
       gen_random_uuid(), 'summarize', 'text-model', '{}',
       'd5000000-0000-4d00-8d00-000000000001',
       array['e5000000-0000-4e00-8e00-000000000001'::uuid,
             'e5000000-0000-4e00-8e00-000000000002'::uuid]
       || array(
         select ('e6000000-0000-4e00-8e00-' || lpad(series::text, 12, '0'))::uuid
         from generate_series(1, 19) as series
       )) $$,
  'P0001', 'invalid_context_import', 'more than twenty messages are rejected'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a5000000-0000-4a00-8a00-000000000001',
       (select id from ffix where label = 'ai_a'),
       gen_random_uuid(), 'summarize', 'text-model', '{}',
       'd5000000-0000-4d00-8d00-000000000001',
       array[
         'e5000000-0000-4e00-8e00-000000000006'::uuid,
         'e5000000-0000-4e00-8e00-000000000007'::uuid,
         'e5000000-0000-4e00-8e00-000000000008'::uuid
       ]) $$,
  'P0001', 'context_import_too_large', 'combined text above 20,000 characters is rejected'
);

insert into ffix (label, id)
select 'run', run_id from public.start_ai_generation(
  'a5000000-0000-4a00-8a00-000000000001',
  (select id from ffix where label = 'ai_a'),
  'a5100000-0000-4a10-8a10-000000000001',
  'Summarize decisions.', 'text-model', '{}',
  'd5000000-0000-4d00-8d00-000000000001',
  array[
    'e5000000-0000-4e00-8e00-000000000002'::uuid,
    'e5000000-0000-4e00-8e00-000000000001'::uuid
  ]
);

select is(
  (select count(*)::integer from public.ai_context_imports
   where user_id = 'a5000000-0000-4a00-8a00-000000000001'),
  1, 'one provenance record is created'
);
select is(
  (select string_agg(copied_content, '|' order by position)
   from public.ai_context_import_items),
  'First decision|Second question',
  'server-fetched copied content is ordered chronologically'
);
select is(
  (select string_agg(source_sender_label, '|' order by position)
   from public.ai_context_import_items),
  'You|Bob Safe', 'safe sender labels are derived server-side'
);
select ok(
  (select attachments_excluded from public.ai_context_import_items where position = 2),
  'text-plus-attachment records that attachments were excluded'
);
select ok(
  (select messages::text from public.load_ai_run_context(
    (select id from ffix where label = 'run'), 20))
    like '%User-confirmed copied context%First decision%Second question%User request%Summarize decisions.%',
  'the prompt includes delimited copied context followed by the user request'
);
select ok(
  (select messages::text from public.load_ai_run_context(
    (select id from ffix where label = 'run'), 20))
    not like '%forward-b@example.test%',
  'the prompt contains no human email address'
);
select isnt(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from ffix where label = 'run'), 'Summary complete', 1, 1, 0, null)),
  null, 'the import completes through the normal generation pipeline'
);
select is(
  (select is_replay from public.start_ai_generation(
    'a5000000-0000-4a00-8a00-000000000001',
    (select id from ffix where label = 'ai_a'),
    'a5100000-0000-4a10-8a10-000000000001',
    'Summarize decisions.', 'text-model', '{}',
    'd5000000-0000-4d00-8d00-000000000001',
    array[
      'e5000000-0000-4e00-8e00-000000000002'::uuid,
      'e5000000-0000-4e00-8e00-000000000001'::uuid
    ])),
  true, 'same request ID and selection replay idempotently'
);
select is(
  (select count(*)::integer from public.ai_context_imports
   where client_request_id = 'a5100000-0000-4a10-8a10-000000000001'),
  1, 'idempotent replay does not duplicate the import'
);

reset role;
set local request.jwt.claim.sub = 'a5000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select count(*)::integer
   from public.list_ai_messages((select id from ffix where label = 'ai_a'), 100)
   where client_message_id = 'a5100000-0000-4a10-8a10-000000000001'),
  1, 'idempotent replay does not duplicate the user message'
);

reset role;
set local role service_role;
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a5000000-0000-4a00-8a00-000000000001',
       (select id from ffix where label = 'ai_a'),
       'a5100000-0000-4a10-8a10-000000000001',
       'Summarize decisions.', 'text-model', '{}',
       'd5000000-0000-4d00-8d00-000000000001',
       array['e5000000-0000-4e00-8e00-000000000001'::uuid]) $$,
  'P0001', 'idempotency_conflict', 'request ID reuse with a different selection conflicts'
);
select throws_ok(
  $$ update public.ai_context_import_items set copied_content = 'changed' $$,
  'P0001', 'context_import_immutable', 'copied provenance cannot be updated'
);

reset role;
set local request.jwt.claim.sub = 'a5000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select count(*)::integer from public.ai_context_imports), 1,
  'the forwarding user can read their import through RLS'
);
select is(
  (select jsonb_array_length(context_import -> 'items')
   from public.list_ai_messages((select id from ffix where label = 'ai_a'), 100)
   where context_import is not null),
  2, 'the owner message contract returns the persistent context card'
);
select throws_ok(
  $$ insert into public.ai_context_imports (
       user_id, source_conversation_id, destination_ai_conversation_id,
       client_request_id, request_payload_hash, message_count, copied_character_count
     ) values (
       'a5000000-0000-4a00-8a00-000000000001',
       'd5000000-0000-4d00-8d00-000000000001',
       (select id from ffix where label = 'ai_a'),
       gen_random_uuid(), repeat('a', 64), 1, 1
     ) $$,
  '42501', null, 'authenticated users cannot mutate imports directly'
);

reset role;
set local request.jwt.claim.sub = 'b5000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is(
  (select count(*)::integer from public.ai_context_imports), 0,
  'the other human participant cannot read the import'
);
select is(
  (select count(*)::integer from public.ai_context_import_items), 0,
  'the other human participant cannot read copied items'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from public.ai_context_imports $$,
  '42501', null, 'anonymous users cannot read imports'
);
select throws_ok(
  $$ select * from public.list_ai_messages(
       (select id from ffix where label = 'ai_a'), 100) $$,
  '42501', null, 'anonymous users cannot call the AI message reader'
);

select * from finish();
rollback;
