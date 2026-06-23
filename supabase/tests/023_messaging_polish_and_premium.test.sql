begin;
select plan(37);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a9000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'polish-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b9000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'polish-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c9000000-0000-4c00-8c00-000000000003', 'authenticated', 'authenticated', 'polish-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles set username = 'polisha', display_name = 'Polish A'
where id = 'a9000000-0000-4a00-8a00-000000000001';
update public.profiles set username = 'polishb', display_name = 'Polish B'
where id = 'b9000000-0000-4b00-8b00-000000000002';
update public.profiles set username = 'polishc', display_name = 'Polish C'
where id = 'c9000000-0000-4c00-8c00-000000000003';

insert into public.contact_relationships(
  user_low_id, user_high_id, requested_by, status, responded_at
) values (
  'a9000000-0000-4a00-8a00-000000000001',
  'b9000000-0000-4b00-8b00-000000000002',
  'a9000000-0000-4a00-8a00-000000000001', 'accepted', now()
);

create temporary table tfix(label text primary key, id uuid);
grant select, insert on tfix to authenticated, service_role, anon;

set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into tfix select 'conversation', conversation_id
from public.create_or_get_direct_conversation('b9000000-0000-4b00-8b00-000000000002');

select ok(
  private.can_use_council_ephemeral_topic(
    'conversation:' || (select id::text from tfix where label = 'conversation') || ':ephemeral',
    'a9000000-0000-4a00-8a00-000000000001'
  ),
  'ephemeral topic authorization accepts a conversation member'
);

select lives_ok(
  $$ select * from public.set_conversation_mute(
    (select id from tfix where label = 'conversation'), 3600, false
  ) $$,
  'a member can mute their own conversation'
);
select ok(
  (select is_muted from public.list_my_conversations(30, null, null)
   where conversation_id = (select id from tfix where label = 'conversation')),
  'temporary mute is reflected in the inbox'
);
select is(
  (select count(*) from public.conversation_preferences where user_id =
    'a9000000-0000-4a00-8a00-000000000001'),
  1::bigint,
  'the owner can read their preference'
);

reset role;
set local request.jwt.claim.sub = 'b9000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is(
  (select count(*) from public.conversation_preferences),
  0::bigint,
  'the peer cannot read another member preference'
);
select throws_ok(
  $$ insert into public.conversation_preferences(conversation_id, user_id, muted_forever)
     values (
       (select id from tfix where label = 'conversation'),
       'a9000000-0000-4a00-8a00-000000000001', true
     ) $$,
  '42501', null,
  'a member cannot write the other member preference'
);

reset role;
set local request.jwt.claim.sub = 'c9000000-0000-4c00-8c00-000000000003';
set local role authenticated;
select ok(
  not private.can_use_council_ephemeral_topic(
    'conversation:' || (select id::text from tfix where label = 'conversation') || ':ephemeral',
    'c9000000-0000-4c00-8c00-000000000003'
  ),
  'ephemeral topic authorization rejects an unrelated user'
);

reset role;
update public.conversation_preferences set muted_until = now() - interval '1 minute'
where user_id = 'a9000000-0000-4a00-8a00-000000000001';
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select ok(
  not (select is_muted from public.list_my_conversations(30, null, null)
       where conversation_id = (select id from tfix where label = 'conversation')),
  'expired temporary mute behaves as unmuted'
);

reset role;
set local request.jwt.claim.sub = 'b9000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select lives_ok($$ select public.touch_my_presence() $$, 'a user can touch only their presence');
reset role;
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select ok(
  (select is_online from public.get_presence_for_users(
    array['b9000000-0000-4b00-8b00-000000000002']::uuid[]
  )),
  'an accepted contact can see online state'
);
select is(
  (select count(*) from public.get_presence_for_users(
    array['c9000000-0000-4c00-8c00-000000000003']::uuid[]
  )),
  0::bigint,
  'a non-contact receives no presence information'
);
reset role;
update public.user_settings
set privacy_preferences = privacy_preferences || '{"show_online_status": false, "show_last_seen": false}'::jsonb
where user_id = 'b9000000-0000-4b00-8b00-000000000002';
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select is_online from public.get_presence_for_users(
    array['b9000000-0000-4b00-8b00-000000000002']::uuid[]
  )),
  null,
  'online privacy hides online state'
);
select is(
  (select last_seen_at from public.get_presence_for_users(
    array['b9000000-0000-4b00-8b00-000000000002']::uuid[]
  )),
  null,
  'last-seen privacy hides the timestamp'
);
select public.block_user('b9000000-0000-4b00-8b00-000000000002');
select is(
  (select count(*) from public.get_presence_for_users(
    array['b9000000-0000-4b00-8b00-000000000002']::uuid[]
  )),
  0::bigint,
  'blocked users receive no presence information'
);
select public.unblock_user('b9000000-0000-4b00-8b00-000000000002');
select public.send_contact_request('b9000000-0000-4b00-8b00-000000000002');
reset role;
set local request.jwt.claim.sub = 'b9000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select public.send_contact_request('a9000000-0000-4a00-8a00-000000000001');

