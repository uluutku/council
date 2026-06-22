begin;

select plan(26);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a4000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'image-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b4000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'image-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

create temporary table ifix (label text primary key, id uuid, path text);
grant insert, select, update on ifix to authenticated, anon, service_role;
insert into ifix (label, id)
select 'agent1', id from public.ai_agents where slug = 'council-assistant';
insert into ifix (label, id)
select 'agent2', id from public.ai_agents where slug = 'writing-editor';

set local request.jwt.claim.sub = 'a4000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into ifix (label, id)
select 'conv1', id from public.get_or_create_ai_conversation(
  (select id from ifix where label = 'agent1'), null
);
insert into ifix (label, id)
select 'conv2', id from public.get_or_create_ai_conversation(
  (select id from ifix where label = 'agent2'), null
);

select throws_ok(
  $$ select * from public.create_ai_image_upload(
       (select id from ifix where label = 'conv1'), 'bad.gif', 'image/gif', 100) $$,
  'P0001', 'unsupported_image', 'unsupported image MIME is rejected'
);
select throws_ok(
  $$ select * from public.create_ai_image_upload(
       (select id from ifix where label = 'conv1'), 'bad.jpg', 'image/png', 100) $$,
  'P0001', 'unsupported_image', 'extension and MIME mismatch is rejected'
);
select throws_ok(
  $$ select * from public.create_ai_image_upload(
       (select id from ifix where label = 'conv1'), 'large.png', 'image/png', 5242881) $$,
  'P0001', 'image_too_large', 'an image larger than five MB is rejected'
);

insert into ifix (label, id, path)
select 'att1', attachment_id, storage_path
from public.create_ai_image_upload(
  (select id from ifix where label = 'conv1'), 'screen.png', 'image/png', 100
);
select ok(
  (select path like 'users/a4000000-0000-4a00-8a00-000000000001/conversations/%'
   from ifix where label = 'att1'),
  'the database fixes an owner/conversation-scoped Storage path'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     select 'ai-chat-images', path, 'a4000000-0000-4a00-8a00-000000000001'
     from ifix where label = 'att1' $$,
  'the owner can upload only to the reserved path'
);
select is(
  (select status from public.finalize_ai_image_upload(
     (select id from ifix where label = 'att1'), 20, 10)),
  'ready', 'the owner can finalize an uploaded image'
);
select is(
  (select count(*)::int from public.ai_message_attachments
   where id = (select id from ifix where label = 'att1')),
  1, 'the owner can read their image metadata through RLS'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'ai-chat-images' and name = (select path from ifix where label = 'att1')),
  1, 'the owner can read the finalized private object'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('ai-chat-images', 'users/forged/image.png',
             'a4000000-0000-4a00-8a00-000000000001') $$,
  '42501', null, 'an unreserved Storage path is rejected'
);

insert into ifix (label, id, path)
select 'delete_att', attachment_id, storage_path
from public.create_ai_image_upload(
  (select id from ifix where label = 'conv1'), 'delete.png', 'image/png', 100
);
insert into storage.objects (bucket_id, name, owner)
select 'ai-chat-images', path, 'a4000000-0000-4a00-8a00-000000000001'
from ifix where label = 'delete_att';
select status from public.finalize_ai_image_upload(
  (select id from ifix where label = 'delete_att'), 10, 10
);
select is(
  private.can_current_user_delete_ai_image((select path from ifix where label = 'delete_att')),
  true, 'the owner may delete an unattached private object'
);

insert into ifix (label, id, path)
select 'wrong', attachment_id, storage_path
from public.create_ai_image_upload(
  (select id from ifix where label = 'conv2'), 'other.webp', 'image/webp', 100
);
insert into storage.objects (bucket_id, name, owner)
select 'ai-chat-images', path, 'a4000000-0000-4a00-8a00-000000000001'
from ifix where label = 'wrong';
select status from public.finalize_ai_image_upload((select id from ifix where label = 'wrong'), 10, 10);

reset role;
set local role service_role;
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a4000000-0000-4a00-8a00-000000000001',
       (select id from ifix where label = 'conv1'),
       'a4100000-0000-4a10-8a10-000000000001', 'wrong conversation', 'text-model',
       array[(select id from ifix where label = 'wrong')]) $$,
  'P0001', 'image_unavailable', 'an image from another AI conversation is rejected'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a4000000-0000-4a00-8a00-000000000001',
       (select id from ifix where label = 'conv1'),
       'a4200000-0000-4a20-8a20-000000000002', 'three images', 'text-model',
       array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()]) $$,
  'P0001', 'invalid_image', 'more than two images is rejected'
);

