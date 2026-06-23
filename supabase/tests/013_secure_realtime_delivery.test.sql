begin;

select plan(53);

select has_function(
  'private',
  'conversation_realtime_topic',
  array['uuid'],
  'conversation topic helper exists'
);
select has_function(
  'private',
  'user_inbox_realtime_topic',
  array['uuid'],
  'user inbox topic helper exists'
);
select has_function(
  'private',
  'send_council_realtime_event',
  array[
    'text',
    'text',
    'timestamp with time zone',
    'uuid',
    'uuid',
    'bigint',
    'uuid',
    'bigint',
    'bigint',
    'bigint'
  ],
  'minimal event helper exists'
);
select has_function(
  'private',
  'can_receive_council_realtime_topic',
  array['text', 'uuid'],
  'Realtime authorization helper exists'
);

select is(
  private.conversation_realtime_topic(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'conversation:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'conversation topics are deterministic'
);
select is(
  private.user_inbox_realtime_topic(
    '11111111-1111-4111-8111-111111111111'
  ),
  'user:11111111-1111-4111-8111-111111111111:inbox',
  'inbox topics are deterministic'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.messages'::regclass
      and tgname = 'messages_emit_realtime'
  ),
  'messages have a Realtime trigger'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.message_reactions'::regclass
      and tgname = 'message_reactions_emit_realtime'
  ),
  'reactions have a Realtime trigger'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.conversation_members'::regclass
      and tgname = 'conversation_members_emit_receipt_realtime'
  ),
  'receipts have a Realtime trigger'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.conversation_members'::regclass
      and tgname = 'conversation_members_emit_created_realtime'
  ),
  'fully initialized conversations have a creation trigger'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.contact_relationships'::regclass
      and tgname = 'contact_relationships_emit_availability_realtime'
  ),
  'relationship availability changes have a trigger'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.user_blocks'::regclass
      and tgname = 'user_blocks_emit_availability_realtime'
  ),
  'block availability changes have a trigger'
);

select ok(
  has_table_privilege('authenticated', 'realtime.messages', 'INSERT'),
  'authenticated clients can attempt policy-limited ephemeral broadcasts'
);
select ok(
  not has_table_privilege('authenticated', 'realtime.messages', 'UPDATE'),
  'authenticated clients cannot update broadcasts'
);
select ok(
  not has_table_privilege('anon', 'realtime.messages', 'SELECT'),
  'anonymous clients cannot receive private broadcasts'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'council_private_topics_select'
      and cmd = 'SELECT'
  ),
  'Realtime messages has the Council private-topic receive policy'
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
  ('10000000-0000-4100-8100-000000000001', 'authenticated', 'authenticated', 'realtime-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4200-8200-000000000002', 'authenticated', 'authenticated', 'realtime-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4300-8300-000000000003', 'authenticated', 'authenticated', 'realtime-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

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

reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'conversation.created'
  ),
  2,
  'new conversation emits one creation event per participant inbox'
);
select results_eq(
  $$
    select topic
    from realtime.messages
    where event = 'conversation.created'
    order by topic
  $$,
  $$
    values
      ('user:10000000-0000-4100-8100-000000000001:inbox'::text),
      ('user:20000000-0000-4200-8200-000000000002:inbox'::text)
  $$,
  'conversation creation targets exactly the two private inbox topics'
);

set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;
select * from public.create_or_get_direct_conversation(
  '10000000-0000-4100-8100-000000000001'
);
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'conversation.created'
  ),
  2,
  'repeated create-or-get emits no duplicate creation event'
);