select * from public.send_message(
  (select id from tfix where label = 'conversation'),
  'b9000000-0000-4b00-8b00-000000000010',
  'Searchable council history', null, '{}'
);
select * from public.send_message(
  (select id from tfix where label = 'conversation'),
  'b9000000-0000-4b00-8b00-000000000011',
  'Deleted searchable secret', null, '{}'
);
select public.delete_message((
  select id from public.messages where content = 'Deleted searchable secret'
));
reset role;
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select count(*) from public.search_my_messages('council', null, null, 30)),
  1::bigint,
  'message search returns only member-visible active human messages'
);
select is(
  (select count(*) from public.search_my_messages('secret', null, null, 30)),
  0::bigint,
  'message search excludes deleted content'
);
select is(
  (select count(*) from public.search_my_conversations('polishb', 20)),
  1::bigint,
  'conversation search matches safe peer identity'
);
select is(
  (select count(*) from public.get_message_window(
    (select id from tfix where label = 'conversation'),
    (select id from public.messages where content = 'Searchable council history'), 25
  )),
  2::bigint,
  'message window returns a bounded authorized window including tombstones'
);
reset role;
set local request.jwt.claim.sub = 'c9000000-0000-4c00-8c00-000000000003';
set local role authenticated;
select throws_ok(
  $$ select * from public.get_message_window(
    (select id from tfix where label = 'conversation'),
    (select id from public.messages where content = 'Searchable council history'), 25
  ) $$,
  'P0001', 'conversation_not_found',
  'an unrelated user cannot load a message window'
);

reset role;
set local role service_role;
select public.create_premium_access_code(
  extensions.digest('COUNCIL-TEST-CODE-ONE-123456', 'sha256'),
  'COUNCIL-TEST', 30, 100, null
);
select is(
  (select octet_length(code_hash) from public.premium_access_codes limit 1),
  32,
  'only a cryptographic code hash is stored'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'premium_access_codes'
      and column_name in ('code', 'plaintext_code')
  ),
  'the code table has no plaintext code column'
);

reset role;
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select ok(
  (select redeemed from public.redeem_premium_access_code('COUNCIL-TEST-CODE-ONE-123456')),
  'a valid code redeems once'
);
select is(
  (select pro_credits_remaining from public.get_my_ai_access()),
  100,
  'redemption grants the configured Premium credits'
);
select ok(
  (select is_pro from public.get_my_ai_access()),
  'redemption enables active Premium access'
);
select ok(
  not (select redeemed from public.redeem_premium_access_code('COUNCIL-TEST-CODE-ONE-123456')),
  'the same code cannot be redeemed twice'
);
select is(
  (select count(*) from public.premium_grants),
  1::bigint,
  'the user sees one immutable safe grant'
);

reset role;
set local request.jwt.claim.sub = 'b9000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is((select count(*) from public.premium_grants), 0::bigint,
  'another user cannot read the grant history');
reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from public.redeem_premium_access_code('COUNCIL-TEST-CODE-ONE-123456') $$,
  '42501', null,
  'anonymous code redemption is denied'
);

reset role;
set local request.jwt.claim.sub = 'c9000000-0000-4c00-8c00-000000000003';
set local role authenticated;
select ok(
  not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000000'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000001'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000002'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000003'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000004'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000005'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000006'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000007'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000008'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000009'))
  and not (select redeemed from public.redeem_premium_access_code('INVALID-CODE-000010')),
  'invalid attempts remain generic through the hourly limit'
);
reset role;
select is(
  (select count(*) from public.premium_redemption_attempts
   where user_id = 'c9000000-0000-4c00-8c00-000000000003'),
  10::bigint,
  'invalid redemption attempts are capped at ten per hour'
);

set local role service_role;
select public.create_premium_access_code(
  extensions.digest('COUNCIL-TEST-CODE-TWO-123456', 'sha256'),
  'COUNCIL-TEST', 30, 50, null
);
reset role;
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select ok(
  (select redeemed from public.redeem_premium_access_code('COUNCIL-TEST-CODE-TWO-123456')),
  'a second valid code can stack'
);
select is(
  (select pro_credits_remaining from public.get_my_ai_access()),
  150,
  'stacking adds Premium credits'
);
select ok(
  (select pro_expires_at > now() + interval '59 days'
   from public.get_my_ai_access()),
  'stacking extends time from the current Premium expiration'
);

reset role;
insert into tfix select 'agent', id from public.ai_agents where slug = 'council-assistant';
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into tfix select 'ai_conversation', id from public.get_or_create_ai_conversation(
  (select id from tfix where label = 'agent'), null
);
reset role;
set local role service_role;
insert into tfix
select 'premium_run', run_id from public.start_ai_generation(
  'a9000000-0000-4a00-8a00-000000000001',
  (select id from tfix where label = 'ai_conversation'),
  'a9000000-0000-4a00-8a00-000000000020', 'premium prompt', 'mock'
);
select is(
  (select credit_source from public.ai_runs where id = (select id from tfix where label = 'premium_run')),
  'premium',
  'active Premium reserves from the Premium pool first'
);
select is(
  (select pro_credits_remaining from public.ai_credit_accounts
   where user_id = 'a9000000-0000-4a00-8a00-000000000001'),
  149,
  'one generation consumes one Premium credit'
);
select is(
  (select credits_remaining from public.fail_ai_generation(
    (select id from tfix where label = 'premium_run'), 'provider_error', 'failed'
  )),
  150,
  'a failed provider call refunds the same Premium pool exactly once'
);

reset role;
update public.ai_credit_accounts
set pro_expires_at = now() - interval '1 minute', trial_started_at = now(),
  trial_expires_at = now() + interval '1 day', trial_credits_remaining = 5
where user_id = 'a9000000-0000-4a00-8a00-000000000001';
set local request.jwt.claim.sub = 'a9000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select ok(
  not (select is_pro from public.get_my_ai_access()),
  'Premium expires automatically by timestamp'
);

select * from finish();
rollback;
