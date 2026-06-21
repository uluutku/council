begin;

select plan(35);

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
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'access-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'access-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'access-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set username = case id
  when '10000000-0000-0000-0000-000000000001' then 'alice'
  when '20000000-0000-0000-0000-000000000002' then 'boris'
  when '30000000-0000-0000-0000-000000000003' then 'carol'
end
where true;

insert into public.contact_relationships (
  id,
  user_low_id,
  user_high_id,
  requested_by,
  status
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'pending'
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003'
);

set local request.jwt.claim.sub = '';
set local role anon;

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'anonymous users cannot read profiles'
);
select throws_ok(
  $$ select * from public.user_settings $$,
  '42501',
  null,
  'anonymous users cannot read settings'
);
select throws_ok(
  $$ select * from public.contact_relationships $$,
  '42501',
  null,
  'anonymous users cannot read relationships'
);
select throws_ok(
  $$ select * from public.user_blocks $$,
  '42501',
  null,
  'anonymous users cannot read blocks'
);
select throws_ok(
  $$ select public.set_my_profile(null, null, null, null, null) $$,
  '42501',
  null,
  'anonymous users cannot execute set_my_profile'
);
select throws_ok(
  $$ select * from public.search_profiles('alice', 20) $$,
  '42501',
  null,
  'anonymous users cannot execute profile search'
);
select throws_ok(
  $$ select public.send_contact_request('10000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anonymous users cannot send contact requests'
);
select throws_ok(
  $$
    select public.respond_contact_request(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'accepted'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot respond to contact requests'
);
select throws_ok(
  $$ select public.remove_contact('10000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anonymous users cannot remove contacts'
);
select throws_ok(
  $$ select public.block_user('10000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anonymous users cannot block users'
);
select throws_ok(
  $$ select public.unblock_user('10000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anonymous users cannot unblock users'
);
select throws_ok(
  $$ select * from public.list_my_contacts() $$,
  '42501',
  null,
  'anonymous users cannot list contacts'
);
select throws_ok(
  $$ select * from public.list_my_contact_requests() $$,
  '42501',
  null,
  'anonymous users cannot list contact requests'
);

reset role;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select throws_ok(
  $$
    insert into public.contact_relationships (
      user_low_id,
      user_high_id,
      requested_by,
      status
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001',
      'pending'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert relationships'
);
select throws_ok(
  $$
    update public.contact_relationships
    set status = 'accepted', responded_at = now()
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  $$,
  '42501',
  null,
  'authenticated users cannot directly update relationships'
);
select throws_ok(
  $$
    delete from public.contact_relationships
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  $$,
  '42501',
  null,
  'authenticated users cannot directly delete relationships'
);
select throws_ok(
  $$
    insert into public.user_blocks (blocker_id, blocked_id)
    values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert block rows'
);
select throws_ok(
  $$
    update public.user_blocks
    set blocked_id = '20000000-0000-0000-0000-000000000002'
    where blocker_id = '10000000-0000-0000-0000-000000000001'
      and blocked_id = '30000000-0000-0000-0000-000000000003'
  $$,
  '42501',
  null,
  'authenticated users cannot directly update block rows'
);
select throws_ok(
  $$
    delete from public.user_blocks
    where blocker_id = '10000000-0000-0000-0000-000000000001'
      and blocked_id = '30000000-0000-0000-0000-000000000003'
  $$,
  '42501',
  null,
  'authenticated users cannot directly delete block rows'
);
select throws_ok(
  $$
    insert into public.profiles (id, username)
    values ('40000000-0000-0000-0000-000000000004', 'inserted')
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert profiles'
);
select throws_ok(
  $$
    delete from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated users cannot directly delete profiles'
);
select throws_ok(
  $$
    insert into public.user_settings (user_id)
    values ('40000000-0000-0000-0000-000000000004')
  $$,
  '42501',
  null,
  'authenticated users cannot directly insert settings'
);
select throws_ok(
  $$
    delete from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated users cannot directly delete settings'
);
select throws_ok(
  $$
    select private.is_blocked_between(
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot execute the internal block helper'
);
select throws_ok(
  $$
    select private.are_contacts(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot execute the internal contacts helper'
);
select throws_ok(
  $$
    select private.lock_social_pair(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot execute the internal pair-lock helper'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  1,
  'authenticated users retain access to their own profile'
);
select is(
  (
    select count(*)::integer
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  1,
  'authenticated users retain access to their own settings'
);
select is(
  (
    select count(*)::integer
    from public.user_blocks
    where blocker_id = '10000000-0000-0000-0000-000000000001'
  ),
  1,
  'authenticated blockers can read their own block rows'
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  1,
  'relationship participants can read their relationship'
);
select is(
  (select count(*)::integer from public.user_blocks),
  0,
  'unrelated authenticated users cannot read another user block rows'
);
select is(
  (
    select count(*)::integer
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  0,
  'authenticated users cannot read another user settings'
);

reset role;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
set local role authenticated;

select is(
  (select count(*)::integer from public.user_blocks),
  0,
  'a blocked user cannot inspect the block row'
);

reset role;

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous users have no access to the internal helper schema'
);
select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated users have only the schema access needed by profile RLS'
);

select * from finish();

rollback;
