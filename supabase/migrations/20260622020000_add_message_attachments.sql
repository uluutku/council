-- Task 008: private image and file attachments for direct messages.
--
-- A staged upload flow keeps the database authoritative: a member first reserves
-- an attachment (validated against membership, MIME type, extension, and size),
-- the browser uploads directly to a private Storage bucket whose RLS only permits
-- that reserved path, the metadata is finalized, and finally the message is sent
-- with the finalized attachment IDs. Signed URLs are never stored or broadcast;
-- they are minted on demand and gated by Storage SELECT RLS at request time.

-- Supported MIME types and the file extensions allowed for each. Validation
-- checks both, so a renamed executable or an unexpected MIME type is rejected.
create function private.attachment_extensions_for_mime(target_mime text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case target_mime
    when 'image/jpeg' then array['jpg', 'jpeg']
    when 'image/png' then array['png']
    when 'image/webp' then array['webp']
    when 'image/gif' then array['gif']
    when 'application/pdf' then array['pdf']
    when 'text/plain' then array['txt']
    when 'text/markdown' then array['md', 'markdown']
    else null
  end;
$$;

create function private.is_supported_attachment(target_mime text, target_filename text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when private.attachment_extensions_for_mime(target_mime) is null then false
    when position('.' in target_filename) = 0 then false
    else lower(
      substring(target_filename from '\.([^.]+)$')
    ) = any (private.attachment_extensions_for_mime(target_mime))
  end;
$$;

-- Derives a conservative Storage-safe leaf filename. The unique attachment ID is
-- the real path key; this leaf only needs to be safe and recognizable.
create function private.safe_attachment_filename(target_filename text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  base text := coalesce(target_filename, '');
  sanitized text;
begin
  -- Strip any directory components a client might smuggle in.
  base := regexp_replace(base, '^.*[\\/]', '');
  sanitized := regexp_replace(lower(base), '[^a-z0-9._-]+', '-', 'g');
  sanitized := btrim(sanitized, '-');
  sanitized := left(sanitized, 80);

  if sanitized is null or sanitized = '' or sanitized = '.' or sanitized = '..' then
    sanitized := 'file';
  end if;

  return sanitized;
end;
$$;

create table public.message_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid null references public.messages (id) on delete cascade,
  uploader_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  storage_bucket text not null default 'message-attachments',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer null,
  height integer null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz null,
  attached_at timestamptz null,
  constraint message_attachments_status_check
    check (status in ('pending', 'ready', 'attached')),
  constraint message_attachments_attached_requires_message_check
    check (
      (status = 'attached' and message_id is not null)
      or (status <> 'attached' and message_id is null)
    ),
  constraint message_attachments_size_check
    check (size_bytes > 0 and size_bytes <= 10485760),
  constraint message_attachments_mime_check
    check (private.attachment_extensions_for_mime(mime_type) is not null),
  constraint message_attachments_supported_check
    check (private.is_supported_attachment(mime_type, original_filename)),
  constraint message_attachments_filename_length_check
    check (char_length(original_filename) between 1 and 255),
  constraint message_attachments_storage_path_key unique (storage_bucket, storage_path),
  constraint message_attachments_dimensions_check
    check (
      (width is null or width > 0) and (height is null or height > 0)
    )
);

comment on table public.message_attachments is
  'Private message attachment metadata. Rows progress pending -> ready -> attached; deletion removes the row, revoking signed-URL access through Storage SELECT RLS.';

create index message_attachments_message_idx
  on public.message_attachments (message_id, created_at, id)
  where message_id is not null;

create index message_attachments_uploader_status_idx
  on public.message_attachments (uploader_user_id, status);

-- Active messages now permit null content when at least one attachment exists.
alter table public.messages
  add column has_attachments boolean not null default false;

alter table public.messages
  drop constraint messages_content_tombstone_check;

alter table public.messages
  add constraint messages_content_tombstone_check check (
    (
      deleted_at is null
      and (
        (content is not null and char_length(btrim(content)) > 0)
        or has_attachments
      )
    )
    or (
      deleted_at is not null
      and content is null
    )
  );

-- Validates that an attachment, once linked to a message, belongs to the same
-- conversation and to the message sender. Independent of any function path.
create function private.validate_message_attachment_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  linked_message public.messages;
begin
  if new.message_id is null then
    return new;
  end if;

  select message.*
  into linked_message
  from public.messages as message
  where message.id = new.message_id;

  if not found
    or linked_message.conversation_id <> new.conversation_id
    or linked_message.sender_user_id <> new.uploader_user_id then
    raise exception using
      errcode = '23514',
      message = 'attachment must match the message conversation and sender';
  end if;

  return new;
end;
$$;

create trigger message_attachments_validate_link
before insert or update on public.message_attachments
for each row execute function private.validate_message_attachment_row();

-- Returns the JSON attachment array for a message (attached rows only). Used by
-- every message-returning function so the client always receives metadata,
-- never a signed or public URL.
create function private.message_attachments_json(target_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', attachment.id,
        'storage_bucket', attachment.storage_bucket,
        'storage_path', attachment.storage_path,
        'original_filename', attachment.original_filename,
        'mime_type', attachment.mime_type,
        'size_bytes', attachment.size_bytes,
        'width', attachment.width,
        'height', attachment.height,
        'created_at', attachment.created_at
      )
      order by attachment.created_at, attachment.id
    ),
    '[]'::jsonb
  )
  from public.message_attachments as attachment
  where attachment.message_id = target_message_id
    and attachment.status = 'attached';
