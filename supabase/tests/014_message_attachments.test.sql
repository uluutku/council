begin;

select plan(27);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aa000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'attach-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bb000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'attach-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('cc000000-0000-4c00-8c00-000000000003', 'authenticated', 'authenticated', 'attach-c@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

-- A is accepted contacts with both B and C.
insert into public.contact_relationships (user_low_id, user_high_id, requested_by, status, responded_at)
values
  (least('aa000000-0000-4a00-8a00-000000000001'::uuid, 'bb000000-0000-4b00-8b00-000000000002'::uuid),
   greatest('aa000000-0000-4a00-8a00-000000000001'::uuid, 'bb000000-0000-4b00-8b00-000000000002'::uuid),
   'aa000000-0000-4a00-8a00-000000000001', 'accepted', now()),
  (least('aa000000-0000-4a00-8a00-000000000001'::uuid, 'cc000000-0000-4c00-8c00-000000000003'::uuid),
   greatest('aa000000-0000-4a00-8a00-000000000001'::uuid, 'cc000000-0000-4c00-8c00-000000000003'::uuid),
   'aa000000-0000-4a00-8a00-000000000001', 'accepted', now());

create temporary table fixtures (label text primary key, id uuid, path text);
grant insert, select, update on fixtures to authenticated, anon;

-- ---- A sets up two conversations and reserves a first attachment ----
set local request.jwt.claim.sub = 'aa000000-0000-4a00-8a00-000000000001';
set local role authenticated;

insert into fixtures (label, id)
select 'conv1', conversation_id from public.create_or_get_direct_conversation('bb000000-0000-4b00-8b00-000000000002');
insert into fixtures (label, id)
select 'conv2', conversation_id from public.create_or_get_direct_conversation('cc000000-0000-4c00-8c00-000000000003');

-- create-upload validation -------------------------------------------------
insert into fixtures (label, id, path)
select 'att1', attachment_id, storage_path
from public.create_message_attachment_upload(
  (select id from fixtures where label = 'conv1'), 'photo.png', 'image/png', 1000
);

select isnt(
  (select id from fixtures where label = 'att1'),
  null,
  'a conversation member can reserve a supported attachment upload'
);

select throws_ok(
  $$ select * from public.create_message_attachment_upload(
       (select id from fixtures where label = 'conv1'), 'note.pdf', 'image/png', 100) $$,
  'P0001', 'unsupported_attachment_type',
  'a filename extension that disagrees with the MIME type is rejected'
);

select throws_ok(
  $$ select * from public.create_message_attachment_upload(
       (select id from fixtures where label = 'conv1'), 'malware.exe', 'application/x-msdownload', 100) $$,
  'P0001', 'unsupported_attachment_type',
  'an unsupported MIME type is rejected'
);

select throws_ok(
  $$ select * from public.create_message_attachment_upload(
       (select id from fixtures where label = 'conv1'), 'huge.png', 'image/png', 10485761) $$,
  'P0001', 'attachment_too_large',
  'an attachment larger than 10 MB is rejected'
);

-- finalize requires a real uploaded object ---------------------------------
select throws_ok(
  $$ select * from public.finalize_message_attachment(
       (select id from fixtures where label = 'att1'), 800, 600) $$,
  'P0001', 'attachment_not_uploaded',
  'finalize fails until the object has actually been uploaded'
);

-- storage object INSERT RLS -------------------------------------------------
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     select 'message-attachments', (select path from fixtures where label = 'att1'),
            'aa000000-0000-4a00-8a00-000000000001' $$,
  'the uploader may write to the reserved path'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('message-attachments', 'conversations/forged/forged/x.png',
             'aa000000-0000-4a00-8a00-000000000001') $$,
  '42501', null,
  'a path without a matching pending reservation is rejected'
);

-- finalize + read access ----------------------------------------------------
select is(
  (select status from public.finalize_message_attachment(
     (select id from fixtures where label = 'att1'), 800, 600)),
  'ready',
  'finalize marks an uploaded attachment ready'
);

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'message-attachments' and name = (select path from fixtures where label = 'att1')),
  1,
  'the uploader can read its own attachment object'
);

-- ---- C (unrelated to conv1) cannot upload into or read the conversation ----
reset role;
set local request.jwt.claim.sub = 'cc000000-0000-4c00-8c00-000000000003';
set local role authenticated;

select throws_ok(
  $$ select * from public.create_message_attachment_upload(
       (select id from fixtures where label = 'conv1'), 'sneaky.png', 'image/png', 100) $$,
  'P0001', 'messaging_unavailable',
  'a non-member cannot reserve an upload in the conversation'
);

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'message-attachments' and name = (select path from fixtures where label = 'att1')),
  0,
  'an unrelated user cannot read another conversation attachment object'
);

select is(
  (select count(*)::int from public.message_attachments),
  0,
  'an unrelated user cannot read attachment metadata'
);

-- ---- A sends a message with the attachment ----
reset role;
set local request.jwt.claim.sub = 'aa000000-0000-4a00-8a00-000000000001';
set local role authenticated;

insert into fixtures (label, id)
select 'msg1', id
from public.send_message(
  (select id from fixtures where label = 'conv1'),
  'd1000000-0000-4d00-8d00-000000000001',
  'here is a photo',
  null,
  array[(select id from fixtures where label = 'att1')]
);

select is(
  (select count(*)::int from public.message_attachments
   where message_id = (select id from fixtures where label = 'msg1') and status = 'attached'),
  1,
  'sending attaches the finalized attachment to exactly the new message'
);

select is(
  (select jsonb_array_length(attachments)
   from public.list_conversation_messages((select id from fixtures where label = 'conv1'), null, 50)
   where id = (select id from fixtures where label = 'msg1')),
  1,
  'message listing returns the attachment metadata'
);

