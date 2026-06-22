begin;

select plan(40);

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
  ('10000000-0000-4100-8100-000000000001', 'authenticated', 'authenticated', 'message-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4200-8200-000000000002', 'authenticated', 'authenticated', 'message-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4300-8300-000000000003', 'authenticated', 'authenticated', 'message-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set username = case id
  when '10000000-0000-4100-8100-000000000001' then 'alice_msg'
  when '20000000-0000-4200-8200-000000000002' then 'bob_msg'
  when '30000000-0000-4300-8300-000000000003' then 'charlie_msg'
end
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

select is(
  (
    select content
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000001',
      '  first message  ',
      null
    )
  ),
  'first message',
  'send_message trims surrounding whitespace'
);

select is(
  (
    select sequence
    from public.messages
    where client_message_id = 'c1000000-0000-4100-8100-000000000001'
      and sender_user_id = '10000000-0000-4100-8100-000000000001'
  ),
  1::bigint,
  'the first message receives sequence one'
);

select is(
  (
    select sender_user_id
    from public.messages
    where client_message_id = 'c1000000-0000-4100-8100-000000000001'
      and sender_user_id = '10000000-0000-4100-8100-000000000001'
  ),
  '10000000-0000-4100-8100-000000000001'::uuid,
  'sender identity comes from auth.uid()'
);

select is(
  (
    select sequence
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000002',
      'second message',
      null
    )
  ),
  2::bigint,
  'subsequent sends allocate increasing sequences'
);

select is(
  (
    select last_sequence
    from public.conversations
    where id = (
      select conversation_id
      from public.direct_conversation_pairs
      where user_high_id = '20000000-0000-4200-8200-000000000002'
    )
  ),
  2::bigint,
  'successful sends advance conversation sequence metadata'
);

select isnt(
  (
    select last_message_at
    from public.conversations
    where id = (
      select conversation_id
      from public.direct_conversation_pairs
      where user_high_id = '20000000-0000-4200-8200-000000000002'
    )
  ),
  null::timestamptz,
  'successful sends update conversation activity'
);

select results_eq(
  $$
    select last_delivered_sequence, last_read_sequence
    from public.conversation_members
    where conversation_id = (
      select conversation_id
      from public.direct_conversation_pairs
      where user_high_id = '20000000-0000-4200-8200-000000000002'
    )
      and user_id = '10000000-0000-4100-8100-000000000001'
  $$,
  $$ values (2::bigint, 2::bigint) $$,
  'the sender automatically reads and receives through their own message'
);

select is(
  (
    select id
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000001',
      'first message',
      null
    )
  ),
  (
    select id
    from public.messages
    where sender_user_id = '10000000-0000-4100-8100-000000000001'
      and client_message_id = 'c1000000-0000-4100-8100-000000000001'
  ),
  'an identical idempotent retry returns the original message'
);

select is(
  (
    select count(*)::integer
    from public.messages
    where sender_user_id = '10000000-0000-4100-8100-000000000001'
      and client_message_id = 'c1000000-0000-4100-8100-000000000001'
  ),
  1,
  'an idempotent retry creates no duplicate'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000001',
      'changed payload',
      null
    )
  $$,
  'P0001',
  'idempotency_conflict',
  'reusing a client id with changed content fails'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '30000000-0000-4300-8300-000000000003'
      ),
      'c1000000-0000-4100-8100-000000000001',
      'first message',
      null
    )
  $$,
  'P0001',
  'idempotency_conflict',
  'reusing a client id in a different conversation fails'
);

select is(
  (
    select sequence
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '30000000-0000-4300-8300-000000000003'
      ),
      'c1000000-0000-4100-8100-000000000004',
      'other conversation',
      null
    )
  ),
  1::bigint,
  'a separate conversation has its own sequence space'
);

reset role;

create temporary table test_cross_reply_target as
select id
from public.messages
where client_message_id = 'c1000000-0000-4100-8100-000000000004';

grant select on test_cross_reply_target to authenticated;

set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select is(
  (
    select sequence
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000001',
      'same client id, different sender',
      null
    )
  ),
  3::bigint,
  'different users may independently use the same client message UUID'
);

select is(
  (
    select reply_to_message_id
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000005',
      'valid reply',
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000002'
      )
    )
  ),
  (
    select id
    from public.messages
    where sender_user_id = '10000000-0000-4100-8100-000000000001'
      and client_message_id = 'c1000000-0000-4100-8100-000000000002'
  ),
  'a reply to a message in the same conversation succeeds'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000006',
      'cross conversation reply',
      (select id from test_cross_reply_target)
    )
  $$,
  'P0001',
  'invalid_reply',
  'a reply cannot cross conversation boundaries'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000007',
      'missing reply',
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    )
  $$,
  'P0001',
  'invalid_reply',
  'a reply to a nonexistent message fails safely'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000008',
      '   ',
      null
    )
  $$,
  'P0001',
  'invalid_message_content',
  'whitespace-only content is rejected'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000009',
      repeat('x', 8001),
      null
    )
  $$,
  'P0001',
  'invalid_message_content',
  'overlong content is rejected'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select is(
  (
    select content
    from public.edit_message(
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000002'
      ),
      '  edited second message  '
    )
  ),
  'edited second message',
  'the sender can edit and normalize an active message'
);

