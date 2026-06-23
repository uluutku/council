begin;

select plan(34);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('10000000-0000-4100-8100-000000000001', 'authenticated', 'authenticated', 'conversation-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4200-8200-000000000002', 'authenticated', 'authenticated', 'conversation-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4300-8300-000000000003', 'authenticated', 'authenticated', 'conversation-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('40000000-0000-4400-8400-000000000004', 'authenticated', 'authenticated', 'conversation-d@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('50000000-0000-4500-8500-000000000005', 'authenticated', 'authenticated', 'conversation-e@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('60000000-0000-4600-8600-000000000006', 'authenticated', 'authenticated', 'conversation-f@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set
  username = case id
    when '10000000-0000-4100-8100-000000000001' then 'alice_conv'
    when '20000000-0000-4200-8200-000000000002' then 'bob_conv'
    when '30000000-0000-4300-8300-000000000003' then 'charlie_conv'
    when '40000000-0000-4400-8400-000000000004' then 'dana_conv'
    when '50000000-0000-4500-8500-000000000005' then 'erin_conv'
    when '60000000-0000-4600-8600-000000000006' then 'farah_conv'
  end,
  display_name = 'Private display',
  bio = 'Biography must not be returned by conversation listing'
where id in (
  '10000000-0000-4100-8100-000000000001',
  '20000000-0000-4200-8200-000000000002',
  '30000000-0000-4300-8300-000000000003',
  '40000000-0000-4400-8400-000000000004',
  '50000000-0000-4500-8500-000000000005',
  '60000000-0000-4600-8600-000000000006'
);

insert into public.contact_relationships (
  user_low_id,
  user_high_id,
  requested_by,
  status,
  responded_at
)
values (
  '10000000-0000-4100-8100-000000000001',
  '20000000-0000-4200-8200-000000000002',
  '10000000-0000-4100-8100-000000000001',
  'accepted',
  now()
);

insert into public.contact_relationships (
  user_low_id,
  user_high_id,
  requested_by,
  status
)
values (
  '10000000-0000-4100-8100-000000000001',
  '30000000-0000-4300-8300-000000000003',
  '10000000-0000-4100-8100-000000000001',
  'pending'
);

insert into public.contact_relationships (
  user_low_id,
  user_high_id,
  requested_by,
  status,
  responded_at
)
values (
  '10000000-0000-4100-8100-000000000001',
  '40000000-0000-4400-8400-000000000004',
  '10000000-0000-4100-8100-000000000001',
  'rejected',
  now()
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '60000000-0000-4600-8600-000000000006',
  '10000000-0000-4100-8100-000000000001'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select isnt(
  (
    select conversation_id
    from public.create_or_get_direct_conversation(
      '20000000-0000-4200-8200-000000000002'
    )
  ),
  null::uuid,
  'accepted contacts can create a direct conversation'
);

select is(
  (
    select conversation_id
    from public.create_or_get_direct_conversation(
      '20000000-0000-4200-8200-000000000002'
    )
  ),
  (
    select conversation_id
    from public.direct_conversation_pairs
    where user_low_id = '10000000-0000-4100-8100-000000000001'
      and user_high_id = '20000000-0000-4200-8200-000000000002'
  ),
  'repeated creation returns the existing conversation'
);

select throws_ok(
  $$
    select *
    from public.create_or_get_direct_conversation(
      '10000000-0000-4100-8100-000000000001'
    )
  $$,
  'P0001',
  'conversation_unavailable',
  'self conversation creation fails generically'
);

select throws_ok(
  $$
    select *
    from public.create_or_get_direct_conversation(
      '99999999-9999-4999-8999-999999999999'
    )
  $$,
  'P0001',
  'conversation_unavailable',
  'missing targets fail generically'
);

select throws_ok(
  $$
    select *
    from public.create_or_get_direct_conversation(
      '30000000-0000-4300-8300-000000000003'
    )
  $$,
  'P0001',
  'conversation_unavailable',
  'pending contacts cannot create a conversation'
);

select throws_ok(
  $$
    select *
    from public.create_or_get_direct_conversation(
      '40000000-0000-4400-8400-000000000004'
    )
  $$,
  'P0001',
  'conversation_unavailable',
  'rejected contacts cannot create a conversation'
);

select throws_ok(
  $$
    select *
    from public.create_or_get_direct_conversation(
      '50000000-0000-4500-8500-000000000005'
    )
  $$,
  'P0001',
  'conversation_unavailable',
  'non-contacts cannot create a conversation'
);

select throws_ok(
  $$
    select *
    from public.create_or_get_direct_conversation(
      '60000000-0000-4600-8600-000000000006'
    )
  $$,
  'P0001',
  'conversation_unavailable',
  'a block in either direction prevents conversation creation'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.direct_conversation_pairs
    where user_low_id = '10000000-0000-4100-8100-000000000001'
      and user_high_id = '20000000-0000-4200-8200-000000000002'
  ),
  1,
  'one canonical pair row exists'
);

select is(
  (
    select count(*)::integer
    from public.conversation_members
    where conversation_id = (
      select conversation_id
      from public.direct_conversation_pairs
      where user_low_id = '10000000-0000-4100-8100-000000000001'
        and user_high_id = '20000000-0000-4200-8200-000000000002'
    )
  ),
  2,
  'conversation creation transactionally creates exactly two members'
);

select results_eq(
  $$
    select user_id
    from public.conversation_members
    where conversation_id = (
      select conversation_id
      from public.direct_conversation_pairs
      where user_low_id = '10000000-0000-4100-8100-000000000001'
        and user_high_id = '20000000-0000-4200-8200-000000000002'
    )
    order by user_id
  $$,
  $$
    values
      ('10000000-0000-4100-8100-000000000001'::uuid),
      ('20000000-0000-4200-8200-000000000002'::uuid)
  $$,
  'the two members match the canonical pair'
);

select is(
  (
    select count(*)::integer
    from public.conversations
  ),
  1,
  'failed creation attempts leave no partial conversations'
);

select ok(
  (
    select provolatile = 'v'
    from pg_proc
    where oid = 'private.lock_social_pair(uuid,uuid)'::regprocedure
  ),
  'conversation creation reuses the transaction-level pair lock'
);

set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select is(
  (
    select conversation_id
    from public.create_or_get_direct_conversation(
      '10000000-0000-4100-8100-000000000001'
    )
  ),
  (
    select conversation_id
    from public.direct_conversation_pairs
    limit 1
  ),
  'reverse-direction creation returns the same conversation'
);

select is(
  (select count(*)::integer from public.conversations),
  1,
  'the second member can read their conversation'
);

select is(
  (select count(*)::integer from public.conversation_members),
  2,
  'a member can read both membership rows for their conversation'
);

select is(
  (select count(*)::integer from public.direct_conversation_pairs),
  1,
  'a member can read the direct pair row'
);

reset role;
set local request.jwt.claim.sub = '30000000-0000-4300-8300-000000000003';
set local role authenticated;

select is(
  (select count(*)::integer from public.conversations),
  0,
  'an unrelated user cannot read the conversation'
);

select is(
  (select count(*)::integer from public.conversation_members),
  0,
  'an unrelated user cannot read membership rows'
);

select is(
  (select count(*)::integer from public.direct_conversation_pairs),
  0,
  'an unrelated user cannot read the pair row'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select ok(
  public.remove_contact('20000000-0000-4200-8200-000000000002'),
  'an accepted contact relationship can be removed'
);

select is(
  (select count(*)::integer from public.conversations),
  1,
  'conversation history remains visible after contact removal'
);

select is(
  (select can_send from public.list_my_conversations()),
  false,
  'conversation listing reports generic send unavailability after removal'
);

select is(
  (select peer_username from public.list_my_conversations()),
  null,
  'profile fields become unavailable after relationship removal'
);

select is(
  pg_get_function_result(
    'public.list_my_conversations(integer,timestamp with time zone,uuid)'::regprocedure
  ),
  'TABLE(conversation_id uuid, conversation_type text, peer_id uuid, peer_username text, peer_display_name text, peer_avatar_path text, peer_status_text text, last_message_id uuid, last_message_content text, last_message_deleted boolean, last_message_sender_id uuid, last_message_sequence bigint, last_message_at timestamp with time zone, last_read_sequence bigint, last_delivered_sequence bigint, unread_count bigint, can_send boolean, updated_at timestamp with time zone, muted_until timestamp with time zone, muted_forever boolean, is_muted boolean)',
  'conversation listing exposes no email, biography, settings, or block direction'
);

select is(
  (
    public.send_contact_request(
      '20000000-0000-4200-8200-000000000002'
    )
  ).status,
  'pending',
  'removed contacts can begin reconnecting'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select is(
  (
    public.send_contact_request(
      '10000000-0000-4100-8100-000000000001'
    )
  ).status,
  'accepted',
  'a reciprocal request reaccepts the pair'
);

select is(
  (
    select conversation_id
    from public.create_or_get_direct_conversation(
      '10000000-0000-4100-8100-000000000001'
    )
  ),
  (
    select conversation_id
    from public.direct_conversation_pairs
    limit 1
  ),
  'reaccepted contacts resume the existing conversation'
);

select is(
  (select can_send from public.list_my_conversations()),
  true,
  'reaccepted contacts regain send availability'
);

select ok(
  public.block_user('10000000-0000-4100-8100-000000000001'),
  'one participant can block the other'
);

select is(
  (select count(*)::integer from public.conversations),
  1,
  'the blocker retains historical conversation access'
);

select is(
  (select can_send from public.list_my_conversations()),
  false,
  'blocking produces the same generic can-send false result'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select is(
  (select count(*)::integer from public.conversations),
  1,
  'the blocked participant also retains historical conversation access'
);

select is(
  (select can_send from public.list_my_conversations()),
  false,
  'the blocked participant sees no block-direction detail'
);

select * from finish();

rollback;