$$;

-- Storage object authorization helpers. Each derives the actor from auth.uid()
-- so a caller cannot probe another user's access.
create function private.can_current_user_upload_attachment_object(target_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.message_attachments as attachment
    where attachment.storage_bucket = 'message-attachments'
      and attachment.storage_path = target_path
      and attachment.status = 'pending'
      and attachment.uploader_user_id = auth.uid()
  );
$$;

create function private.can_current_user_read_attachment_object(target_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.message_attachments as attachment
    where attachment.storage_bucket = 'message-attachments'
      and attachment.storage_path = target_path
      and (
        attachment.uploader_user_id = auth.uid()
        or (
          attachment.status = 'attached'
          and private.is_conversation_member(attachment.conversation_id, auth.uid())
        )
      )
  );
$$;

-- The private attachment bucket. Bucket-level MIME and size limits provide a
-- second enforcement layer behind the validating RPCs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do nothing;

alter table public.message_attachments enable row level security;

create policy message_attachments_select_member
on public.message_attachments
for select
to authenticated
using (
  uploader_user_id = auth.uid()
  or (
    message_id is not null
    and private.is_current_user_conversation_member(conversation_id)
  )
);

-- Storage object policies, scoped strictly to the attachment bucket so other
-- buckets are unaffected. Upload requires a matching reserved pending row, which
-- prevents arbitrary path selection or cross-conversation uploads.
create policy message_attachments_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-attachments'
  and private.can_current_user_upload_attachment_object(name)
);

create policy message_attachments_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-attachments'
  and private.can_current_user_read_attachment_object(name)
);

create policy message_attachments_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-attachments'
  and owner = auth.uid()
);

