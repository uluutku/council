begin;

select plan(43);

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
  ('10000000-0000-4100-8100-000000000001', 'authenticated', 'authenticated', 'listing-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4200-8200-000000000002', 'authenticated', 'authenticated', 'listing-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4300-8300-000000000003', 'authenticated', 'authenticated', 'listing-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set
  username = case id
    when '10000000-0000-4100-8100-000000000001' then 'alice_list'
    when '20000000-0000-4200-8200-000000000002' then 'bob_list'
    when '30000000-0000-4300-8300-000000000003' then 'charlie_list'
  end,
  display_name = case id
    when '10000000-0000-4100-8100-000000000001' then 'Alice'
    when '20000000-0000-4200-8200-000000000002' then 'Bob'
    when '30000000-0000-4300-8300-000000000003' then 'Charlie'
  end,
  bio = 'Private biography'
where id in (
  '10000000-0000-4100-8100-000000000001',
  '20000000-0000-4200-8200-000000000002',
  '30000000-0000-4300-8300-000000000003'
);

insert into public.contact_relationships (
  user_low_id,
  user_high_id,
  requested_by,
  status,
  responded_at
)
values
  (
    '10000000-0000-4100-8100-000000000001',
    '20000000-0000-4200-8200-000000000002',
    '10000000-0000-4100-8100-000000000001',
    'accepted',
    now()
  ),
  (
    '10000000-0000-4100-8100-000000000001',
    '30000000-0000-4300-8300-000000000003',
    '10000000-0000-4100-8100-000000000001',
    'accepted',
    now()
  );

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select * from public.create_or_get_direct_conversation(
  '20000000-0000-4200-8200-000000000002'
);
select * from public.create_or_get_direct_conversation(
  '30000000-0000-4300-8300-000000000003'
);

select * from public.send_message(
  (
    select conversation_id
    from public.direct_conversation_pairs
    where user_high_id = '20000000-0000-4200-8200-000000000002'
  ),
  'c2000000-0000-4200-8200-000000000001',
  'A to B',
  null
);

select pg_sleep(0.01);

select * from public.send_message(
  (
    select conversation_id
    from public.direct_conversation_pairs
    where user_high_id = '30000000-0000-4300-8300-000000000003'
  ),
  'c2000000-0000-4200-8200-000000000002',
  'A to C',
  null
);

select is(
  (select count(*)::integer from public.list_my_conversations()),
  2,
  'conversation listing returns only the caller two conversations'
);

select is(
  (
    select peer_id
    from public.list_my_conversations()
    limit 1
  ),
  '30000000-0000-4300-8300-000000000003'::uuid,
  'conversation listing orders newest activity first'
);

select is(
  (
    with first_page as (
      select *
      from public.list_my_conversations(1, null, null)
    )
    select count(*)::integer
    from public.list_my_conversations(
      1,
      (select updated_at from first_page),
      (select conversation_id from first_page)
    )
  ),
  1,
  'conversation cursor pagination returns the next stable row'
);

select throws_ok(
  $$ select * from public.list_my_conversations(51, null, null) $$,
  'P0001',
  'invalid_cursor',
  'conversation result limits are bounded'
);

select throws_ok(
  $$ select * from public.list_my_conversations(10, now(), null) $$,
  'P0001',
  'invalid_cursor',
  'partial conversation cursors are rejected'
);

select is(
  (
    select peer_username
    from public.list_my_conversations()
    where peer_id = '20000000-0000-4200-8200-000000000002'
  ),
  'bob_list',
  'conversation listing returns the visible peer username'
);

select is(
  (
    select last_message_content
    from public.list_my_conversations()
    where peer_id = '20000000-0000-4200-8200-000000000002'
  ),
  'A to B',
  'conversation listing returns a safe active-message preview'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select * from public.send_message(
  (
    select conversation_id
    from public.direct_conversation_pairs
    where user_low_id = '10000000-0000-4100-8100-000000000001'
      and user_high_id = '20000000-0000-4200-8200-000000000002'
  ),
  'c2000000-0000-4200-8200-000000000003',
  'B to A',
  null
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select is(
  (
    select unread_count
    from public.list_my_conversations()
    where peer_id = '20000000-0000-4200-8200-000000000002'
  ),
  1::bigint,
  'a peer message increases unread count'
);

select results_eq(
  $$
    select last_delivered_sequence, last_read_sequence
    from public.mark_conversation_delivered(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      2
    )
  $$,
  $$ values (2::bigint, 1::bigint) $$,
  'a member can advance delivered state without advancing read state'
);

select results_eq(
  $$
    select last_delivered_sequence, last_read_sequence
    from public.mark_conversation_delivered(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      1
    )
  $$,
  $$ values (2::bigint, 1::bigint) $$,
  'out-of-order delivered events cannot move state backward'
);

select results_eq(
  $$
    select last_delivered_sequence, last_read_sequence
    from public.mark_conversation_read(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      2
    )
  $$,
  $$ values (2::bigint, 2::bigint) $$,
  'reading advances both read and delivered state'
);

select is(
  (
    select unread_count
    from public.list_my_conversations()
    where peer_id = '20000000-0000-4200-8200-000000000002'
  ),
  0::bigint,
  'unread count reaches zero and never becomes negative'
);

select throws_ok(
  $$
    select *
    from public.mark_conversation_read(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      3
    )
  $$,
  'P0001',
  'invalid_sequence',
  'receipt state cannot exceed current conversation sequence'
);

select throws_ok(
  $$
    select *
    from public.mark_conversation_delivered(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      -1
    )
  $$,
  'P0001',
  'invalid_sequence',
  'negative receipt sequences fail'
);

select is(
  (
    select emoji
    from public.add_message_reaction(
      (
        select id
        from public.messages
        where sender_user_id = '20000000-0000-4200-8200-000000000002'
          and client_message_id = 'c2000000-0000-4200-8200-000000000003'
      ),
      ' 👍 '
    )
  ),
  '👍',
  'an active member can add a normalized reaction'
);

select is(
  (
    select count(*)::integer
    from public.add_message_reaction(
      (
        select id
        from public.messages
        where sender_user_id = '20000000-0000-4200-8200-000000000002'
          and client_message_id = 'c2000000-0000-4200-8200-000000000003'
      ),
      '👍'
    )
  ),
  1,
  'adding the same reaction is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.message_reactions
    where message_id = (
      select id
      from public.messages
      where sender_user_id = '20000000-0000-4200-8200-000000000002'
        and client_message_id = 'c2000000-0000-4200-8200-000000000003'
    )
      and user_id = '10000000-0000-4100-8100-000000000001'
      and emoji = '👍'
  ),
  1,
  'idempotent reaction requests create one row'
);

select is(
  (
    select jsonb_array_length(reactions)
    from public.list_conversation_messages(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      null,
      50
    )
    where sequence = 2
  ),
  1,
  'message listing includes member-visible reactions'
);

select results_eq(
  $$
    select sequence
    from public.list_conversation_messages(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      null,
      50
    )
  $$,
  $$ values (2::bigint), (1::bigint) $$,
  'message listing is deterministically newest first'
);

select results_eq(
  $$
    select sequence
    from public.list_conversation_messages(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      2,
      50
    )
  $$,
  $$ values (1::bigint) $$,
  'message before-sequence pagination returns only older rows'
);

select throws_ok(
  $$
    select *
    from public.list_conversation_messages(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      null,
      101
    )
  $$,
  'P0001',
  'invalid_cursor',
  'message pages are bounded'
);

reset role;

create temporary table test_listing_ids as
select
  (
    select conversation_id
    from public.direct_conversation_pairs
    where user_low_id = '10000000-0000-4100-8100-000000000001'
      and user_high_id = '20000000-0000-4200-8200-000000000002'
  ) as conversation_id,
  (
    select id
    from public.messages
    where sender_user_id = '20000000-0000-4200-8200-000000000002'
      and client_message_id = 'c2000000-0000-4200-8200-000000000003'
  ) as message_id;

grant select on test_listing_ids to authenticated;

set local request.jwt.claim.sub = '30000000-0000-4300-8300-000000000003';
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.list_conversation_messages(
      (select conversation_id from test_listing_ids),
      null,
      50
    )
  $$,
  'P0001',
  'conversation_not_found',
  'an unrelated user cannot list another conversation messages'
);

select throws_ok(
  $$
    select *
    from public.add_message_reaction(
      (select message_id from test_listing_ids),
      '👀'
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'a non-member cannot react or infer message access'
);

select throws_ok(
  $$
    select *
    from public.mark_conversation_read(
      (select conversation_id from test_listing_ids),
      1
    )
  $$,
  'P0001',
  'conversation_not_found',
  'a non-member cannot update receipt state'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.add_message_reaction(
      (select message_id from test_listing_ids),
      '👍'
    )
  ),
  1,
  'the other member may use the same reaction'
);

select is(
  (
    select count(*)::integer
    from public.message_reactions
    where message_id = (select message_id from test_listing_ids)
      and emoji = '👍'
  ),
  2,
  'same emoji reactions remain distinct by user'
);

select is(
  (
    select count(*)::integer
    from public.add_message_reaction(
      (select message_id from test_listing_ids),
      '❤️'
    )
  ),
  1,
  'a member may add a different reaction'
);

select ok(
  public.remove_contact('10000000-0000-4100-8100-000000000001'),
  'the active contact relationship can be removed'
);

select throws_ok(
  $$
    select *
    from public.add_message_reaction(
      (select message_id from test_listing_ids),
      '🎉'
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'removed contacts cannot add reactions'
);

select ok(
  public.remove_message_reaction(
    (select message_id from test_listing_ids),
    '👍'
  ),
  'a user can remove their own reaction after contact removal'
);

select is(
  (
    select count(*)::integer
    from public.message_reactions
    where message_id = (select message_id from test_listing_ids)
      and emoji = '👍'
  ),
  1,
  'removing one user reaction does not remove another user reaction'
);

select ok(
  public.remove_message_reaction(
    (select message_id from test_listing_ids),
    '👍'
  ),
  'removing a missing own reaction is idempotent'
);

select is(
  (
    public.send_contact_request(
      '10000000-0000-4100-8100-000000000001'
    )
  ).status,
  'pending',
  'removed contacts can begin reconnection'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select is(
  (
    public.send_contact_request(
      '20000000-0000-4200-8200-000000000002'
    )
  ).status,
  'accepted',
  'reciprocal request restores contact status'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select isnt(
  (
    select deleted_at
    from public.delete_message((select message_id from test_listing_ids))
  ),
  null::timestamptz,
  'the sender can tombstone the reacted message'
);

select is(
  (
    select count(*)::integer
    from public.message_reactions
    where message_id = (select message_id from test_listing_ids)
  ),
  0,
  'tombstoning deletes all reactions in the same transaction'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select is(
  (
    select last_message_content
    from public.list_my_conversations()
    where peer_id = '20000000-0000-4200-8200-000000000002'
  ),
  null::text,
  'deleted last-message content is hidden from previews'
);

select is(
  (
    select last_message_deleted
    from public.list_my_conversations()
    where peer_id = '20000000-0000-4200-8200-000000000002'
  ),
  true,
  'conversation listing identifies a deleted preview without content'
);

select is(
  (
    select content
    from public.list_conversation_messages(
      (select conversation_id from test_listing_ids),
      null,
      50
    )
    where id = (select message_id from test_listing_ids)
  ),
  null::text,
  'message listing returns the tombstone without deleted content'
);

select throws_ok(
  $$
    select *
    from public.add_message_reaction(
      (select message_id from test_listing_ids),
      '👎'
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'deleted messages cannot receive new reactions'
);

select ok(
  public.block_user('20000000-0000-4200-8200-000000000002'),
  'a member can block the other after reactions existed'
);

select ok(
  public.remove_message_reaction(
    (
      select id
      from public.messages
      where sender_user_id = '10000000-0000-4100-8100-000000000001'
        and client_message_id = 'c2000000-0000-4200-8200-000000000001'
    ),
    'missing'
  ),
  'reaction removal remains idempotently available after blocking'
);

select is(
  (select can_send from public.list_my_conversations() where peer_id = '20000000-0000-4200-8200-000000000002'),
  false,
  'conversation listing uses the same can-send false value after blocking'
);

select * from finish();

rollback;