-- too many attachments ------------------------------------------------------
select throws_ok(
  $$ select * from public.send_message(
       (select id from fixtures where label = 'conv1'),
       'd1000000-0000-4d00-8d00-0000000000ff', 'too many', null,
       array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()]) $$,
  'P0001', 'too_many_attachments',
  'more than four attachments are rejected'
);

-- cannot attach an upload owned by another user -----------------------------
reset role;
set local request.jwt.claim.sub = 'bb000000-0000-4b00-8b00-000000000002';
set local role authenticated;

insert into fixtures (label, id, path)
select 'attB', attachment_id, storage_path
from public.create_message_attachment_upload(
  (select id from fixtures where label = 'conv1'), 'b.png', 'image/png', 500
);
insert into storage.objects (bucket_id, name, owner)
select 'message-attachments', (select path from fixtures where label = 'attB'),
       'bb000000-0000-4b00-8b00-000000000002';
select status from public.finalize_message_attachment((select id from fixtures where label = 'attB'), null, null);

-- B (member) can read the attached attachment metadata of msg1.
select is(
  (select count(*)::int from public.message_attachments
   where conversation_id = (select id from fixtures where label = 'conv1') and status = 'attached'),
  1,
  'a conversation member can read attached attachment metadata'
);

reset role;
set local request.jwt.claim.sub = 'aa000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select throws_ok(
  format($$ select * from public.send_message(
       %L, 'd1000000-0000-4d00-8d00-000000000002', 'steal', null, array[%L]::uuid[]) $$,
    (select id from fixtures where label = 'conv1'),
    (select id from fixtures where label = 'attB')),
  'P0001', 'attachment_not_ready',
  'a user cannot attach an upload owned by someone else'
);

-- cannot attach across conversations ----------------------------------------
insert into fixtures (label, id, path)
select 'att2', attachment_id, storage_path
from public.create_message_attachment_upload(
  (select id from fixtures where label = 'conv2'), 'c.png', 'image/png', 500
);
insert into storage.objects (bucket_id, name, owner)
select 'message-attachments', (select path from fixtures where label = 'att2'),
       'aa000000-0000-4a00-8a00-000000000001';
select status from public.finalize_message_attachment((select id from fixtures where label = 'att2'), null, null);

select throws_ok(
  format($$ select * from public.send_message(
       %L, 'd1000000-0000-4d00-8d00-000000000003', 'wrong conv', null, array[%L]::uuid[]) $$,
    (select id from fixtures where label = 'conv1'),
    (select id from fixtures where label = 'att2')),
  'P0001', 'attachment_not_ready',
  'an attachment from another conversation cannot be attached'
);

-- idempotent retry includes attachments -------------------------------------
select is(
  (select id from public.send_message(
     (select id from fixtures where label = 'conv1'),
     'd1000000-0000-4d00-8d00-000000000001', 'here is a photo', null,
     array[(select id from fixtures where label = 'att1')])),
  (select id from fixtures where label = 'msg1'),
  'an identical retry with the same attachments returns the original message'
);

select throws_ok(
  $$ select * from public.send_message(
       (select id from fixtures where label = 'conv1'),
       'd1000000-0000-4d00-8d00-000000000001', 'here is a photo', null,
       array[gen_random_uuid()]) $$,
  'P0001', 'idempotency_conflict',
  'reusing the client id with a different attachment set is a conflict'
);

-- empty and attachment-only messages ----------------------------------------
select throws_ok(
  $$ select * from public.send_message(
       (select id from fixtures where label = 'conv1'),
       'd1000000-0000-4d00-8d00-000000000004', '', null, '{}'::uuid[]) $$,
  'P0001', 'invalid_message_content',
  'a message with neither text nor attachments is rejected'
);

insert into fixtures (label, id, path)
select 'att3', attachment_id, storage_path
from public.create_message_attachment_upload(
  (select id from fixtures where label = 'conv1'), 'doc.txt', 'text/plain', 64
);
insert into storage.objects (bucket_id, name, owner)
select 'message-attachments', (select path from fixtures where label = 'att3'),
       'aa000000-0000-4a00-8a00-000000000001';
select status from public.finalize_message_attachment((select id from fixtures where label = 'att3'), null, null);

select is(
  (select content from public.send_message(
     (select id from fixtures where label = 'conv1'),
     'd1000000-0000-4d00-8d00-000000000005', null, null,
     array[(select id from fixtures where label = 'att3')])),
  null,
  'an attachment-only message is accepted with null content'
);

-- deletion removes attachment metadata and revokes access -------------------
select lives_ok(
  $$ select * from public.delete_message((select id from fixtures where label = 'msg1')) $$,
  'the sender can delete the message with the attachment'
);

select is(
  (select count(*)::int from public.message_attachments
   where message_id = (select id from fixtures where label = 'msg1')),
  0,
  'deleting the message removes its attachment metadata'
);

select is(
  (select jsonb_array_length(attachments)
   from public.list_conversation_messages((select id from fixtures where label = 'conv1'), null, 50)
   where id = (select id from fixtures where label = 'msg1')),
  0,
  'the deleted-message tombstone returns no attachments'
);

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'message-attachments' and name = (select path from fixtures where label = 'att1')),
  0,
  'signed-URL access is revoked once the attachment metadata is gone'
);

-- ---- anonymous access is denied entirely ----
reset role;
set local request.jwt.claim.sub = '';
set local role anon;

select throws_ok(
  $$ select * from public.message_attachments $$,
  '42501', null,
  'anonymous users cannot read attachment metadata'
);

select * from finish();

rollback;