select ok(
  private.can_receive_council_realtime_topic(
    private.conversation_realtime_topic(
      (select conversation_id from public.direct_conversation_pairs limit 1)
    ),
    '10000000-0000-4100-8100-000000000001'
  ),
  'first member can receive the conversation topic'
);
select ok(
  private.can_receive_council_realtime_topic(
    private.conversation_realtime_topic(
      (select conversation_id from public.direct_conversation_pairs limit 1)
    ),
    '20000000-0000-4200-8200-000000000002'
  ),
  'second member can receive the conversation topic'
);
select ok(
  not private.can_receive_council_realtime_topic(
    private.conversation_realtime_topic(
      (select conversation_id from public.direct_conversation_pairs limit 1)
    ),
    '30000000-0000-4300-8300-000000000003'
  ),
  'unrelated users cannot receive the conversation topic'
);
select ok(
  private.can_receive_council_realtime_topic(
    'user:10000000-0000-4100-8100-000000000001:inbox',
    '10000000-0000-4100-8100-000000000001'
  ),
  'a user can receive their own inbox topic'
);
select ok(
  not private.can_receive_council_realtime_topic(
    'user:20000000-0000-4200-8200-000000000002:inbox',
    '10000000-0000-4100-8100-000000000001'
  ),
  'a user cannot receive another user inbox topic'
);
select ok(
  not private.can_receive_council_realtime_topic(
    'conversation:not-a-uuid',
    '10000000-0000-4100-8100-000000000001'
  ),
  'malformed conversation topics fail closed'
);
select ok(
  not private.can_receive_council_realtime_topic(
    'conversation:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:extra',
    '10000000-0000-4100-8100-000000000001'
  ),
  'similar-prefix conversation topics fail closed'
);
select ok(
  not private.can_receive_council_realtime_topic(
    'user:10000000-0000-4100-8100-000000000001:inbox:extra',
    '10000000-0000-4100-8100-000000000001'
  ),
  'similar-prefix inbox topics fail closed'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;

select * from public.send_message(
  (select conversation_id from public.direct_conversation_pairs limit 1),
  'c6000000-0000-4600-8600-000000000001',
  'private body that must not be broadcast',
  null
);

reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'message.created'
  ),
  1,
  'a real message insert emits one conversation event'
);
select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'conversation.changed'
  ),
  2,
  'a real message insert emits one inbox change per participant'
);
select ok(
  (
    select payload ?& array[
      'id',
      'version',
      'event',
      'occurred_at',
      'conversation_id',
      'entity_id',
      'sequence',
      'actor_user_id',
      'last_sequence'
    ]
    from realtime.messages
    where event = 'message.created'
  ),
  'message creation contains the strict identifier and sequence envelope'
);
select ok(
  (
    select not (
      payload ?| array[
        'content',
        'email',
        'bio',
        'settings',
        'emoji',
        'blocker_id',
        'blocked_id',
        'cause'
      ]
    )
    from realtime.messages
    where event = 'message.created'
  ),
  'message events contain no content or private fields'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select * from public.send_message(
  (select conversation_id from public.direct_conversation_pairs limit 1),
  'c6000000-0000-4600-8600-000000000001',
  'private body that must not be broadcast',
  null
);
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'message.created'
  ),
  1,
  'an idempotent message retry emits no duplicate event'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select throws_ok(
  $$
    select *
    from public.send_message(
      (select conversation_id from public.direct_conversation_pairs limit 1),
      'c6000000-0000-4600-8600-000000000002',
      '   ',
      null
    )
  $$,
  'P0001',
  'invalid_message_content',
  'failed message transactions still fail normally'
);
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'message.created'
  ),
  1,
  'a failed message transaction commits no event'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select * from public.edit_message(
  (select id from public.messages limit 1),
  'edited body that must not be broadcast'
);
reset role;

select is(
  (select count(*)::integer from realtime.messages where event = 'message.edited'),
  1,
  'a real edit emits one message event'
);
select ok(
  (
    select not (payload ? 'content')
    from realtime.messages
    where event = 'message.edited'
  ),
  'edit events contain no edited content'
);

set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;
select * from public.add_message_reaction(
  (select id from public.messages limit 1),
  '👍'
);
select * from public.add_message_reaction(
  (select id from public.messages limit 1),
  '👍'
);
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'reaction.changed'
  ),
  1,
  'duplicate reaction addition emits only one real-change event'
);
select ok(
  (
    select not (payload ? 'emoji')
    from realtime.messages
    where event = 'reaction.changed'
  ),
  'reaction events omit the reaction value'
);

set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;
select public.remove_message_reaction(
  (select id from public.messages limit 1),
  '👍'
);
select public.remove_message_reaction(
  (select id from public.messages limit 1),
  '👍'
);
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'reaction.changed'
  ),
  2,
  'missing-reaction removal emits no duplicate event'
);