select isnt(
  (
    select edited_at
    from public.messages
    where sender_user_id = '10000000-0000-4100-8100-000000000001'
      and client_message_id = 'c1000000-0000-4100-8100-000000000002'
  ),
  null::timestamptz,
  'editing records edited_at'
);

select is(
  (
    select sequence
    from public.messages
    where sender_user_id = '10000000-0000-4100-8100-000000000001'
      and client_message_id = 'c1000000-0000-4100-8100-000000000002'
  ),
  2::bigint,
  'editing preserves message sequence'
);

select is(
  (
    select updated_at = last_message_at
    from public.conversations
    where id = (
      select conversation_id
      from public.direct_conversation_pairs
      where user_low_id = '10000000-0000-4100-8100-000000000001'
        and user_high_id = '20000000-0000-4200-8200-000000000002'
    )
  ),
  true,
  'editing an old message does not reorder conversation activity'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.edit_message(
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000002'
      ),
      'not mine'
    )
  $$,
  'P0001',
  'message_not_editable',
  'the other participant cannot edit the sender message'
);

reset role;
set local request.jwt.claim.sub = '30000000-0000-4300-8300-000000000003';
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.edit_message(
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000002'
      ),
      'unrelated edit'
    )
  $$,
  'P0001',
  'message_not_found',
  'an unrelated user cannot edit the message'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select ok(
  public.remove_contact('20000000-0000-4200-8200-000000000002'),
  'the pair relationship can be removed'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000010',
      'not allowed after removal',
      null
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'removed contacts cannot send'
);

select throws_ok(
  $$
    select *
    from public.edit_message(
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000002'
      ),
      'not allowed after removal'
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'removed contacts cannot edit'
);

select isnt(
  (
    select deleted_at
    from public.delete_message(
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000001'
      )
    )
  ),
  null::timestamptz,
  'a sender may delete their historical message after contact removal'
);

select is(
  (
    select content
    from public.messages
    where sender_user_id = '10000000-0000-4100-8100-000000000001'
      and client_message_id = 'c1000000-0000-4100-8100-000000000001'
  ),
  null::text,
  'soft deletion clears message content'
);

select isnt(
  (
    select deleted_at
    from public.delete_message(
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000001'
      )
    )
  ),
  null::timestamptz,
  'repeated deletion is idempotent'
);

select is(
  (
    public.send_contact_request(
      '20000000-0000-4200-8200-000000000002'
    )
  ).status,
  'pending',
  'removed contacts can request reconnection'
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
  'reciprocal reconnection restores accepted contact status'
);

select isnt(
  (
    select id
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000011',
      'sending resumes',
      null
    )
  ),
  null::uuid,
  'reaccepted contacts can send in the existing conversation'
);

select isnt(
  (
    select id
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000012',
      'reply to tombstone',
      (
        select id
        from public.messages
        where sender_user_id = '10000000-0000-4100-8100-000000000001'
          and client_message_id = 'c1000000-0000-4100-8100-000000000001'
      )
    )
  ),
  null::uuid,
  'new replies may preserve structure by targeting an existing tombstone'
);

select ok(
  public.block_user('10000000-0000-4100-8100-000000000001'),
  'blocking removes the restored contact relationship'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000013',
      'blocked send',
      null
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'a blocked pair cannot send'
);

select throws_ok(
  $$
    select *
    from public.edit_message(
      (
        select id
        from public.messages
        where sender_user_id = '20000000-0000-4200-8200-000000000002'
          and client_message_id = 'c1000000-0000-4100-8100-000000000011'
      ),
      'blocked edit'
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'a blocked pair cannot edit'
);

select isnt(
  (
    select deleted_at
    from public.delete_message(
      (
        select id
        from public.messages
        where sender_user_id = '20000000-0000-4200-8200-000000000002'
          and client_message_id = 'c1000000-0000-4100-8100-000000000011'
      )
    )
  ),
  null::timestamptz,
  'a sender may still delete their message after blocking'
);

select ok(
  public.unblock_user('10000000-0000-4100-8100-000000000001'),
  'the blocker can unblock without restoring contact state'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      (
        select conversation_id
        from public.direct_conversation_pairs
        where user_low_id = '10000000-0000-4100-8100-000000000001'
          and user_high_id = '20000000-0000-4200-8200-000000000002'
      ),
      'c1000000-0000-4100-8100-000000000014',
      'unblocked but not contacts',
      null
    )
  $$,
  'P0001',
  'messaging_unavailable',
  'unblocking alone does not restore send permission'
);

select * from finish();

rollback;