-- Reserves an attachment: validates membership and content rules, fixes the
-- Storage path, and returns the upload target. The browser uploads to exactly
-- this path; Storage INSERT RLS rejects anything else.
create function public.create_message_attachment_upload(
  p_conversation_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (
  attachment_id uuid,
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  new_attachment_id uuid := extensions.gen_random_uuid();
  safe_name text;
  object_path text;
begin
  if p_original_filename is null
    or char_length(btrim(p_original_filename)) = 0
    or char_length(p_original_filename) > 255 then
    raise exception using errcode = 'P0001', message = 'invalid_attachment';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_attachment';
  end if;

  if p_size_bytes > 10485760 then
    raise exception using errcode = 'P0001', message = 'attachment_too_large';
  end if;

  if not private.is_supported_attachment(p_mime_type, p_original_filename) then
    raise exception using errcode = 'P0001', message = 'unsupported_attachment_type';
  end if;

  if not private.can_send_in_conversation(p_conversation_id, acting_user_id) then
    raise exception using errcode = 'P0001', message = 'messaging_unavailable';
  end if;

  safe_name := private.safe_attachment_filename(p_original_filename);
  object_path :=
    'conversations/' || p_conversation_id::text
    || '/' || new_attachment_id::text
    || '/' || safe_name;

  insert into public.message_attachments (
    id,
    conversation_id,
    uploader_user_id,
    status,
    storage_bucket,
    storage_path,
    original_filename,
    mime_type,
    size_bytes
  )
  values (
    new_attachment_id,
    p_conversation_id,
    acting_user_id,
    'pending',
    'message-attachments',
    object_path,
    btrim(p_original_filename),
    p_mime_type,
    p_size_bytes
  );

  return query
  select new_attachment_id, 'message-attachments'::text, object_path;
end;
$$;

comment on function public.create_message_attachment_upload(uuid, text, text, bigint) is
  'Reserves a validated attachment upload slot for a conversation member and returns the only Storage path the uploader is authorized to write.';

-- Confirms the object was uploaded and records optional image dimensions, moving
-- the attachment to ready so it can be sent.
create function public.finalize_message_attachment(
  p_attachment_id uuid,
  p_width integer default null,
  p_height integer default null
)
returns table (
  attachment_id uuid,
  status text,
  mime_type text,
  size_bytes bigint,
  original_filename text,
  width integer,
  height integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  selected public.message_attachments;
begin
  if (p_width is not null and p_width <= 0)
    or (p_height is not null and p_height <= 0) then
    raise exception using errcode = 'P0001', message = 'invalid_attachment';
  end if;

  select attachment.*
  into selected
  from public.message_attachments as attachment
  where attachment.id = p_attachment_id
    and attachment.uploader_user_id = acting_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'attachment_not_found';
  end if;

  if selected.status = 'attached' then
    raise exception using errcode = 'P0001', message = 'attachment_not_ready';
  end if;

  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = selected.storage_bucket
      and object.name = selected.storage_path
  ) then
    raise exception using errcode = 'P0001', message = 'attachment_not_uploaded';
  end if;

  update public.message_attachments as attachment
  set
    status = 'ready',
    width = p_width,
    height = p_height,
    finalized_at = clock_timestamp()
  where attachment.id = selected.id
  returning attachment.* into selected;

  return query
  select
    selected.id,
    selected.status,
    selected.mime_type,
    selected.size_bytes,
    selected.original_filename,
    selected.width,
    selected.height;
end;
$$;

comment on function public.finalize_message_attachment(uuid, integer, integer) is
  'Confirms an uploaded object exists and marks the attachment ready for sending. Only the uploader may finalize.';

-- Removes an unattached upload (cancel-before-send / abandoned-upload cleanup).
-- Returns the path so the client can delete the physical object it owns.
create function public.remove_message_attachment(p_attachment_id uuid)
returns table (storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  selected public.message_attachments;
begin
  select attachment.*
  into selected
  from public.message_attachments as attachment
  where attachment.id = p_attachment_id
    and attachment.uploader_user_id = acting_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'attachment_not_found';
  end if;

  if selected.status = 'attached' then
    raise exception using errcode = 'P0001', message = 'action_not_permitted';
  end if;

  delete from public.message_attachments as attachment
  where attachment.id = selected.id;

  return query
  select selected.storage_bucket, selected.storage_path;
end;
$$;

comment on function public.remove_message_attachment(uuid) is
  'Deletes an unattached attachment reservation owned by the caller and returns its path for physical object cleanup.';

-- send_message gains an attachment-ID array. The four-argument call still
-- resolves through the defaulted parameter, so existing text-only callers and
-- tests are unaffected.
drop function public.send_message(uuid, uuid, text, uuid);

create function public.send_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_reply_to_message_id uuid default null,
  p_attachment_ids uuid[] default '{}'
)
returns table (
  id uuid,
  conversation_id uuid,
  sequence bigint,
  sender_user_id uuid,
  content text,
  reply_to_message_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  reactions jsonb,
  attachments jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_content text := nullif(btrim(coalesce(p_content, '')), '');
  attachment_ids uuid[];
  attachment_count integer;
  ready_count integer;
  payload_hash text;
  existing_message public.messages;
  inserted_message public.messages;
  next_sequence bigint;
  activity_at timestamptz := clock_timestamp();
begin
  -- De-duplicate and order the attachment IDs so the idempotency hash is stable.
  select coalesce(array_agg(distinct attachment_id order by attachment_id), '{}')
  into attachment_ids
  from unnest(coalesce(p_attachment_ids, '{}')) as attachment_id
  where attachment_id is not null;

  attachment_count := cardinality(attachment_ids);

  if attachment_count > 4 then
    raise exception using errcode = 'P0001', message = 'too_many_attachments';
  end if;

  if normalized_content is null and attachment_count = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_message_content';
  end if;

  if p_client_message_id is null
    or (normalized_content is not null and char_length(normalized_content) > 8000) then
    raise exception using errcode = 'P0001', message = 'invalid_message_content';
  end if;

  payload_hash := encode(
    extensions.digest(
      p_conversation_id::text
      || chr(31)
      || p_client_message_id::text
      || chr(31)
      || coalesce(normalized_content, '')
      || chr(31)
      || coalesce(p_reply_to_message_id::text, '')
      || chr(31)
      || array_to_string(attachment_ids, ','),
      'sha256'
    ),
    'hex'
  );

  select message.*
  into existing_message
  from public.messages as message
  where message.sender_user_id = acting_user_id
    and message.client_message_id = p_client_message_id;

  if found then
    if existing_message.idempotency_payload_hash <> payload_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;

    return query
    select
      existing_message.id,
      existing_message.conversation_id,
      existing_message.sequence,
      existing_message.sender_user_id,
      existing_message.content,
      existing_message.reply_to_message_id,
      existing_message.created_at,
      existing_message.edited_at,
      existing_message.deleted_at,
      '[]'::jsonb,
      private.message_attachments_json(existing_message.id);
    return;
  end if;

  if not private.can_send_in_conversation(p_conversation_id, acting_user_id) then
    raise exception using errcode = 'P0001', message = 'messaging_unavailable';
  end if;

  -- Lock and validate every attachment: owned by the sender, ready, unattached,
  -- and belonging to this conversation. Locking and counting are separate steps
  -- because FOR UPDATE cannot be combined with an aggregate.
  if attachment_count > 0 then
    perform 1
    from public.message_attachments as attachment
    where attachment.id = any (attachment_ids)
      and attachment.uploader_user_id = acting_user_id
      and attachment.conversation_id = p_conversation_id
      and attachment.status = 'ready'
      and attachment.message_id is null
    for update;

    get diagnostics ready_count = row_count;

    if ready_count <> attachment_count then
      raise exception using errcode = 'P0001', message = 'attachment_not_ready';
    end if;
  end if;

  if p_reply_to_message_id is not null
    and not exists (
      select 1
      from public.messages as reply
      where reply.id = p_reply_to_message_id
        and reply.conversation_id = p_conversation_id
    ) then
    raise exception using errcode = 'P0001', message = 'invalid_reply';
  end if;

  update public.conversations as conversation
  set
    last_sequence = conversation.last_sequence + 1,
    last_message_at = activity_at,
    updated_at = activity_at
  where conversation.id = p_conversation_id
  returning conversation.last_sequence into next_sequence;

  if not found then
    raise exception using errcode = 'P0001', message = 'messaging_unavailable';
  end if;

  insert into public.messages (
    conversation_id,
    sequence,
    sender_user_id,
    client_message_id,
    content,
    reply_to_message_id,
    idempotency_payload_hash,
    has_attachments,
    created_at
  )
  values (
    p_conversation_id,
    next_sequence,
    acting_user_id,
    p_client_message_id,
    normalized_content,
    p_reply_to_message_id,
    payload_hash,
    attachment_count > 0,
    activity_at
  )
  returning messages.* into inserted_message;

  if attachment_count > 0 then
    update public.message_attachments as attachment
    set
      status = 'attached',
      message_id = inserted_message.id,
      attached_at = activity_at
    where attachment.id = any (attachment_ids);
  end if;

  update public.conversations as conversation
  set last_message_id = inserted_message.id
  where conversation.id = inserted_message.conversation_id;

  update public.conversation_members as member
  set
    last_delivered_sequence = greatest(member.last_delivered_sequence, next_sequence),
    last_read_sequence = greatest(member.last_read_sequence, next_sequence)
  where member.conversation_id = inserted_message.conversation_id
    and member.user_id = acting_user_id;

  return query
  select
    inserted_message.id,
    inserted_message.conversation_id,
    inserted_message.sequence,
    inserted_message.sender_user_id,
    inserted_message.content,
    inserted_message.reply_to_message_id,
    inserted_message.created_at,
    inserted_message.edited_at,
    inserted_message.deleted_at,
    '[]'::jsonb,
    private.message_attachments_json(inserted_message.id);
exception
  when unique_violation then
    select message.*
    into existing_message
    from public.messages as message
    where message.sender_user_id = acting_user_id
      and message.client_message_id = p_client_message_id;

    if found and existing_message.idempotency_payload_hash = payload_hash then
      return query
      select
        existing_message.id,
        existing_message.conversation_id,
        existing_message.sequence,
        existing_message.sender_user_id,
        existing_message.content,
        existing_message.reply_to_message_id,
        existing_message.created_at,
        existing_message.edited_at,
        existing_message.deleted_at,
        '[]'::jsonb,
        private.message_attachments_json(existing_message.id);
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
end;
$$;

comment on function public.send_message(uuid, uuid, text, uuid, uuid[]) is
  'Sends text and/or up to four finalized attachments as auth.uid(). The idempotency hash includes the sorted attachment IDs so a changed attachment set is a conflict, not a silent replacement.';

-- Rebuild the message-returning functions so each includes the attachments
-- column. Bodies are unchanged except for the added attachment JSON. The return
-- type changes, so each must be dropped and recreated rather than replaced.
drop function public.list_conversation_messages(uuid, bigint, integer);

create function public.list_conversation_messages(
  p_conversation_id uuid,
  p_before_sequence bigint default null,
  p_result_limit integer default 50
)
returns table (
  id uuid,
  conversation_id uuid,
  sequence bigint,
  sender_user_id uuid,
  content text,
  reply_to_message_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  reactions jsonb,
  attachments jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if p_result_limit is null or p_result_limit < 1 or p_result_limit > 100
    or p_before_sequence is not null and p_before_sequence <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_cursor';
  end if;

  if not private.is_conversation_member(p_conversation_id, acting_user_id) then
    raise exception using errcode = 'P0001', message = 'conversation_not_found';
  end if;

  return query
  select
    message.id,
    message.conversation_id,
    message.sequence,
    message.sender_user_id,
    case when message.deleted_at is null then message.content else null end,
    message.reply_to_message_id,
    message.created_at,
    message.edited_at,
    message.deleted_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'message_id', reaction.message_id,
            'user_id', reaction.user_id,
            'emoji', reaction.emoji,
            'created_at', reaction.created_at
          )
          order by reaction.emoji, reaction.user_id
        )
        from public.message_reactions as reaction
        where reaction.message_id = message.id
      ),
      '[]'::jsonb
    ),
    case
      when message.deleted_at is null then private.message_attachments_json(message.id)
      else '[]'::jsonb
    end
  from public.messages as message
  where message.conversation_id = p_conversation_id
    and (
      p_before_sequence is null
      or message.sequence < p_before_sequence
    )
  order by message.sequence desc
  limit p_result_limit;
