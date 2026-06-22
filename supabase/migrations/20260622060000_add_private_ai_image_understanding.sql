-- Task 012: private image attachments for AI conversations and server-only
-- vision-analysis caching.

create function private.ai_image_extensions_for_mime(target_mime text)
returns text[] language sql immutable set search_path = public, pg_temp
as $$
  select case target_mime
    when 'image/jpeg' then array['jpg', 'jpeg']
    when 'image/png' then array['png']
    when 'image/webp' then array['webp']
    else null
  end;
$$;

create function private.is_supported_ai_image(target_mime text, target_filename text)
returns boolean language sql immutable set search_path = public, pg_temp
as $$
  select case
    when private.ai_image_extensions_for_mime(target_mime) is null then false
    when position('.' in target_filename) = 0 then false
    else lower(substring(target_filename from '\.([^.]+)$'))
      = any (private.ai_image_extensions_for_mime(target_mime))
  end;
$$;

create table public.ai_message_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  message_id uuid null references public.ai_messages (id) on delete cascade,
  storage_bucket text not null default 'ai-chat-images',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer null,
  height integer null,
  sha256 text null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  finalized_at timestamptz null,
  attached_at timestamptz null,
  constraint ai_message_attachments_status_check
    check (status in ('pending', 'ready', 'attached')),
  constraint ai_message_attachments_link_check check (
    (status = 'attached' and message_id is not null)
    or (status <> 'attached' and message_id is null)
  ),
  constraint ai_message_attachments_bucket_check check (storage_bucket = 'ai-chat-images'),
  constraint ai_message_attachments_size_check check (size_bytes > 0 and size_bytes <= 5242880),
  constraint ai_message_attachments_filename_check
    check (char_length(original_filename) between 1 and 255),
  constraint ai_message_attachments_supported_check
    check (private.is_supported_ai_image(mime_type, original_filename)),
  constraint ai_message_attachments_dimensions_check
    check ((width is null or width > 0) and (height is null or height > 0)),
  constraint ai_message_attachments_sha_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint ai_message_attachments_storage_key unique (storage_bucket, storage_path)
);

create index ai_message_attachments_message_idx
  on public.ai_message_attachments (message_id, created_at, id)
  where message_id is not null;
create index ai_message_attachments_owner_status_idx
  on public.ai_message_attachments (user_id, conversation_id, status);

create function private.validate_ai_message_attachment_link()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare
  linked_message public.ai_messages;
  owner_id uuid;
begin
  if new.message_id is null then return new; end if;
  select * into linked_message from public.ai_messages where id = new.message_id;
  select user_id into owner_id from public.ai_conversations where id = new.conversation_id;
  if not found
    or linked_message.conversation_id <> new.conversation_id
    or linked_message.role <> 'user'
    or owner_id <> new.user_id then
    raise exception using errcode = '23514', message = 'invalid AI image attachment link';
  end if;
  return new;
end;
$$;

create trigger validate_ai_message_attachment_link
before insert or update on public.ai_message_attachments
for each row execute function private.validate_ai_message_attachment_link();

alter table public.ai_messages add column generation_payload_hash text null;

create table public.ai_image_analyses (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_sha256 text not null,
  vision_model text not null,
  prompt_version integer not null,
  analysis jsonb not null,
  input_tokens integer null,
  output_tokens integer null,
  provider_cost numeric(12, 6) null,
  created_at timestamptz not null default now(),
  constraint ai_image_analyses_sha_check check (image_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ai_image_analyses_model_check check (char_length(vision_model) between 1 and 200),
  constraint ai_image_analyses_prompt_version_check check (prompt_version > 0),
  constraint ai_image_analyses_shape_check check (
    jsonb_typeof(analysis) = 'object'
    and analysis ?& array['visual_description', 'visible_text', 'important_details', 'uncertainty']
  ),
  constraint ai_image_analyses_unique
    unique (user_id, image_sha256, vision_model, prompt_version)
);

comment on table public.ai_image_analyses is
  'Server-only, user-scoped cache of bounded structured vision analysis. Browser roles have no access.';

alter table public.ai_message_attachments enable row level security;
alter table public.ai_image_analyses enable row level security;

create policy ai_message_attachments_select_own
on public.ai_message_attachments for select to authenticated
using (user_id = auth.uid());

-- No browser policy exists on ai_image_analyses.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-chat-images',
  'ai-chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function private.can_current_user_upload_ai_image(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ai_message_attachments as attachment
    where attachment.storage_bucket = 'ai-chat-images'
      and attachment.storage_path = target_path
      and attachment.status = 'pending'
      and attachment.user_id = auth.uid()
  );