set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;
select * from public.mark_conversation_delivered(
  (select conversation_id from public.direct_conversation_pairs limit 1),
  1
);
select * from public.mark_conversation_delivered(
  (select conversation_id from public.direct_conversation_pairs limit 1),
  1
);
select * from public.mark_conversation_read(
  (select conversation_id from public.direct_conversation_pairs limit 1),
  1
);
select * from public.mark_conversation_read(
  (select conversation_id from public.direct_conversation_pairs limit 1),
  1
);
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'receipt.changed'
      and payload ->> 'entity_id' =
        '20000000-0000-4200-8200-000000000002'
  ),
  2,
  'only actual delivered and read advancement emits receipt events'
);
select results_eq(
  $$
    select
      (payload ->> 'delivered_sequence')::bigint,
      (payload ->> 'read_sequence')::bigint
    from realtime.messages
    where event = 'receipt.changed'
      and payload ->> 'entity_id' =
        '20000000-0000-4200-8200-000000000002'
    order by (payload ->> 'read_sequence')::bigint
  $$,
  $$ values (1::bigint, 0::bigint), (1::bigint, 1::bigint) $$,
  'receipt events carry one coherent resulting state'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select * from public.delete_message((select id from public.messages limit 1));
reset role;

select is(
  (select count(*)::integer from realtime.messages where event = 'message.deleted'),
  1,
  'message deletion emits one conversation event'
);
select ok(
  (
    select not (payload ? 'content')
    from realtime.messages
    where event = 'message.deleted'
  ),
  'deleted content never enters the event'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select public.block_user('20000000-0000-4200-8200-000000000002');
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'messaging.availability_changed'
  ),
  3,
  'one logical block action emits one conversation and two inbox availability events'
);
select ok(
  not private.can_receive_council_realtime_topic(
    'conversation:not-a-uuid',
    null
  ),
  'anonymous identity fails topic authorization'
);
select ok(
  private.can_receive_council_realtime_topic(
    private.conversation_realtime_topic(
      (select conversation_id from public.direct_conversation_pairs limit 1)
    ),
    '10000000-0000-4100-8100-000000000001'
  )
  and private.can_receive_council_realtime_topic(
    private.conversation_realtime_topic(
      (select conversation_id from public.direct_conversation_pairs limit 1)
    ),
    '20000000-0000-4200-8200-000000000002'
  ),
  'blocked participants remain authorized by historical membership'
);
select ok(
  (
    select bool_and(
      not (
        payload ?| array[
          'actor_user_id',
          'cause',
          'reason',
          'blocker_id',
          'blocked_id',
          'relationship_status'
        ]
      )
    )
    from realtime.messages
    where event = 'messaging.availability_changed'
  ),
  'availability payloads reveal no actor, cause, status, or block direction'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select public.unblock_user('20000000-0000-4200-8200-000000000002');
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'messaging.availability_changed'
  ),
  6,
  'unblocking emits one generic availability event per relevant topic'
);
select ok(
  private.can_receive_council_realtime_topic(
    private.conversation_realtime_topic(
      (select conversation_id from public.direct_conversation_pairs limit 1)
    ),
    '10000000-0000-4100-8100-000000000001'
  ),
  'removed contacts remain authorized by historical membership'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select public.send_contact_request('20000000-0000-4200-8200-000000000002');
reset role;
set local request.jwt.claim.sub = '20000000-0000-4200-8200-000000000002';
set local role authenticated;
select public.send_contact_request('10000000-0000-4100-8100-000000000001');
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'messaging.availability_changed'
  ),
  9,
  'reacceptance emits one generic availability event per relevant topic'
);

set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select public.remove_contact('20000000-0000-4200-8200-000000000002');
reset role;

select is(
  (
    select count(*)::integer
    from realtime.messages
    where event = 'messaging.availability_changed'
  ),
  12,
  'contact removal emits the same generic availability event shape'
);

set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from realtime.messages $$,
  '42501',
  null,
  'anonymous users cannot read Realtime messages'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-4100-8100-000000000001';
set local role authenticated;
select throws_ok(
  $$
    insert into realtime.messages (
      topic,
      extension,
      event,
      payload,
      private
    )
    values (
      'conversation:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'broadcast',
      'forged',
      '{}'::jsonb,
      true
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot forge database broadcasts'
);

select * from finish();

rollback;
