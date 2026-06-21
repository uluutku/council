begin;

select plan(11);

-- A blocks B. C blocks A. This lets us prove that each caller sees only their
-- own block rows, that a blocked target cannot discover its blocker through the
-- function, and that the function never exposes another user's block direction.

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
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'blocked-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'blocked-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'blocked-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set
  username = case id
    when '11111111-1111-4111-8111-111111111111' then 'amelia'
    when '22222222-2222-4222-8222-222222222222' then 'bjorn'
    when '33333333-3333-4333-8333-333333333333' then 'cosima'
  end,
  display_name = case id
    when '11111111-1111-4111-8111-111111111111' then 'Amelia'
    when '22222222-2222-4222-8222-222222222222' then 'Bjorn'
    when '33333333-3333-4333-8333-333333333333' then 'Cosima'
  end,
  bio = 'private biography that must never appear in the blocked list',
  status_text = case id
    when '22222222-2222-4222-8222-222222222222' then 'Bjorn status'
    else null
  end
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local role authenticated;

-- A blocks B.
select public.block_user('22222222-2222-4222-8222-222222222222');

reset role;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
set local role authenticated;

-- C blocks A (a block created by someone else, from A's perspective).
select public.block_user('11111111-1111-4111-8111-111111111111');

-- Acting as A.
reset role;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local role authenticated;

select is(
  (select count(*)::int from public.list_my_blocked_users()),
  1,
  'a blocker sees exactly the one user they blocked'
);

select results_eq(
  $$ select id from public.list_my_blocked_users() $$,
  $$ values ('22222222-2222-4222-8222-222222222222'::uuid) $$,
  'the blocker sees only their own blocked target and not the user who blocked them'
);

select is(
  (select username from public.list_my_blocked_users()),
  'bjorn',
  'the blocked target username is returned'
);

select is(
  (select display_name from public.list_my_blocked_users()),
  'Bjorn',
  'the blocked target display name is returned'
);

select is(
  (select status_text from public.list_my_blocked_users()),
  'Bjorn status',
  'the blocked target status text is returned'
);

select isnt(
  (select blocked_at from public.list_my_blocked_users()),
  null,
  'the blocked timestamp is returned'
);

select is(
  pg_get_function_result('public.list_my_blocked_users()'::regprocedure),
  'TABLE(id uuid, username text, display_name text, avatar_path text, status_text text, blocked_at timestamp with time zone)',
  'the function exposes only minimal profile fields and never email, biography, or private settings'
);

-- Acting as B: B was blocked by A but must not be able to learn that.
reset role;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set local role authenticated;

select is(
  (select count(*)::int from public.list_my_blocked_users()),
  0,
  'a blocked user cannot see their blocker through the function'
);

-- Acting as C: C blocked A, so C sees only A, proving the acting identity is
-- derived from auth.uid() and is not caller-supplied.
reset role;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
set local role authenticated;

select results_eq(
  $$ select id from public.list_my_blocked_users() $$,
  $$ values ('11111111-1111-4111-8111-111111111111'::uuid) $$,
  'an unrelated user sees only the blocks they personally created'
);

-- Unblocking removes the row from the result.
select public.unblock_user('11111111-1111-4111-8111-111111111111');

select is(
  (select count(*)::int from public.list_my_blocked_users()),
  0,
  'unblocking removes the user from the blocked list'
);

-- Anonymous callers cannot execute the function.
reset role;
set local request.jwt.claim.sub = '';
set local role anon;

select throws_ok(
  $$ select public.list_my_blocked_users() $$,
  '42501',
  null,
  'anonymous users cannot execute the blocked-users function'
);

select * from finish();

rollback;
