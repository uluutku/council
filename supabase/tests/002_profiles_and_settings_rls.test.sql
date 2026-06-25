begin;

select plan(33);

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
  (
    '11000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'profiles-a@example.test',
    'test-password',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'profiles-b@example.test',
    'test-password',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set
  username = 'bob',
  display_name = 'Bob',
  created_at = now() - interval '1 day',
  updated_at = now() - interval '1 day'
where id = '22000000-0000-0000-0000-000000000002';

update public.profiles
set
  created_at = now() - interval '1 day',
  updated_at = now() - interval '1 day'
where id = '11000000-0000-0000-0000-000000000001';

set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '11000000-0000-0000-0000-000000000001'
  ),
  1,
  'a user can read their own profile'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '22000000-0000-0000-0000-000000000002'
  ),
  0,
  'a stranger profile is not directly visible'
);
select results_eq(
  $$
    update public.profiles
    set
      username = '  ALICE_01 ',
      display_name = ' Alice ',
      bio = ' ',
      status_text = ' Ready '
    where id = '11000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  $$ values (1) $$,
  'a user can directly update allowed fields on their own profile'
);
select is(
  (
    select username
    from public.profiles
    where id = '11000000-0000-0000-0000-000000000001'
  ),
  'alice_01',
  'username updates are trimmed and normalized to lowercase'
);
select is(
  (
    select display_name
    from public.profiles
    where id = '11000000-0000-0000-0000-000000000001'
  ),
  'Alice',
  'display names are trimmed'
);
select is(
  (
    select bio
    from public.profiles
    where id = '11000000-0000-0000-0000-000000000001'
  ),
  null,
  'blank profile strings normalize to null'
);
select ok(
  (
    select updated_at > created_at
    from public.profiles
    where id = '11000000-0000-0000-0000-000000000001'
  ),
  'profile updated_at changes automatically'
);
select is_empty(
  $$
    update public.profiles
    set display_name = 'Not allowed'
    where id = '22000000-0000-0000-0000-000000000002'
    returning 1
  $$,
  'a user cannot update another profile'
);
select throws_ok(
  $$
    update public.profiles
    set id = '22000000-0000-0000-0000-000000000002'
    where id = '11000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated users cannot update profile ownership'
);
select throws_ok(
  $$
    update public.profiles
    set created_at = now()
    where id = '11000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated users cannot update profile creation time'
);
select is(
  (
    public.set_my_profile(
      '  Council_User ',
      ' Council User ',
      'Foundation profile',
      'users/11000000-0000-0000-0000-000000000001/11000000-0000-4000-8000-000000000001.webp',
      'Available'
    )
  ).username,
  'council_user',
  'set_my_profile validates and normalizes the authenticated profile'
);
select throws_ok(
  $$
    select public.set_my_profile('ab', null, null, null, null)
  $$,
  '23514',
  null,
  'usernames shorter than three characters are rejected'
);
select throws_ok(
  $$
    select public.set_my_profile('_alice', null, null, null, null)
  $$,
  '23514',
  null,
  'usernames must start with a letter or number'
);
select throws_ok(
  $$
    select public.set_my_profile('alice-name', null, null, null, null)
  $$,
  '23514',
  null,
  'usernames reject unsupported punctuation'
);
select throws_ok(
  $$
    select public.set_my_profile(repeat('a', 25), null, null, null, null)
  $$,
  '23514',
  null,
  'usernames longer than 24 characters are rejected'
);
select throws_ok(
  $$
    select public.set_my_profile('BOB', null, null, null, null)
  $$,
  '23505',
  'username is already taken',
  'duplicate usernames fail case-insensitively with a useful error'
);
select throws_ok(
  $$
    select public.set_my_profile('alice', repeat('d', 61), null, null, null)
  $$,
  '23514',
  null,
  'display name length is enforced'
);
select throws_ok(
  $$
    select public.set_my_profile('alice', null, repeat('b', 301), null, null)
  $$,
  '23514',
  null,
  'biography length is enforced'
);
select throws_ok(
  $$
    select public.set_my_profile('alice', null, null, null, repeat('s', 121))
  $$,
  '23514',
  null,
  'status text length is enforced'
);
select throws_ok(
  $$
    select public.set_my_profile(
      'alice',
      null,
      null,
      'https://example.test/avatar.png',
      null
    )
  $$,
  'P0001',
  'invalid_avatar_path',
  'remote avatar URLs are rejected'
);
select throws_ok(
  $$
    select public.set_my_profile('alice', null, null, '/absolute/avatar.png', null)
  $$,
  'P0001',
  'invalid_avatar_path',
  'absolute avatar paths are rejected'
);
select throws_ok(
  $$
    select public.set_my_profile('alice', null, null, 'avatars/../secret.png', null)
  $$,
  'P0001',
  'invalid_avatar_path',
  'avatar parent traversal is rejected'
);
select ok(
  (
    select
      updated.username is null
      and updated.display_name is null
      and updated.bio is null
      and updated.avatar_path is null
      and updated.status_text is null
    from public.set_my_profile('', ' ', '', ' ', '') as updated
  ),
  'set_my_profile normalizes every blank optional field to null'
);

select is(
  (
    select count(*)::integer
    from public.user_settings
    where user_id = '11000000-0000-0000-0000-000000000001'
  ),
  1,
  'a user can read their own settings'
);
select is(
  (
    select count(*)::integer
    from public.user_settings
    where user_id = '22000000-0000-0000-0000-000000000002'
  ),
  0,
  'a user cannot read another user settings'
);
select results_eq(
  $$
    update public.user_settings
    set
      theme = 'dark',
      privacy_preferences = '{"allow_contact_requests": false}'::jsonb
    where user_id = '11000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  $$ values (1) $$,
  'a user can update their own settings'
);
select is(
  (
    select theme
    from public.user_settings
    where user_id = '11000000-0000-0000-0000-000000000001'
  ),
  'dark',
  'the own-settings update is persisted'
);
select is(
  (
    select privacy_preferences
    from public.user_settings
    where user_id = '11000000-0000-0000-0000-000000000001'
  ),
  '{"allow_contact_requests": false}'::jsonb,
  'settings accept a bounded top-level preference object'
);
select is_empty(
  $$
    update public.user_settings
    set theme = 'light'
    where user_id = '22000000-0000-0000-0000-000000000002'
    returning 1
  $$,
  'a user cannot update another user settings'
);
select throws_ok(
  $$
    update public.user_settings
    set notification_preferences = '[]'::jsonb
    where user_id = '11000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  null,
  'notification preferences reject arrays'
);
select throws_ok(
  $$
    update public.user_settings
    set privacy_preferences = '"private"'::jsonb
    where user_id = '11000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  null,
  'privacy preferences reject strings'
);
select throws_ok(
  $$
    update public.user_settings
    set ai_preferences = '1'::jsonb
    where user_id = '11000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  null,
  'AI preferences reject numbers'
);
select throws_ok(
  $$
    update public.user_settings
    set user_id = '22000000-0000-0000-0000-000000000002'
    where user_id = '11000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated users cannot change settings ownership'
);

select * from finish();

rollback;