end;
$$;

comment on function public.list_conversation_messages(uuid, bigint, integer) is
  'Returns newest-first message pages with attachment metadata. Deleted rows remain content-free, attachment-free tombstones.';

drop function public.edit_message(uuid, text);

create function public.edit_message(p_message_id uuid, p_content text)
returns table (
  id uuid,
  conversation_id uuid,
  sequence bigint,
  sender_user_id uuid,
  content text,
  reply_to_message_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  reactions jsonb,
  attachments jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_content text := btrim(p_content);
  selected_message public.messages;
begin
  if normalized_content is null
    or normalized_content = ''
    or char_length(normalized_content) > 8000 then
    raise exception using errcode = 'P0001', message = 'invalid_message_content';
  end if;

  select message.*
  into selected_message
  from public.messages as message
  where message.id = p_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'message_not_found';
  end if;

  if not private.is_conversation_member(
    selected_message.conversation_id,
    acting_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'message_not_found';
  end if;

  if selected_message.sender_user_id <> acting_user_id
    or selected_message.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'message_not_editable';
  end if;

  if not private.can_send_in_conversation(
    selected_message.conversation_id,
    acting_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'messaging_unavailable';
  end if;

  update public.messages as message
  set
    content = normalized_content,
    edited_at = clock_timestamp()
  where message.id = selected_message.id
  returning message.* into selected_message;

  return query
  select
    selected_message.id,
    selected_message.conversation_id,
    selected_message.sequence,
    selected_message.sender_user_id,
    selected_message.content,
    selected_message.reply_to_message_id,
    selected_message.created_at,
    selected_message.edited_at,
    selected_message.deleted_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'message_id', reaction.message_id,
            'user_id', reaction.user_id,
            'emoji', reaction.emoji,
            'created_at', reaction.created_at
          )
          order by reaction.emoji, reaction.user_id
        )
        from public.message_reactions as reaction
        where reaction.message_id = selected_message.id
      ),
      '[]'::jsonb
    ),
    private.message_attachments_json(selected_message.id);
