begin;

select plan(18);

select is(
  (select public from storage.buckets where id = 'profile-avatars'),
  false,
  'the profile avatar bucket exists and is private'
);

select is(
  (select public from storage.buckets where id = 'persona-avatars'),
  false,
  'the persona avatar bucket exists and is private'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a6000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'avatar-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b6000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'avatar-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

create temporary table vfix (label text primary key, id uuid, path text);
grant insert, select, update on vfix to authenticated, anon, service_role;

insert into vfix (label, path)
values
  ('profile_a', 'users/a6000000-0000-4a00-8a00-000000000001/a6100000-0000-4a10-8a10-000000000001.jpg'),
  ('persona_a', 'users/a6000000-0000-4a00-8a00-000000000001/a6200000-0000-4a20-8a20-000000000002.webp');

set local request.jwt.claim.sub = 'a6000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     select 'profile-avatars', path, 'a6000000-0000-4a00-8a00-000000000001'
     from vfix where label = 'profile_a' $$,
  'the profile owner can upload to their avatar prefix'
);
select lives_ok(
  $$ select * from public.set_my_profile(
       'avatar_a', 'Avatar A', '', (select path from vfix where label = 'profile_a'), '') $$,
  'the owner can bind their uploaded profile avatar path'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'profile-avatars' and name = (select path from vfix where label = 'profile_a')),
  1,
  'the owner can read their current profile avatar object'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     select 'persona-avatars', path, 'a6000000-0000-4a00-8a00-000000000001'
     from vfix where label = 'persona_a' $$,
  'the persona owner can upload to their avatar prefix'
);
insert into vfix (label, id)
select 'persona', id from public.create_custom_persona(
  'Avatar Coach', 'Has a custom image', 'Be useful.', 'balanced', 'concise',
  (select path from vfix where label = 'persona_a')
);
select is(
  (select avatar_path from public.list_my_custom_personas() where id = (select id from vfix where label = 'persona')),
  (select path from vfix where label = 'persona_a'),
  'custom personas expose their private avatar path to the owner'
);
insert into vfix (label, id, path)
select 'persona_conv', id, avatar_key
from public.get_or_create_ai_conversation(null, (select id from vfix where label = 'persona'));
select is(
  (select path from vfix where label = 'persona_conv'),
  (select path from vfix where label = 'persona_a'),
  'persona conversations project the avatar path as the AI avatar key'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'persona-avatars' and name = (select path from vfix where label = 'persona_a')),
  1,
  'the owner can read their current persona avatar object'
);

reset role;
set local request.jwt.claim.sub = 'b6000000-0000-4b00-8b00-000000000002';
set local role authenticated;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     select 'profile-avatars', path, 'b6000000-0000-4b00-8b00-000000000002'
     from vfix where label = 'profile_a' $$,
  '42501',
  null,
  'another user cannot upload into the profile owner prefix'
);
select throws_ok(
  $$ select * from public.set_my_profile(
       'avatar_b', 'Avatar B', '', (select path from vfix where label = 'profile_a'), '') $$,
  'P0001',
  'invalid_avatar_path',
  'another user cannot bind the profile owner avatar path'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'profile-avatars' and name = (select path from vfix where label = 'profile_a')),
  0,
  'another user cannot read the profile owner avatar object without profile visibility'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'persona-avatars' and name = (select path from vfix where label = 'persona_a')),
  0,
  'another user cannot read the persona owner avatar object'
);
select throws_ok(
  $$ select * from public.create_custom_persona(
       'Bad Persona', '', 'x', 'balanced', 'concise',
       (select path from vfix where label = 'persona_a')) $$,
  'P0001',
  'invalid_avatar_path',
  'another user cannot bind the persona owner avatar path'
);
select throws_ok(
  $$ select * from public.create_custom_persona(
       'Bad URL', '', 'x', 'balanced', 'concise', 'https://example.test/avatar.png') $$,
  'P0001',
  'invalid_avatar_path',
  'remote persona avatar URLs are rejected'
);

reset role;
set local request.jwt.claim.sub = 'a6000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select ok(
  private.is_current_user_avatar_path((select path from vfix where label = 'persona_a')),
  'the owner satisfies the avatar object delete policy predicate'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'persona-avatars' and name = (select path from vfix where label = 'persona_a')),
  1,
  'direct SQL deletion is not used for persona avatar objects'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.set_my_profile('anon_avatar', '', '', null, '') $$,
  '42501',
  null,
  'anon cannot update avatar profile data'
);

select * from finish();

rollback;
