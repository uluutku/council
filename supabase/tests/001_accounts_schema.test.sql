begin;

select plan(25);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_settings'::regclass),
  'user_settings has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.contact_relationships'::regclass),
  'contact_relationships has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_blocks'::regclass),
  'user_blocks has RLS enabled'
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
  (
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'schema-a@example.test',
    'test-password',
    '{}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'schema-b@example.test',
    'test-password',
    '{}'::jsonb,
    '"unexpected metadata shape"'::jsonb,
    now(),
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'schema-c@example.test',
    'test-password',
    '{}'::jsonb,
    '[]'::jsonb,
    now(),
    now()
  );

select is(
  (select count(*)::integer from public.profiles),
  3,
  'auth user creation creates profiles'
);
select is(
  (select count(*)::integer from public.user_settings),
  3,
  'auth user creation creates settings'
);
select is(
  (
    select username
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  null,
  'initial profile creation does not require a username'
);
select ok(
  exists (
    select 1
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  'string-shaped optional metadata does not break profile creation'
);
select ok(
  exists (
    select 1
    from public.user_settings
    where user_id = '30000000-0000-0000-0000-000000000003'
  ),
  'array-shaped optional metadata does not break settings creation'
);

select is(
  (
    select theme
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'system',
  'settings default to the system theme'
);
select is(
  (
    select notification_preferences
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  '{"message_notifications": true, "message_previews": false, "sound": true}'::jsonb,
  'notification defaults are created'
);
select is(
  (
    select privacy_preferences
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  '{"show_online_status": true, "show_last_seen": true, "allow_contact_requests": true}'::jsonb,
  'privacy defaults are created'
);
select is(
  (
    select ai_preferences
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  '{"trial_disclosure_seen": false}'::jsonb,
  'AI preference defaults are created'
);

select lives_ok(
  $$
    insert into public.contact_relationships (
      user_low_id,
      user_high_id,
      requested_by,
      status
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'pending'
    )
  $$,
  'a canonical relationship row is accepted'
);
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
      '20000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002',
      'pending'
    )
  $$,
  '23505',
  null,
  'duplicate canonical pairs are rejected'
);
select throws_ok(
  $$
    insert into public.contact_relationships (
      user_low_id,
      user_high_id,
      requested_by,
      status
    )
    values (
      '30000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000003',
      'pending'
    )
  $$,
  '23514',
  null,
  'reverse or non-canonical pairs are rejected'
);
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
      '20000000-0000-0000-0000-000000000002',
      'pending'
    )
  $$,
  '23514',
  null,
  'requested_by must be a pair participant'
);
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
      'ignored'
    )
  $$,
  '23514',
  null,
  'unknown relationship statuses are rejected'
);
select throws_ok(
  $$
    insert into public.contact_relationships (
      user_low_id,
      user_high_id,
      requested_by,
      status,
      responded_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001',
      'pending',
      now()
    )
  $$,
  '23514',
  null,
  'pending relationships cannot have a response time'
);
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
      'accepted'
    )
  $$,
  '23514',
  null,
  'answered relationships require a response time'
);
select throws_ok(
  $$
    insert into public.user_blocks (blocker_id, blocked_id)
    values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'self blocks are rejected'
);

delete from auth.users where id = '20000000-0000-0000-0000-000000000002';

select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'deleting an auth user cascades to profiles'
);
select is(
  (
    select count(*)::integer
    from public.user_settings
    where user_id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'deleting an auth user cascades to settings'
);
select is(
  (
    select count(*)::integer
    from public.contact_relationships
    where
      user_low_id = '20000000-0000-0000-0000-000000000002'
      or user_high_id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'deleting an auth user cascades to relationships'
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003'
);

delete from auth.users where id = '30000000-0000-0000-0000-000000000003';

select is(
  (
    select count(*)::integer
    from public.user_blocks
    where blocked_id = '30000000-0000-0000-0000-000000000003'
  ),
  0,
  'deleting an auth user cascades to block rows'
);

select * from finish();

rollback;
