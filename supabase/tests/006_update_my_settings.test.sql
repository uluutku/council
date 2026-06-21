begin;

select plan(14);

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
    'settings-a@example.test',
    'test-password',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'settings-b@example.test',
    'test-password',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.user_settings
set
  notification_preferences =
    notification_preferences || '{"future_notification_key": "preserve"}'::jsonb,
  privacy_preferences =
    privacy_preferences || '{"future_privacy_key": {"nested": true}}'::jsonb
where user_id = '10000000-0000-0000-0000-000000000001';

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

select is(
  (
    public.update_my_settings(
      'dark',
      '{"sound": false}'::jsonb,
      '{"allow_contact_requests": false}'::jsonb
    )
  ).theme,
  'dark',
  'a user can update their own theme'
);
select is(
  (
    select notification_preferences -> 'sound'
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'false'::jsonb,
  'a supported notification preference is updated'
);
select is(
  (
    select privacy_preferences -> 'allow_contact_requests'
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'false'::jsonb,
  'a supported privacy preference is updated'
);
select is(
  (
    select notification_preferences ->> 'future_notification_key'
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'preserve',
  'unknown existing notification keys are preserved'
);
select is(
  (
    select privacy_preferences -> 'future_privacy_key'
    from public.user_settings
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  '{"nested": true}'::jsonb,
  'unknown existing privacy keys are preserved'
);

reset role;

select is(
  (
    select theme
    from public.user_settings
    where user_id = '20000000-0000-0000-0000-000000000002'
  ),
  'system',
  'updating settings does not modify another user'
);

set local role authenticated;

select throws_ok(
  $$ select public.update_my_settings('contrast', null, null) $$,
  '22023',
  'theme must be system, light, or dark',
  'unsupported themes are rejected'
);
select throws_ok(
  $$ select public.update_my_settings(null, '[]'::jsonb, null) $$,
  '22023',
  'notification preferences must be an object',
  'notification arrays are rejected'
);
select throws_ok(
  $$
    select public.update_my_settings(
      null,
      '{"future_notification_key": true}'::jsonb,
      null
    )
  $$,
  '22023',
  'notification preferences contain an unsupported key',
  'new unsupported notification keys are rejected'
);
select throws_ok(
  $$ select public.update_my_settings(null, '{"sound": "yes"}'::jsonb, null) $$,
  '22023',
  'notification preference values must be booleans',
  'notification values must be booleans'
);
select throws_ok(
  $$ select public.update_my_settings(null, null, 'null'::jsonb) $$,
  '22023',
  'privacy preferences must be an object',
  'privacy null is rejected'
);
select throws_ok(
  $$
    select public.update_my_settings(
      null,
      null,
      '{"allow_contact_requests": 1}'::jsonb
    )
  $$,
  '22023',
  'privacy preference values must be booleans',
  'privacy values must be booleans'
);
select throws_ok(
  $$ select public.update_my_settings(null, null, null) $$,
  '22023',
  'at least one settings value is required',
  'empty settings updates are rejected'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;

select throws_ok(
  $$
    select public.update_my_settings(
      'light',
      '{"sound": true}'::jsonb,
      '{"show_last_seen": false}'::jsonb
    )
  $$,
  '42501',
  null,
  'anonymous users cannot execute the settings update function'
);

select * from finish();

rollback;