$$;

create function private.can_current_user_read_ai_image(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ai_message_attachments as attachment
    where attachment.storage_bucket = 'ai-chat-images'
      and attachment.storage_path = target_path
      and attachment.user_id = auth.uid()
      and attachment.status in ('ready', 'attached')
  );
$$;

create function private.can_current_user_delete_ai_image(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ai_message_attachments as attachment
    where attachment.storage_bucket = 'ai-chat-images'
      and attachment.storage_path = target_path
      and attachment.user_id = auth.uid()
      and attachment.status in ('pending', 'ready')
  );
$$;

create policy ai_chat_images_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ai-chat-images'
  and private.can_current_user_upload_ai_image(name)
);

create policy ai_chat_images_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'ai-chat-images'
  and private.can_current_user_read_ai_image(name)
);

create policy ai_chat_images_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'ai-chat-images'
  and private.can_current_user_delete_ai_image(name)
);

create function private.ai_message_attachments_json(target_message_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp
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
  from public.ai_message_attachments as attachment
  where attachment.message_id = target_message_id
    and attachment.status = 'attached';
$$;

create function public.create_ai_image_upload(
  p_conversation_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (attachment_id uuid, storage_bucket text, storage_path text)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  conversation public.ai_conversations;
  new_id uuid := extensions.gen_random_uuid();
  safe_name text;
  object_path text;
begin
  if p_original_filename is null
    or char_length(btrim(p_original_filename)) = 0
    or char_length(p_original_filename) > 255
    or p_size_bytes is null
    or p_size_bytes <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_image';
  end if;
  if p_size_bytes > 5242880 then
    raise exception using errcode = 'P0001', message = 'image_too_large';
  end if;
  if not private.is_supported_ai_image(p_mime_type, p_original_filename) then
    raise exception using errcode = 'P0001', message = 'unsupported_image';
  end if;

  select * into conversation
  from public.ai_conversations
  where id = p_conversation_id and user_id = acting_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
  end if;
  if conversation.persona_id is not null and exists (
    select 1 from public.ai_personas
    where id = conversation.persona_id and archived_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'ai_agent_unavailable';
  end if;

  safe_name := private.safe_attachment_filename(p_original_filename);
  object_path := 'users/' || acting_user_id::text
    || '/conversations/' || p_conversation_id::text
    || '/' || new_id::text || '/' || safe_name;

  insert into public.ai_message_attachments (
    id, user_id, conversation_id, storage_path, original_filename, mime_type, size_bytes
  ) values (
    new_id, acting_user_id, p_conversation_id, object_path,
    btrim(p_original_filename), p_mime_type, p_size_bytes
  );

  return query select new_id, 'ai-chat-images'::text, object_path;
end;
$$;

create function public.finalize_ai_image_upload(
  p_attachment_id uuid,
  p_width integer,
  p_height integer
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
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  selected public.ai_message_attachments;
begin
  if p_width is null or p_width <= 0 or p_height is null or p_height <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_image';
  end if;

  select * into selected
  from public.ai_message_attachments
  where id = p_attachment_id and user_id = acting_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'image_unavailable';
  end if;
  if selected.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid_image';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = selected.storage_bucket and name = selected.storage_path
  ) then
    raise exception using errcode = 'P0001', message = 'image_unavailable';
  end if;

  update public.ai_message_attachments
  set status = 'ready', width = p_width, height = p_height, finalized_at = now()
  where id = selected.id
  returning * into selected;

  return query
  select selected.id, selected.status, selected.mime_type, selected.size_bytes,
         selected.original_filename, selected.width, selected.height;
end;
$$;

create function public.remove_ai_image_upload(p_attachment_id uuid)
returns table (storage_bucket text, storage_path text)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  selected public.ai_message_attachments;
begin
  select * into selected
  from public.ai_message_attachments
  where id = p_attachment_id and user_id = acting_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'image_unavailable';
  end if;
  if selected.status = 'attached' then
    raise exception using errcode = 'P0001', message = 'action_not_permitted';
  end if;

  return query select selected.storage_bucket, selected.storage_path;
end;
$$;

create function public.complete_remove_ai_image_upload(p_attachment_id uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  delete from public.ai_message_attachments
  where id = p_attachment_id
    and user_id = acting_user_id
    and status in ('pending', 'ready');
  if not found then
    raise exception using errcode = 'P0001', message = 'image_unavailable';
  end if;
end;
$$;

drop function public.list_ai_messages(uuid, integer);
create function public.list_ai_messages(p_conversation_id uuid, p_limit integer default 100)
returns table (
  id uuid,
  conversation_id uuid,
  role text,
  content text,
  client_message_id uuid,
  created_at timestamptz,
  attachments jsonb
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  if not exists (
    select 1 from public.ai_conversations as conversation
    where conversation.id = p_conversation_id
      and conversation.user_id = acting_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
  end if;

  return query
  select message.id, message.conversation_id, message.role, message.content,
         message.client_message_id, message.created_at,
         private.ai_message_attachments_json(message.id)
  from public.ai_messages as message
  where message.conversation_id = p_conversation_id
  order by message.created_at, message.id
  limit p_limit;
end;
$$;

drop function public.start_ai_generation(uuid, uuid, uuid, text, text);
create function public.start_ai_generation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_user_content text,
  p_model text,
  p_attachment_ids uuid[] default '{}'
)
returns table (
  run_id uuid,
  user_message_id uuid,
  assistant_message_id uuid,
  status text,
  is_replay boolean,
  credits_remaining integer,
  access_state text
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  account public.ai_credit_accounts;
  conversation public.ai_conversations;
  normalized_content text := btrim(coalesce(p_user_content, ''));
  attachment_ids uuid[];
  attachment_count integer;
  ready_count integer;
  combined_size bigint;
  payload_hash text;
  existing_user_message public.ai_messages;
  existing_run public.ai_runs;
  new_user_message_id uuid;
  new_run_id uuid;
  reserved boolean := false;
  state text;
begin
  if normalized_content = ''
    or char_length(normalized_content) > private.ai_max_user_content_length()
    or p_client_message_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
  into attachment_ids
  from unnest(coalesce(p_attachment_ids, '{}'::uuid[])) as id;
  attachment_count := cardinality(attachment_ids);
  if attachment_count <> cardinality(coalesce(p_attachment_ids, '{}'::uuid[]))
    or attachment_count > 2 then
    raise exception using errcode = 'P0001', message = 'invalid_image';
  end if;

  payload_hash := encode(
    extensions.digest(
      p_conversation_id::text || chr(31) || normalized_content || chr(31)
      || array_to_string(attachment_ids, ','),
      'sha256'
    ),
    'hex'
  );

  select * into conversation from public.ai_conversations
  where id = p_conversation_id and user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
  end if;
  if conversation.agent_id is not null then
    if not exists (select 1 from public.ai_agents where id = conversation.agent_id and enabled) then
      raise exception using errcode = 'P0001', message = 'ai_agent_unavailable';
    end if;
  elsif not exists (
    select 1 from public.ai_personas
    where id = conversation.persona_id and owner_user_id = p_user_id and archived_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ai_agent_unavailable';
  end if;

  insert into public.ai_credit_accounts (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  select * into account from public.ai_credit_accounts where user_id = p_user_id for update;

  select message.* into existing_user_message
  from public.ai_messages as message
  where message.conversation_id = p_conversation_id
    and message.client_message_id = p_client_message_id
    and message.role = 'user';
  if found then
    if existing_user_message.generation_payload_hash is distinct from payload_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select run.* into existing_run
    from public.ai_runs as run
    where run.user_message_id = existing_user_message.id
    order by run.created_at desc limit 1;
    if found and existing_run.status in ('running', 'completed') then
      return query
      select existing_run.id, existing_user_message.id, existing_run.assistant_message_id,
             existing_run.status, true, account.trial_credits_remaining,
             case when account.pro_enabled then 'pro' else 'trial_active' end;
      return;
    end if;
    new_user_message_id := existing_user_message.id;
  end if;

  if attachment_count > 0 and new_user_message_id is null then
    perform 1
    from public.ai_message_attachments as attachment
    where attachment.id = any (attachment_ids)
      and attachment.user_id = p_user_id
      and attachment.conversation_id = p_conversation_id
      and attachment.status = 'ready'
      and attachment.message_id is null
    for update;
    get diagnostics ready_count = row_count;
    if ready_count <> attachment_count then
      raise exception using errcode = 'P0001', message = 'image_unavailable';
    end if;
    select sum(size_bytes) into combined_size
    from public.ai_message_attachments as attachment
    where attachment.id = any (attachment_ids);
    if combined_size > 8388608 then
      raise exception using errcode = 'P0001', message = 'image_too_large';
    end if;
  end if;

  if exists (
    select 1 from public.ai_runs as run
    where run.conversation_id = p_conversation_id and run.status = 'running'
  ) then
    raise exception using errcode = 'P0001', message = 'ai_run_in_progress';
  end if;
  if (
    select count(*) from public.ai_runs as recent_run
    where recent_run.user_id = p_user_id
      and recent_run.created_at > now() - interval '60 seconds'
  ) >= 30 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  if not account.pro_enabled and account.trial_started_at is null then
    update public.ai_credit_accounts
    set trial_started_at = now(), trial_expires_at = now() + private.ai_trial_duration(),
        updated_at = now()
    where user_id = p_user_id returning * into account;
  end if;
  if account.pro_enabled then
    state := 'pro';
  elsif now() >= account.trial_expires_at then
    raise exception using errcode = 'P0001', message = 'trial_expired';
  elsif account.trial_credits_remaining <= 0 then
    raise exception using errcode = 'P0001', message = 'credits_exhausted';
  else
    update public.ai_credit_accounts
    set trial_credits_remaining = trial_credits_remaining - 1, updated_at = now()
    where user_id = p_user_id returning * into account;
    reserved := true;
    state := 'trial_active';
  end if;

  if new_user_message_id is null then
    insert into public.ai_messages (
      conversation_id, role, content, client_message_id, generation_payload_hash
    ) values (
      p_conversation_id, 'user', normalized_content, p_client_message_id, payload_hash
    ) returning id into new_user_message_id;

    if attachment_count > 0 then
      update public.ai_message_attachments
      set status = 'attached', message_id = new_user_message_id, attached_at = now()
      where id = any (attachment_ids);
    end if;
  end if;

  insert into public.ai_runs (
    user_id, conversation_id, user_message_id, status, model, credit_reserved
  ) values (
    p_user_id, p_conversation_id, new_user_message_id, 'running', p_model, reserved
  ) returning id into new_run_id;

  update public.ai_conversations set updated_at = now(), last_message_at = now()
  where id = p_conversation_id;

  return query
  select new_run_id, new_user_message_id, null::uuid, 'running', false,
         account.trial_credits_remaining, state;
end;
$$;

create function public.load_ai_run_attachments(p_run_id uuid)
returns table (
  attachment_id uuid,
  user_id uuid,
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  sha256 text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select attachment.id, attachment.user_id, attachment.storage_bucket,
         attachment.storage_path, attachment.original_filename, attachment.mime_type,
         attachment.size_bytes, attachment.sha256
  from public.ai_runs as run
  join public.ai_message_attachments as attachment
    on attachment.message_id = run.user_message_id
  where run.id = p_run_id
    and attachment.status = 'attached'
  order by attachment.created_at, attachment.id
  limit 2;
$$;

create function public.set_ai_attachment_sha256(p_attachment_id uuid, p_sha256 text)
returns void language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'invalid_image';
  end if;
  update public.ai_message_attachments set sha256 = p_sha256
  where id = p_attachment_id and status = 'attached';
  if not found then
    raise exception using errcode = 'P0001', message = 'image_unavailable';
  end if;
end;
$$;

create function public.get_ai_image_analysis(
  p_user_id uuid,
  p_image_sha256 text,
  p_vision_model text,
  p_prompt_version integer
)
returns table (
  analysis jsonb,
  input_tokens integer,
  output_tokens integer,
  provider_cost numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select cached.analysis, cached.input_tokens, cached.output_tokens, cached.provider_cost
  from public.ai_image_analyses as cached
  where cached.user_id = p_user_id
    and cached.image_sha256 = p_image_sha256
    and cached.vision_model = p_vision_model
    and cached.prompt_version = p_prompt_version;
$$;

create function public.save_ai_image_analysis(
  p_user_id uuid,
  p_image_sha256 text,
  p_vision_model text,
  p_prompt_version integer,
  p_analysis jsonb,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_provider_cost numeric default null
)
returns void language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  insert into public.ai_image_analyses (
    user_id, image_sha256, vision_model, prompt_version, analysis,
    input_tokens, output_tokens, provider_cost
  ) values (
    p_user_id, p_image_sha256, p_vision_model, p_prompt_version, p_analysis,
    p_input_tokens, p_output_tokens, p_provider_cost
  )
  on conflict (user_id, image_sha256, vision_model, prompt_version) do nothing;
exception
  when check_violation then
    raise exception using errcode = 'P0001', message = 'invalid_image';
end;
$$;

revoke all on function private.ai_image_extensions_for_mime(text) from public, anon, authenticated;
revoke all on function private.is_supported_ai_image(text, text) from public, anon, authenticated;
revoke all on function private.can_current_user_upload_ai_image(text)
  from public, anon, authenticated;
revoke all on function private.can_current_user_read_ai_image(text)
  from public, anon, authenticated;
revoke all on function private.can_current_user_delete_ai_image(text)
  from public, anon, authenticated;
revoke all on function private.ai_message_attachments_json(uuid)
  from public, anon, authenticated;
revoke all on function private.validate_ai_message_attachment_link()
  from public, anon, authenticated;
grant execute on function private.can_current_user_upload_ai_image(text) to authenticated;
grant execute on function private.can_current_user_read_ai_image(text) to authenticated;
grant execute on function private.can_current_user_delete_ai_image(text) to authenticated;

revoke all on table public.ai_message_attachments from public, anon, authenticated;
grant select on table public.ai_message_attachments to authenticated;
revoke all on table public.ai_image_analyses from public, anon, authenticated;
grant select on table public.ai_image_analyses to service_role;

revoke all on function public.create_ai_image_upload(uuid, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_image_upload(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.remove_ai_image_upload(uuid) from public, anon, authenticated;
revoke all on function public.complete_remove_ai_image_upload(uuid)
  from public, anon, authenticated;
revoke all on function public.list_ai_messages(uuid, integer) from public, anon, authenticated;
revoke all on function public.start_ai_generation(uuid, uuid, uuid, text, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.load_ai_run_attachments(uuid) from public, anon, authenticated;
revoke all on function public.set_ai_attachment_sha256(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_ai_image_analysis(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.save_ai_image_analysis(
  uuid, text, text, integer, jsonb, integer, integer, numeric
) from public, anon, authenticated;

grant execute on function public.create_ai_image_upload(uuid, text, text, bigint) to authenticated;
grant execute on function public.finalize_ai_image_upload(uuid, integer, integer) to authenticated;
grant execute on function public.remove_ai_image_upload(uuid) to authenticated;
grant execute on function public.complete_remove_ai_image_upload(uuid) to authenticated;
grant execute on function public.list_ai_messages(uuid, integer) to authenticated;
grant execute on function public.start_ai_generation(uuid, uuid, uuid, text, text, uuid[])
  to service_role;
grant execute on function public.load_ai_run_attachments(uuid) to service_role;
grant execute on function public.set_ai_attachment_sha256(uuid, text) to service_role;
grant execute on function public.get_ai_image_analysis(uuid, text, text, integer) to service_role;
grant execute on function public.save_ai_image_analysis(
  uuid, text, text, integer, jsonb, integer, integer, numeric
) to service_role;
