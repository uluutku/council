begin;

select plan(28);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a6000000-0000-4a00-8a00-000000000001', 'authenticated', 'authenticated', 'doc-a@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b6000000-0000-4b00-8b00-000000000002', 'authenticated', 'authenticated', 'doc-b@example.test', 'x', '{}'::jsonb, '{}'::jsonb, now(), now());

create temporary table dfix (label text primary key, id uuid, path text);
grant insert, select, update on dfix to authenticated, anon, service_role;
insert into dfix (label, id)
select 'agent', id from public.ai_agents where slug = 'council-assistant';

set local request.jwt.claim.sub = 'a6000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into dfix (label, id)
select 'conv_a', id from public.get_or_create_ai_conversation(
  (select id from dfix where label = 'agent'), null
);

reset role;
set local request.jwt.claim.sub = 'b6000000-0000-4b00-8b00-000000000002';
set local role authenticated;
insert into dfix (label, id)
select 'conv_b', id from public.get_or_create_ai_conversation(
  (select id from dfix where label = 'agent'), null
);

reset role;
set local request.jwt.claim.sub = 'a6000000-0000-4a00-8a00-000000000001';
set local role authenticated;

select throws_ok(
  $$ select * from public.create_ai_document_upload(
       (select id from dfix where label = 'conv_a'), 'bad.html', 'text/html', 10) $$,
  'P0001', 'unsupported_document', 'HTML is rejected'
);
select throws_ok(
  $$ select * from public.create_ai_document_upload(
       (select id from dfix where label = 'conv_a'), 'bad.pdf', 'text/plain', 10) $$,
  'P0001', 'unsupported_document', 'MIME and extension mismatch is rejected'
);
select throws_ok(
  $$ select * from public.create_ai_document_upload(
       (select id from dfix where label = 'conv_a'), 'large.txt', 'text/plain', 2097153) $$,
  'P0001', 'document_too_large', 'oversized text is rejected'
);
select throws_ok(
  $$ select * from public.create_ai_document_upload(
       (select id from dfix where label = 'conv_a'), 'large.pdf', 'application/pdf', 10485761) $$,
  'P0001', 'document_too_large', 'oversized PDF is rejected'
);
select throws_ok(
  $$ select * from public.create_ai_document_upload(
       (select id from dfix where label = 'conv_b'), 'wrong.txt', 'text/plain', 10) $$,
  'P0001', 'ai_conversation_not_found', 'wrong-conversation upload is rejected'
);

insert into dfix (label, id, path)
select 'doc1', attachment_id, storage_path
from public.create_ai_document_upload(
  (select id from dfix where label = 'conv_a'), 'notes.txt', 'text/plain', 20
);
select ok(
  (select path like 'users/a6000000-0000-4a00-8a00-000000000001/conversations/%'
   from dfix where label = 'doc1'),
  'the database fixes an owner/conversation-scoped path'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     select 'ai-chat-documents', path, 'a6000000-0000-4a00-8a00-000000000001'
     from dfix where label = 'doc1' $$,
  'the owner may upload to the reserved path'
);
select is(
  (select status from public.finalize_ai_document_upload(
    (select id from dfix where label = 'doc1'))),
  'ready', 'the owner may finalize a document'
);
select is(
  (select count(*)::integer from public.ai_document_attachments), 1,
  'the owner may read document metadata'
);

insert into dfix (label, id, path)
select 'doc2', attachment_id, storage_path
from public.create_ai_document_upload(
  (select id from dfix where label = 'conv_a'), 'plan.md', 'text/markdown', 20
);
insert into storage.objects (bucket_id, name, owner)
select 'ai-chat-documents', path, 'a6000000-0000-4a00-8a00-000000000001'
from dfix where label = 'doc2';
select status from public.finalize_ai_document_upload((select id from dfix where label = 'doc2'));

insert into dfix (label, id, path)
select 'doc3', attachment_id, storage_path
from public.create_ai_document_upload(
  (select id from dfix where label = 'conv_a'), 'third.pdf', 'application/pdf', 20
);
insert into storage.objects (bucket_id, name, owner)
select 'ai-chat-documents', path, 'a6000000-0000-4a00-8a00-000000000001'
from dfix where label = 'doc3';
select status from public.finalize_ai_document_upload((select id from dfix where label = 'doc3'));

reset role;
set local role service_role;
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a6000000-0000-4a00-8a00-000000000001',
       (select id from dfix where label = 'conv_a'), gen_random_uuid(), 'question',
       'text-model', '{}', null, '{}',
       array[
         (select id from dfix where label = 'doc1'),
         (select id from dfix where label = 'doc2'),
         (select id from dfix where label = 'doc3')
       ]) $$,
  'P0001', 'unsupported_document', 'more than two documents is rejected'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a6000000-0000-4a00-8a00-000000000001',
       (select id from dfix where label = 'conv_a'), gen_random_uuid(), '',
       'text-model', '{}', null, '{}',
       array[(select id from dfix where label = 'doc1')]) $$,
  'P0001', 'invalid_request', 'documents require a nonblank question'
);

