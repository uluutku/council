begin;

select plan(36);

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
  ('10000000-0000-4100-8100-000000000001', 'authenticated', 'authenticated', 'access-message-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4200-8200-000000000002', 'authenticated', 'authenticated', 'access-message-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4300-8300-000000000003', 'authenticated', 'authenticated', 'access-message-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

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

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select * from public.create_or_get_direct_conversation(
  '20000000-0000-4200-8200-000000000002'
);

select * from public.send_message(
  (
    select conversation_id
    from public.direct_conversation_pairs
    limit 1
  ),
  'c3000000-0000-4300-8300-000000000001',
  'protected message',
  null
);

select * from public.add_message_reaction(
  (
    select id
    from public.messages
    where client_message_id = 'c3000000-0000-4300-8300-000000000001'
  ),
  '👍'
);

select throws_ok(
  $$
    insert into public.conversations (type, created_by)
    values ('direct', '10000000-0000-4100-8100-000000000001')
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert conversations'
);
select throws_ok(
  $$ update public.conversations set last_sequence = 10 $$,
  '42501',
  null,
  'authenticated users cannot directly update conversations'
);
select throws_ok(
  $$ delete from public.conversations $$,
  '42501',
  null,
  'authenticated users cannot directly delete conversations'
);
select throws_ok(
  $$
    insert into public.direct_conversation_pairs (
      conversation_id,
      user_low_id,
      user_high_id
    )
    values (
      extensions.gen_random_uuid(),
      '10000000-0000-4100-8100-000000000001',
      '30000000-0000-4300-8300-000000000003'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert pair rows'
);
select throws_ok(
  $$ update public.direct_conversation_pairs set created_at = now() $$,
  '42501',
  null,
  'authenticated users cannot directly update pair rows'
);
select throws_ok(
  $$ delete from public.direct_conversation_pairs $$,
  '42501',
  null,
  'authenticated users cannot directly delete pair rows'
);
select throws_ok(
  $$
    insert into public.conversation_members (conversation_id, user_id)
    select id, '30000000-0000-4300-8300-000000000003'
    from public.conversations
    limit 1
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert members'
);
select throws_ok(
  $$ update public.conversation_members set last_read_sequence = 1 $$,
  '42501',
  null,
  'authenticated users cannot directly alter receipt state'
);
select throws_ok(
  $$ delete from public.conversation_members $$,
  '42501',
  null,
  'authenticated users cannot directly delete members'
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
    select
      id,
      99,
      '10000000-0000-4100-8100-000000000001',
      extensions.gen_random_uuid(),
      'direct write',
      'hash'
    from public.conversations
    limit 1
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert messages'
);
select throws_ok(
  $$ update public.messages set content = 'direct edit' $$,
  '42501',
  null,
  'authenticated users cannot directly update messages'
);
select throws_ok(
  $$ delete from public.messages $$,
  '42501',
  null,
  'authenticated users cannot directly hard-delete messages'
);
select throws_ok(
  $$
    insert into public.message_reactions (message_id, user_id, emoji)
    select id, '10000000-0000-4100-8100-000000000001', '👀'
    from public.messages
    limit 1
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert reactions'
);
select throws_ok(
  $$ delete from public.message_reactions $$,
  '42501',
  null,
  'authenticated users cannot directly delete reactions'
);

select throws_ok(
  $$
    select private.is_conversation_member(
      (select id from public.conversations limit 1),
      '10000000-0000-4100-8100-000000000001'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot execute the arbitrary-identity membership helper'
);
select throws_ok(
  $$
    select private.can_pair_message(
      '10000000-0000-4100-8100-000000000001',
      '20000000-0000-4200-8200-000000000002'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot execute the pair authorization helper'
);
select ok(
  private.is_current_user_conversation_member(
    (select id from public.conversations limit 1)
  ),
  'authenticated users receive only the current-user helper required by RLS'
);

reset role;

create temporary table test_access_ids as
select
  (select id from public.conversations limit 1) as conversation_id,
  (select id from public.messages limit 1) as message_id;

grant select on test_access_ids to authenticated, anon;

set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.delete_message((select message_id from test_access_ids))
  $$,
  'P0001',
  'action_not_permitted',
  'the other participant cannot delete the sender message'
);

reset role;
set local request.jwt.claim.sub = '30000000-0000-4300-8300-000000000003';
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.delete_message((select message_id from test_access_ids))
  $$,
  'P0001',
  'message_not_found',
  'an unrelated user cannot infer a message through deletion'
);

select is(
  (select count(*)::integer from public.messages),
  0,
  'an unrelated user cannot read messages directly'
);

select is(
  (select count(*)::integer from public.message_reactions),
  0,
  'an unrelated user cannot read reactions directly'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;

select throws_ok(
  $$ select * from public.conversations $$,
  '42501',
  null,
  'anonymous users cannot read conversations'
);
select throws_ok(
  $$ select * from public.direct_conversation_pairs $$,
  '42501',
  null,
  'anonymous users cannot read direct pairs'
);
select throws_ok(
  $$ select * from public.conversation_members $$,
  '42501',
  null,
  'anonymous users cannot read memberships'
);
select throws_ok(
  $$ select * from public.messages $$,
  '42501',
  null,
  'anonymous users cannot read messages'
);
select throws_ok(
  $$ select * from public.message_reactions $$,
  '42501',
  null,
  'anonymous users cannot read reactions'
);
select throws_ok(
  $$
    select *
    from public.create_or_get_direct_conversation(
      '20000000-0000-4200-8200-000000000002'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot create conversations'
);
select throws_ok(
  $$ select * from public.list_my_conversations() $$,
  '42501',
  null,
  'anonymous users cannot enumerate conversations'
);
select throws_ok(
  $$
    select *
    from public.list_conversation_messages(
      (select conversation_id from test_access_ids),
      null,
      50
    )
  $$,
  '42501',
  null,
  'anonymous users cannot list messages'
);
select throws_ok(
  $$
    select *
    from public.send_message(
      (select conversation_id from test_access_ids),
      extensions.gen_random_uuid(),
      'anonymous',
      null
    )
  $$,
  '42501',
  null,
  'anonymous users cannot send messages'
);
select throws_ok(
  $$
    select *
    from public.edit_message(
      (select message_id from test_access_ids),
      'anonymous edit'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot edit messages'
);
select throws_ok(
  $$
    select *
    from public.delete_message((select message_id from test_access_ids))
  $$,
  '42501',
  null,
  'anonymous users cannot delete messages'
);
select throws_ok(
  $$
    select *
    from public.add_message_reaction(
      (select message_id from test_access_ids),
      '👀'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot add reactions'
);
select throws_ok(
  $$
    select public.remove_message_reaction(
      (select message_id from test_access_ids),
      '👍'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot remove reactions'
);
select throws_ok(
  $$
    select *
    from public.mark_conversation_delivered(
      (select conversation_id from test_access_ids),
      1
    )
  $$,
  '42501',
  null,
  'anonymous users cannot update delivered state'
);
select throws_ok(
  $$
    select *
    from public.mark_conversation_read(
      (select conversation_id from test_access_ids),
      1
    )
  $$,
  '42501',
  null,
  'anonymous users cannot update read state'
);

select * from finish();

rollback;
