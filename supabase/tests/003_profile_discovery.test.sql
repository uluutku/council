begin;

select plan(20);

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
  ('11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'search-self@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('21000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'search-albert@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('31000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'search-carol@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('41000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'search-hidden@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('51000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'search-closed@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('61000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'search-blocked-out@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('71000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'search-blocked-in@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('81000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'search-existing@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('91000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'search-pending@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set username = case id
    when '11000000-0000-0000-0000-000000000001' then 'alice'
    when '21000000-0000-0000-0000-000000000002' then 'albert'
    when '31000000-0000-0000-0000-000000000003' then 'carol'
    when '51000000-0000-0000-0000-000000000005' then 'alex'
    when '61000000-0000-0000-0000-000000000006' then 'alfred'
    when '71000000-0000-0000-0000-000000000007' then 'alien'
    when '81000000-0000-0000-0000-000000000008' then 'ally'
    when '91000000-0000-0000-0000-000000000009' then 'iris'
    else null
  end,
  display_name = case id
    when '11000000-0000-0000-0000-000000000001' then 'Alice Self'
    when '21000000-0000-0000-0000-000000000002' then 'Albert'
    when '31000000-0000-0000-0000-000000000003' then 'Alice Cooper'
    when '41000000-0000-0000-0000-000000000004' then 'Hidden Alice'
    when '51000000-0000-0000-0000-000000000005' then 'Alex Closed'
    when '61000000-0000-0000-0000-000000000006' then 'Alfred Blocked'
    when '71000000-0000-0000-0000-000000000007' then 'Alien Blocker'
    when '81000000-0000-0000-0000-000000000008' then 'Ally Existing'
    when '91000000-0000-0000-0000-000000000009' then 'Iris Pending'
  end,
  bio = 'Private biography'
where true;

update public.user_settings
set privacy_preferences = '{"allow_contact_requests": false}'::jsonb
where user_id in (
  '51000000-0000-0000-0000-000000000005',
  '81000000-0000-0000-0000-000000000008'
);

insert into public.user_blocks (blocker_id, blocked_id)
values
  (
    '11000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000006'
  ),
  (
    '71000000-0000-0000-0000-000000000007',
    '11000000-0000-0000-0000-000000000001'
  );

insert into public.contact_relationships (
  user_low_id,
  user_high_id,
  requested_by,
  status,
  responded_at
)
values (
  '11000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000008',
  '11000000-0000-0000-0000-000000000001',
  'rejected',
  now()
);

insert into public.contact_relationships (
  user_low_id,
  user_high_id,
  requested_by,
  status
)
values (
  '11000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000009',
  '11000000-0000-0000-0000-000000000001',
  'pending'
);

set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';
set local role authenticated;

select is(
  (select array_agg(search_result.username) from public.search_profiles('al', 25) as search_result),
  array['albert', 'ally', 'carol']::text[],
  'search orders username prefixes before display-name matches'
);
select ok(
  not exists (
    select 1
    from public.search_profiles('alice', 25)
    where id = '11000000-0000-0000-0000-000000000001'
  ),
  'profile search excludes the current user'
);
select is(
  (select count(*)::integer from public.search_profiles('hidden', 25)),
  0,
  'profile search excludes profiles without usernames'
);
select is(
  (select count(*)::integer from public.search_profiles('alex', 25)),
  0,
  'profile search respects disabled contact requests for strangers'
);
select is(
  (select count(*)::integer from public.search_profiles('ally', 25)),
  1,
  'an existing relationship remains discoverable when requests are disabled'
);
select is(
  (
    select relationship_status
    from public.search_profiles('ally', 25)
  ),
  'rejected',
  'profile search reports the existing relationship status'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '81000000-0000-0000-0000-000000000008'
  ),
  0,
  'a rejected relationship does not expose the full profile through direct selection'
);
select is(
  (select count(*)::integer from public.search_profiles('alfred', 25)),
  0,
  'profile search excludes users blocked by the viewer'
);
select is(
  (select count(*)::integer from public.search_profiles('alien', 25)),
  0,
  'profile search excludes users who blocked the viewer'
);
select ok(
  (
    select not (to_jsonb(search_result) ? 'email')
    from public.search_profiles('albert', 25) as search_result
  ),
  'profile search never returns email addresses'
);
select ok(
  (
    select not (to_jsonb(search_result) ? 'privacy_preferences')
    from public.search_profiles('albert', 25) as search_result
  ),
  'profile search never returns private settings'
);
select ok(
  (
    select not (to_jsonb(search_result) ? 'bio')
    from public.search_profiles('albert', 25) as search_result
  ),
  'profile search returns a minimal public profile rather than the full profile row'
);
select throws_ok(
  $$ select * from public.search_profiles('al', 26) $$,
  '22023',
  'profile search result limit must be between 1 and 25',
  'profile search rejects an excessive result limit'
);
select throws_ok(
  $$ select * from public.search_profiles('a', 20) $$,
  '22023',
  'profile search query must contain at least 2 characters',
  'profile search rejects a one-character query'
);
select is(
  (select count(*)::integer from public.search_profiles('%%', 25)),
  0,
  'SQL wildcard characters are treated as literal search text'
);
select is(
  (select count(*)::integer from public.search_profiles('al', 1)),
  1,
  'profile search enforces the requested bounded limit'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '21000000-0000-0000-0000-000000000002'
  ),
  0,
  'stranger profiles cannot be enumerated through direct table selection'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '91000000-0000-0000-0000-000000000009'
  ),
  1,
  'a pending relationship permits direct participant profile selection'
);
select throws_ok(
  $$ select * from public.search_profiles(repeat('a', 101), 20) $$,
  '22023',
  'profile search query is too long',
  'profile search rejects oversized queries'
);
select throws_ok(
  $$ select * from public.search_profiles('alice', 0) $$,
  '22023',
  'profile search result limit must be between 1 and 25',
  'profile search rejects a zero result limit'
);

select * from finish();

rollback;