insert into dfix (label, id)
select 'run1', run_id from public.start_ai_generation(
  'a6000000-0000-4a00-8a00-000000000001',
  (select id from dfix where label = 'conv_a'),
  'a6100000-0000-4a10-8a10-000000000001', 'Summarize.', 'text-model',
  '{}', null, '{}', array[(select id from dfix where label = 'doc1')]
);
select is(
  (select count(*)::integer from public.ai_document_attachments
   where id = (select id from dfix where label = 'doc1')
     and status = 'attached' and message_id is not null),
  1, 'generation attaches the document to one user message'
);
select is(
  (select count(*)::integer from public.load_ai_run_documents(
    (select id from dfix where label = 'run1'))),
  1, 'the service loader returns the run document'
);
select lives_ok(
  $$ select public.save_ai_document_analysis(
       'a6000000-0000-4a00-8a00-000000000001',
       (select id from dfix where label = 'doc1'),
       repeat('a', 64), 'text/plain', 'local-text', 1,
       'bounded extracted text', null, null, 10, 0) $$,
  'completed parsing can be cached'
);
select is(
  (select character_count from public.get_ai_document_analysis(
    'a6000000-0000-4a00-8a00-000000000001',
    (select id from dfix where label = 'doc1'),
    repeat('a', 64), 'text/plain', 'local-text', 1)),
  22, 'the owner-scoped completed cache is reusable'
);
select isnt(
  (select assistant_message_id from public.complete_ai_generation(
    (select id from dfix where label = 'run1'), 'done', 1, 1, 0, null)),
  null, 'document generation completes through the normal pipeline'
);
select is(
  (select is_replay from public.start_ai_generation(
    'a6000000-0000-4a00-8a00-000000000001',
    (select id from dfix where label = 'conv_a'),
    'a6100000-0000-4a10-8a10-000000000001', 'Summarize.', 'text-model',
    '{}', null, '{}', array[(select id from dfix where label = 'doc1')])),
  true, 'same document request replays idempotently'
);
select throws_ok(
  $$ select * from public.start_ai_generation(
       'a6000000-0000-4a00-8a00-000000000001',
       (select id from dfix where label = 'conv_a'),
       'a6100000-0000-4a10-8a10-000000000001', 'Summarize.', 'text-model',
       '{}', null, '{}', array[(select id from dfix where label = 'doc2')]) $$,
  'P0001', 'idempotency_conflict', 'changed documents conflict with the same client ID'
);

insert into dfix (label, id)
select 'message2', user_message_id from public.start_ai_generation(
  'a6000000-0000-4a00-8a00-000000000001',
  (select id from dfix where label = 'conv_a'),
  'a6200000-0000-4a20-8a20-000000000002', 'Review.', 'text-model',
  '{}', null, '{}', array[(select id from dfix where label = 'doc2')]
);
select throws_ok(
  $$ update public.ai_document_attachments
     set message_id = (select id from dfix where label = 'message2')
     where id = (select id from dfix where label = 'doc1') $$,
  'P0001', 'document_unavailable',
  'a document cannot move to another message'
);

reset role;
set local request.jwt.claim.sub = 'a6000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  (select jsonb_array_length(documents)
   from public.list_ai_messages((select id from dfix where label = 'conv_a'), 100)
   where client_message_id = 'a6100000-0000-4a10-8a10-000000000001'),
  1, 'message history returns persistent document cards'
);
select is(
  (select storage_bucket from public.create_ai_document_url(
    (select id from dfix where label = 'doc1'))),
  'ai-chat-documents', 'the owner can request signed-access coordinates'
);
select throws_ok(
  $$ insert into public.ai_document_attachments (
       user_id, conversation_id, storage_path, original_filename, mime_type, size_bytes
     ) values (
       'a6000000-0000-4a00-8a00-000000000001',
       (select id from dfix where label = 'conv_a'),
       'forged/path.txt', 'path.txt', 'text/plain', 10
     ) $$,
  '42501', null, 'direct unsafe metadata mutation is denied'
);

reset role;
set local request.jwt.claim.sub = 'b6000000-0000-4b00-8b00-000000000002';
set local role authenticated;
select is(
  (select count(*)::integer from public.ai_document_attachments), 0,
  'another user cannot read document metadata'
);
select throws_ok(
  $$ select * from public.create_ai_document_url((select id from dfix where label = 'doc1')) $$,
  'P0001', 'document_unavailable', 'another user cannot request document access'
);
select throws_ok(
  $$ select * from public.ai_document_analyses $$,
  '42501', null, 'browser users cannot read extracted document text'
);

reset role;
set local request.jwt.claim.sub = 'a6000000-0000-4a00-8a00-000000000001';
set local role authenticated;
insert into dfix (label, id)
select 'persona', id from public.create_custom_persona(
  'Document Persona', '', 'Be concise.', 'balanced', 'concise'
);
insert into dfix (label, id)
select 'persona_conv', id from public.get_or_create_ai_conversation(
  null, (select id from dfix where label = 'persona')
);
select public.archive_custom_persona((select id from dfix where label = 'persona'));
select throws_ok(
  $$ select * from public.create_ai_document_upload(
       (select id from dfix where label = 'persona_conv'), 'x.txt', 'text/plain', 10) $$,
  'P0001', 'ai_agent_unavailable', 'archived personas reject new document uploads'
);

reset role;
set local role service_role;
delete from public.ai_document_attachments where id = (select id from dfix where label = 'doc1');
reset role;
set local request.jwt.claim.sub = 'a6000000-0000-4a00-8a00-000000000001';
set local role authenticated;
select is(
  private.can_current_user_read_ai_document((select path from dfix where label = 'doc1')),
  false, 'deleted document metadata revokes future signed access'
);

reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok(
  $$ select * from public.ai_document_attachments $$,
  '42501', null, 'anonymous users cannot read document metadata'
);

select * from finish();
rollback;
