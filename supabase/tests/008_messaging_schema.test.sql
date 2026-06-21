begin;

select plan(43);

select has_table('public', 'conversations', 'conversations table exists');
select has_table(
  'public',
  'direct_conversation_pairs',
  'direct conversation pairs table exists'
);
select has_table(
  'public',
  'conversation_members',
  'conversation members table exists'
);
select has_table('public', 'messages', 'messages table exists');
select has_table('public', 'message_reactions', 'message reactions table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.conversations'::regclass),
  'conversations has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.direct_conversation_pairs'::regclass
  ),
  'direct conversation pairs has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.conversation_members'::regclass
  ),
  'conversation members has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.messages'::regclass),
  'messages has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.message_reactions'::regclass
  ),
  'message reactions has RLS enabled'
);

select col_is_fk(
  'public',
  'conversations',
  'created_by',
  'conversation creator references Auth users'
);
select col_is_fk(
  'public',
  'direct_conversation_pairs',
  'conversation_id',
  'direct pair references conversation'
);
select col_is_fk(
  'public',
  'conversation_members',
  'conversation_id',
  'membership references conversation'
);
select col_is_fk(
  'public',
  'messages',
  'conversation_id',
  'message references conversation'
);
select col_is_fk(
  'public',
  'message_reactions',
  'message_id',
  'reaction references message'
);

select has_index(
  'public',
  'direct_conversation_pairs',
  'direct_conversation_pairs_unique_pair',
  'canonical direct pairs are unique'
);
select has_index(
  'public',
  'conversation_members',
  'conversation_members_user_conversation_idx',
  'membership lookup by user is indexed'
);
select has_index(
  'public',
  'conversations',
  'conversations_activity_idx',
  'conversation activity ordering is indexed'
);
select has_index(
  'public',
  'messages',
  'messages_conversation_sequence_idx',
  'message sequence pagination is indexed'
);
select has_index(
  'public',
  'messages',
  'messages_sender_client_key',
  'sender idempotency keys are globally unique'
);
select has_index(
  'public',
  'message_reactions',
  'message_reactions_message_order_idx',
  'reaction lookup and ordering is indexed'
);

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
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'schema-message-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'schema-message-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'schema-message-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.conversations (
  id,
  type,
  created_by
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'direct',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.direct_conversation_pairs (
  conversation_id,
  user_low_id,
  user_high_id
)
values (
  'a0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);

select throws_ok(
  $$
    insert into public.conversations (type, created_by)
    values ('group', '10000000-0000-4000-8000-000000000001')
  $$,
  '23514',
  null,
  'unsupported conversation types are rejected'
);

select throws_ok(
  $$
    insert into public.direct_conversation_pairs (
      conversation_id,
      user_low_id,
      user_high_id
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  null,
  'reverse direct pairs are rejected'
);

select throws_ok(
  $$
    insert into public.direct_conversation_pairs (
      conversation_id,
      user_low_id,
      user_high_id
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  null,
  'self direct pairs are rejected'
);

insert into public.conversation_members (conversation_id, user_id)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  );

select is(
  (
    select count(*)::integer
    from public.conversation_members
    where conversation_id = 'a0000000-0000-4000-8000-000000000001'
  ),
  2,
  'a direct conversation can contain its two canonical members'
);

select throws_ok(
  $$
    insert into public.conversation_members (conversation_id, user_id)
    values (
      'a0000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  'direct conversation member must belong to the canonical pair',
  'a third user cannot be inserted as a direct-conversation member'
);

select throws_ok(
  $$
    update public.conversation_members
    set last_delivered_sequence = -1
    where conversation_id = 'a0000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'negative receipt sequences are rejected'
);

select throws_ok(
  $$
    update public.conversation_members
    set last_delivered_sequence = 1
    where conversation_id = 'a0000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'conversation receipt sequence exceeds current conversation sequence',
  'receipt sequences cannot exceed the conversation sequence'
);

update public.conversations
set last_sequence = 2
where id = 'a0000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    insert into public.messages (
      id,
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      idempotency_payload_hash
    )
    values (
      'b0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001',
      1,
      '10000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'hello',
      'hash-1'
    )
  $$,
  'a valid active text message is accepted'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      idempotency_payload_hash
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      1,
      '20000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000002',
      'duplicate sequence',
      'hash-2'
    )
  $$,
  '23505',
  null,
  'message sequence is unique within a conversation'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      idempotency_payload_hash
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      2,
      '10000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'duplicate client id',
      'hash-3'
    )
  $$,
  '23505',
  null,
  'sender and client message id are unique'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      idempotency_payload_hash
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      2,
      '20000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000003',
      '   ',
      'hash-4'
    )
  $$,
  '23514',
  null,
  'blank active message content is rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      idempotency_payload_hash
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      2,
      '20000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000004',
      repeat('x', 8001),
      'hash-5'
    )
  $$,
  '23514',
  null,
  'message content over 8000 characters is rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      deleted_at,
      idempotency_payload_hash
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      2,
      '20000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000005',
      'deleted content retained',
      now(),
      'hash-6'
    )
  $$,
  '23514',
  null,
  'deleted messages cannot retain content'
);

select lives_ok(
  $$
    insert into public.messages (
      id,
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      deleted_at,
      idempotency_payload_hash
    )
    values (
      'b0000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000001',
      2,
      '20000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000006',
      null,
      now(),
      'hash-7'
    )
  $$,
  'a content-free deleted-message tombstone is accepted'
);

select throws_ok(
  $$
    insert into public.message_reactions (message_id, user_id, emoji)
    values (
      'b0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      ' '
    )
  $$,
  '23514',
  null,
  'blank reactions are rejected'
);

select throws_ok(
  $$
    insert into public.message_reactions (message_id, user_id, emoji)
    values (
      'b0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      repeat('x', 33)
    )
  $$,
  '23514',
  null,
  'overlong reactions are rejected'
);

select lives_ok(
  $$
    insert into public.message_reactions (message_id, user_id, emoji)
    values (
      'b0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '👍'
    )
  $$,
  'a bounded reaction is accepted'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sequence,
      sender_user_id,
      client_message_id,
      content,
      reply_to_message_id,
      idempotency_payload_hash
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      3,
      '10000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000007',
      'bad reply',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'hash-8'
    )
  $$,
  '23514',
  'reply target must belong to the same conversation',
  'nonexistent reply targets are rejected'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.conversation_members'::regclass
      and tgname = 'conversation_members_validate_pair_and_receipts'
  ),
  'membership invariants are enforced by a trigger'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.messages'::regclass
      and tgname = 'messages_validate_membership_and_reply'
  ),
  'message sender and reply invariants are enforced by a trigger'
);

insert into public.conversations (id, type, created_by)
values (
  'd0000000-0000-4000-8000-000000000001',
  'direct',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.direct_conversation_pairs (
  conversation_id,
  user_low_id,
  user_high_id
)
values (
  'd0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003'
);

insert into public.conversation_members (conversation_id, user_id)
values
  (
    'd0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'd0000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003'
  );

delete from auth.users
where id = '30000000-0000-4000-8000-000000000003';

select is(
  (
    select count(*)::integer
    from public.conversations
    where id = 'd0000000-0000-4000-8000-000000000001'
  ),
  0,
  'deleting a non-creator participant does not leave an orphan conversation'
);

delete from auth.users
where id = '10000000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)::integer
    from public.conversations
    where id = 'a0000000-0000-4000-8000-000000000001'
  ),
  0,
  'deleting the Auth creator cascades the direct conversation'
);

select * from finish();

rollback;