end;
$$;

drop function public.delete_message(uuid);

create function public.delete_message(p_message_id uuid)
returns table (
  id uuid,
  conversation_id uuid,
  sequence bigint,
  sender_user_id uuid,
  content text,
  reply_to_message_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  reactions jsonb,
  attachments jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  selected_message public.messages;
begin
  select message.*
  into selected_message
  from public.messages as message
  where message.id = p_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'message_not_found';
  end if;

  if not private.is_conversation_member(
    selected_message.conversation_id,
    acting_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'message_not_found';
  end if;

  if selected_message.sender_user_id <> acting_user_id then
    raise exception using errcode = 'P0001', message = 'action_not_permitted';
  end if;

  if selected_message.deleted_at is null then
    delete from public.message_reactions as reaction
    where reaction.message_id = selected_message.id;

    -- Remove attachment metadata. Storage SELECT RLS depends on a live attached
    -- row, so this immediately fails any future signed-URL request.
    delete from public.message_attachments as attachment
    where attachment.message_id = selected_message.id;

    update public.messages as message
    set
      content = null,
      deleted_at = clock_timestamp()
    where message.id = selected_message.id
    returning message.* into selected_message;
  end if;

  return query
  select
    selected_message.id,
    selected_message.conversation_id,
    selected_message.sequence,
    selected_message.sender_user_id,
    null::text,
    selected_message.reply_to_message_id,
    selected_message.created_at,
    selected_message.edited_at,
    selected_message.deleted_at,
    '[]'::jsonb,
    '[]'::jsonb;
end;
$$;

revoke all on function private.attachment_extensions_for_mime(text)
  from public, anon, authenticated;
revoke all on function private.is_supported_attachment(text, text)
  from public, anon, authenticated;
revoke all on function private.safe_attachment_filename(text)
  from public, anon, authenticated;
revoke all on function private.validate_message_attachment_row()
  from public, anon, authenticated;
revoke all on function private.message_attachments_json(uuid)
  from public, anon, authenticated;
revoke all on function private.can_current_user_upload_attachment_object(text)
  from public, anon, authenticated;
revoke all on function private.can_current_user_read_attachment_object(text)
  from public, anon, authenticated;

grant execute on function private.can_current_user_upload_attachment_object(text)
  to authenticated;
grant execute on function private.can_current_user_read_attachment_object(text)
  to authenticated;

revoke all on table public.message_attachments from public, anon, authenticated;
grant select on table public.message_attachments to authenticated;

revoke all on function public.create_message_attachment_upload(uuid, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_message_attachment(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.remove_message_attachment(uuid)
  from public, anon, authenticated;
revoke all on function public.send_message(uuid, uuid, text, uuid, uuid[])
  from public, anon, authenticated;
revoke all on function public.list_conversation_messages(uuid, bigint, integer)
  from public, anon, authenticated;
revoke all on function public.edit_message(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_message(uuid)
  from public, anon, authenticated;

grant execute on function public.create_message_attachment_upload(uuid, text, text, bigint)
  to authenticated;
grant execute on function public.finalize_message_attachment(uuid, integer, integer)
  to authenticated;
grant execute on function public.remove_message_attachment(uuid)
  to authenticated;
grant execute on function public.send_message(uuid, uuid, text, uuid, uuid[])
  to authenticated;
grant execute on function public.list_conversation_messages(uuid, bigint, integer)
  to authenticated;
grant execute on function public.edit_message(uuid, text)
  to authenticated;
grant execute on function public.delete_message(uuid)
  to authenticated;
