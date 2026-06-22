begin;

select plan(25);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a2000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'persona-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b2000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'persona-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c2000000-0000-4c00-8c00-000000000003', 'authenticated', 'authenticated', 'persona-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

create temporary table pfix (label text primary key, id uuid, txt text);
grant insert, select on pfix to authenticated, anon, service_role;

-- ---- Built-in catalogue ----
set local request.jwt.claim.sub = 'a2000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select is(
  (select count(*)::int from public.list_ai_agents()),
  4,
  'all four built-in contacts are visible to an authenticated user'
);

-- ---- Custom persona creation + ownership ----
insert into pfix (label, id)
select 'persona', id from public.create_custom_persona(
  'My Coach', 'A personal coach', 'Always be encouraging and ask one guiding question.', 'warm', 'concise'
);

select is(
  (select count(*)::int from public.list_my_custom_personas()),
  1,
  'the owner sees their new persona'
);
select is(
  (select tone from public.list_my_custom_personas() where id = (select id from pfix where label = 'persona')),
  'warm',
  'persona stores the selected tone'
);

-- ---- Cross-user isolation ----
reset role;
set local request.jwt.claim.sub = 'b2000000-0000-4b00-8b00-000000000002';
set local role authenticated;

select is(
  (select count(*)::int from public.list_my_custom_personas()),
  0,
  'another user does not see the persona'
);
select is(
  (select count(*)::int from public.ai_personas),
  0,
  'another user cannot read the persona row directly'
);
select throws_ok(
  $$ select * from public.update_custom_persona(
       (select id from pfix where label = 'persona'), 'Hacked', '', 'x', 'warm', 'concise') $$,
  'P0001', 'persona_not_found', 'another user cannot edit the persona'
);
select throws_ok(
  $$ select public.archive_custom_persona((select id from pfix where label = 'persona')) $$,
  'P0001', 'persona_not_found', 'another user cannot archive the persona'
);
select throws_ok(
  $$ select * from public.get_or_create_ai_conversation(null, (select id from pfix where label = 'persona')) $$,
  'P0001', 'ai_conversation_not_found', 'another user cannot open a conversation with the persona'
);

-- ---- Owner edits + opens a conversation ----
reset role;
set local request.jwt.claim.sub = 'a2000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select is(
  (select name from public.update_custom_persona(
     (select id from pfix where label = 'persona'), 'Renamed Coach', 'Updated', 'Be direct now.', 'direct', 'detailed')),
  'Renamed Coach',
  'the owner can edit the persona'
);

insert into pfix (label, id)
select 'conv', id from public.get_or_create_ai_conversation(null, (select id from pfix where label = 'persona'));

select is(
  (select kind from public.get_or_create_ai_conversation(null, (select id from pfix where label = 'persona'))),
  'custom',
  'a persona conversation reports the custom kind'
);

-- ---- Generation while active ----
reset role;
set local role service_role;

insert into pfix (label, id)
select 'run1', run_id from public.start_ai_generation(
  'a2000000-0000-4a00-8a00-000000000001',
  (select id from pfix where label = 'conv'),
  'd2000000-0000-4d00-8d00-000000000001', 'help me focus', 'deepseek/deepseek-v4-flash'
);

select ok(
  (select system_prompt like '%Persona instructions:%'
   from public.load_ai_run_context((select id from pfix where label = 'run1'))),
  'persona prompt assembly includes the persona instructions section'
);
select ok(
  (select system_prompt like '%' || 'Be direct now.' || '%'
   from public.load_ai_run_context((select id from pfix where label = 'run1'))),
  'persona prompt assembly uses the updated instructions'
);
select ok(
  (select position('platform rules always apply' in system_prompt) > 0
   from public.load_ai_run_context((select id from pfix where label = 'run1'))),
  'every assembled prompt begins with the platform safety preamble'
);

select isnt(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from pfix where label = 'run1'), 'Stay focused.', 1, 1, null, null)),
  null, 'the persona generation completes and persists'
);

-- ---- Archive disables generation but keeps history ----
reset role;
set local request.jwt.claim.sub = 'a2000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select lives_ok(
  $$ select public.archive_custom_persona((select id from pfix where label = 'persona')) $$,
  'the owner archives the persona'
);
select is(
  (select archived from public.list_my_custom_personas() where id = (select id from pfix where label = 'persona')),
  true, 'the persona is marked archived'
);
select is(
  (select count(*)::int from public.list_ai_messages((select id from pfix where label = 'conv'), 100)),
  2, 'archived-persona conversation history remains readable'
);

reset role;
set local role service_role;
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a2000000-0000-4a00-8a00-000000000001',
       (select id from pfix where label = 'conv'),
       'd2000000-0000-4d00-8d00-000000000002', 'one more', 'deepseek/deepseek-v4-flash') $$,
  'P0001', 'ai_agent_unavailable', 'an archived persona cannot start a new generation'
);

-- ---- Restore re-enables generation ----
reset role;
set local request.jwt.claim.sub = 'a2000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select lives_ok(
  $$ select public.restore_custom_persona((select id from pfix where label = 'persona')) $$,
  'the owner restores the persona'
);

reset role;
set local role service_role;
select lives_ok(
  $$ select * from public.start_ai_generation(
       'a2000000-0000-4a00-8a00-000000000001',
       (select id from pfix where label = 'conv'),
       'd2000000-0000-4d00-8d00-000000000003', 'restored chat', 'deepseek/deepseek-v4-flash') $$,
  'a restored persona can generate again'
);

-- ---- Active-persona limit (user C) ----
reset role;
set local request.jwt.claim.sub = 'c2000000-0000-4c00-8c00-000000000003';
set local role authenticated;
do $$
begin
  for i in 1..10 loop
    perform public.create_custom_persona('persona' || i, '', 'instructions', 'balanced', 'balanced');
  end loop;
end $$;
select is(
  (select count(*)::int from public.list_my_custom_personas()),
  10, 'a user can hold ten active personas'
);
select throws_ok(
  $$ select * from public.create_custom_persona('eleventh', '', 'instructions', 'balanced', 'balanced') $$,
  'P0001', 'persona_limit_reached', 'the eleventh active persona is rejected'
);

-- ---- Anonymous denial ----
reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from public.list_my_custom_personas() $$, '42501', null,
  'anon cannot list custom personas'
);
select throws_ok(
  $$ select * from public.create_custom_persona('x', '', 'y', 'warm', 'concise') $$, '42501', null,
  'anon cannot create a persona'
);
select throws_ok(
  $$ select * from public.ai_personas $$, '42501', null,
  'anon cannot read the persona table'
);

select * from finish();

rollback;