insert into ifix (label, id)
select 'run1', run_id from public.start_ai_generation(
  'a4000000-0000-4a00-8a00-000000000001',
  (select id from ifix where label = 'conv1'),
  'a4300000-0000-4a30-8a30-000000000003', 'analyze this', 'text-model',
  array[(select id from ifix where label = 'att1')]
);
reset role;
select is(
  (select count(*)::int from public.ai_message_attachments
   where id = (select id from ifix where label = 'att1')
     and status = 'attached' and message_id is not null),
  1, 'generation attaches the image to exactly one user message'
);
set local request.jwt.claim.sub = 'a4000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select jsonb_array_length(attachments)
   from public.list_ai_messages((select id from ifix where label = 'conv1'), 100)
   where role = 'user'),
  1, 'message history returns persisted image metadata'
);
reset role;
set local role service_role;
select isnt(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from ifix where label = 'run1'), 'analysis complete', 1, 1, 0, null)),
  null, 'the image generation completes normally'
);
select is(
  (select is_replay from public.start_ai_generation(
    'a4000000-0000-4a00-8a00-000000000001',
    (select id from ifix where label = 'conv1'),
    'a4300000-0000-4a30-8a30-000000000003', 'analyze this', 'text-model',
    array[(select id from ifix where label = 'att1')])),
  true, 'same text and attachment IDs replay idempotently'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a4000000-0000-4a00-8a00-000000000001',
       (select id from ifix where label = 'conv1'),
       'a4300000-0000-4a30-8a30-000000000003', 'analyze this', 'text-model',
       array[(select id from ifix where label = 'wrong')]) $$,
  'P0001', 'idempotency_conflict', 'same client ID with different images conflicts safely'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a4000000-0000-4a00-8a00-000000000001',
       (select id from ifix where label = 'conv1'),
       'a4400000-0000-4a40-8a40-000000000004', 'reuse image', 'text-model',
       array[(select id from ifix where label = 'att1')]) $$,
  'P0001', 'image_unavailable', 'an attached image cannot be reused by another message'
);

reset role;
set local request.jwt.claim.sub = 'b4000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is(
  (select count(*)::int from public.ai_message_attachments), 0,
  'another user cannot read image metadata'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'ai-chat-images'), 0,
  'another user cannot read private image objects'
);
select throws_ok(
  $$ select * from public.create_ai_image_upload(
       (select id from ifix where label = 'conv1'), 'steal.png', 'image/png', 100) $$,
  'P0001', 'ai_conversation_not_found', 'another user cannot reserve in the owner conversation'
);
select is(
  private.can_current_user_delete_ai_image((select path from ifix where label = 'delete_att')),
  false, 'another user cannot delete the owner private object'
);
select throws_ok(
  $$ select * from public.ai_image_analyses $$,
  '42501', null, 'browser users cannot read the vision analysis cache'
);

-- Archived persona generation remains unavailable for image requests.
reset role;
set local request.jwt.claim.sub = 'a4000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into ifix (label, id)
select 'persona', id from public.create_custom_persona(
  'Image Persona', '', 'Be concise.', 'balanced', 'concise'
);
insert into ifix (label, id)
select 'persona_conv', id from public.get_or_create_ai_conversation(
  null, (select id from ifix where label = 'persona')
);
select public.archive_custom_persona((select id from ifix where label = 'persona'));
select throws_ok(
  $$ select * from public.create_ai_image_upload(
       (select id from ifix where label = 'persona_conv'), 'x.png', 'image/png', 100) $$,
  'P0001', 'ai_agent_unavailable', 'archived personas reject new image uploads'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from public.ai_message_attachments $$,
  '42501', null, 'anonymous users cannot read image metadata'
);
select throws_ok(
  $$ select * from public.create_ai_image_upload(
       (select id from ifix where label = 'conv1'), 'x.png', 'image/png', 100) $$,
  '42501', null, 'anonymous users cannot reserve image uploads'
);

select * from finish();
rollback;
