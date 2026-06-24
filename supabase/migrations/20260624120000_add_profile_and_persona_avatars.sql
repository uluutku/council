-- Task 025: private avatar uploads for human profiles and custom AI personas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-avatars', 'profile-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('persona-avatars', 'persona-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function private.is_current_user_avatar_path(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  with parts as (
    select string_to_array(coalesce(target_path, ''), '/') as value
  )
  select auth.uid() is not null
    and cardinality(value) = 3
    and value[1] = 'users'
    and value[2] = auth.uid()::text
    and value[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  from parts;
$$;
revoke all on function private.is_current_user_avatar_path(text) from public, anon, authenticated;

create function private.can_current_user_read_profile_avatar(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.avatar_path = target_path
      and private.can_view_profile(profile.id)
  );
$$;
revoke all on function private.can_current_user_read_profile_avatar(text) from public, anon, authenticated;

alter table public.ai_personas
  add column avatar_path text null,
  add constraint ai_personas_avatar_path_length_check check (
    avatar_path is null or char_length(avatar_path) <= 512
  ),
  add constraint ai_personas_avatar_path_relative_check check (
    avatar_path is null
    or (
      avatar_path !~ '^[\\/]'
      and avatar_path !~* '^[a-z][a-z0-9+.-]*:'
      and avatar_path !~ '(^|[\\/])\.\.([\\/]|$)'
      and avatar_path !~ '[[:cntrl:]]'
    )
  );

comment on constraint ai_personas_avatar_path_relative_check on public.ai_personas is
  'Persona avatar values are private Storage-relative paths, never remote URLs, absolute paths, or parent traversals.';

create function private.can_current_user_read_persona_avatar(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ai_personas as persona
    where persona.avatar_path = target_path
      and persona.owner_user_id = auth.uid()
  );
$$;
revoke all on function private.can_current_user_read_persona_avatar(text) from public, anon, authenticated;

create policy profile_avatars_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and private.is_current_user_avatar_path(name)
);

create policy profile_avatars_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and private.can_current_user_read_profile_avatar(name)
);

create policy profile_avatars_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and private.is_current_user_avatar_path(name)
);

create policy persona_avatars_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'persona-avatars'
  and private.is_current_user_avatar_path(name)
);

create policy persona_avatars_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'persona-avatars'
  and private.can_current_user_read_persona_avatar(name)
);

create policy persona_avatars_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'persona-avatars'
  and private.is_current_user_avatar_path(name)
);

create or replace function public.set_my_profile(
  username text,
  display_name text,
  bio text,
  avatar_path text,
  status_text text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  updated_profile public.profiles;
begin
  if $4 is not null and not private.is_current_user_avatar_path($4) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_avatar_path';
  end if;

  update public.profiles
  set
    username = $1,
    display_name = $2,
    bio = $3,
    avatar_path = $4,
    status_text = $5
  where profiles.id = acting_user_id
  returning profiles.* into updated_profile;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'profile not found';
  end if;

  return updated_profile;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'username is already taken';
end;
$$;

drop function public.create_custom_persona(text, text, text, text, text);
create function public.create_custom_persona(
  p_name text,
  p_description text,
  p_instructions text,
  p_tone text,
  p_verbosity text,
  p_avatar_path text default null
)
returns table (
  id uuid,
  name text,
  description text,
  instructions text,
  tone text,
  verbosity text,
  avatar_path text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  inserted public.ai_personas;
begin
  if p_avatar_path is not null and not private.is_current_user_avatar_path(p_avatar_path) then
    raise exception using errcode = 'P0001', message = 'invalid_avatar_path';
  end if;

  if private.active_persona_count(acting_user_id) >= 10 then
    raise exception using errcode = 'P0001', message = 'persona_limit_reached';
  end if;

  insert into public.ai_personas (
    owner_user_id, name, description, instructions, tone, verbosity, avatar_path
  )
  values (
    acting_user_id,
    btrim(coalesce(p_name, '')),
    btrim(coalesce(p_description, '')),
    btrim(coalesce(p_instructions, '')),
    coalesce(p_tone, 'balanced'),
    coalesce(p_verbosity, 'balanced'),
    nullif(btrim(p_avatar_path), '')
  )
  returning * into inserted;

  return query
  select inserted.id, inserted.name, inserted.description, inserted.instructions,
         inserted.tone, inserted.verbosity, inserted.avatar_path, false,
         inserted.created_at, inserted.updated_at;
exception
  when check_violation then
    raise exception using errcode = 'P0001', message = 'invalid_persona';
end;
$$;

drop function public.update_custom_persona(uuid, text, text, text, text, text);
create function public.update_custom_persona(
  p_persona_id uuid,
  p_name text,
  p_description text,
  p_instructions text,
  p_tone text,
  p_verbosity text,
  p_avatar_path text default null
)
returns table (
  id uuid,
  name text,
  description text,
  instructions text,
  tone text,
  verbosity text,
  avatar_path text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  updated public.ai_personas;
begin
  if p_avatar_path is not null and not private.is_current_user_avatar_path(p_avatar_path) then
    raise exception using errcode = 'P0001', message = 'invalid_avatar_path';
  end if;

  update public.ai_personas as persona
  set name = btrim(coalesce(p_name, '')),
      description = btrim(coalesce(p_description, '')),
      instructions = btrim(coalesce(p_instructions, '')),
      tone = coalesce(p_tone, 'balanced'),
      verbosity = coalesce(p_verbosity, 'balanced'),
      avatar_path = nullif(btrim(p_avatar_path), ''),
      updated_at = now()
  where persona.id = p_persona_id and persona.owner_user_id = acting_user_id
  returning * into updated;

  if not found then
    raise exception using errcode = 'P0001', message = 'persona_not_found';
  end if;

  return query
  select updated.id, updated.name, updated.description, updated.instructions,
         updated.tone, updated.verbosity, updated.avatar_path,
         updated.archived_at is not null, updated.created_at, updated.updated_at;
exception
  when check_violation then
    raise exception using errcode = 'P0001', message = 'invalid_persona';
end;
$$;

drop function public.list_my_custom_personas();
create function public.list_my_custom_personas()
returns table (
  id uuid,
  name text,
  description text,
  instructions text,
  tone text,
  verbosity text,
  avatar_path text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  return query
  select persona.id, persona.name, persona.description, persona.instructions,
         persona.tone, persona.verbosity, persona.avatar_path,
         persona.archived_at is not null, persona.created_at, persona.updated_at
  from public.ai_personas as persona
  where persona.owner_user_id = acting_user_id
  order by (persona.archived_at is not null), persona.updated_at desc, persona.id desc;
end;
$$;

drop function public.get_or_create_ai_conversation(uuid, uuid);
drop function public.list_my_ai_conversations(integer);
drop function private.ai_conversation_details(uuid);

create function private.ai_conversation_details(p_conversation_id uuid)
returns table (
  id uuid,
  kind text,
  agent_id uuid,
  persona_id uuid,
  display_name text,
  description text,
  avatar_key text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select
    conversation.id,
    case when conversation.agent_id is not null then 'builtin' else 'custom' end,
    conversation.agent_id,
    conversation.persona_id,
    coalesce(agent.name, persona.name),
    coalesce(agent.description, persona.description),
    coalesce(agent.avatar_key, persona.avatar_path),
    coalesce(persona.archived_at is not null, false),
    conversation.created_at,
    conversation.updated_at,
    conversation.last_message_at
  from public.ai_conversations as conversation
  left join public.ai_agents as agent on agent.id = conversation.agent_id
  left join public.ai_personas as persona on persona.id = conversation.persona_id
  where conversation.id = p_conversation_id;
$$;
revoke all on function private.ai_conversation_details(uuid) from public, anon, authenticated;

create function public.get_or_create_ai_conversation(
  p_agent_id uuid default null,
  p_persona_id uuid default null
)
returns table (
  id uuid,
  kind text,
  agent_id uuid,
  persona_id uuid,
  display_name text,
  description text,
  avatar_key text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  selected public.ai_conversations;
begin
  if num_nonnulls(p_agent_id, p_persona_id) <> 1 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  if p_agent_id is not null then
    if not exists (
      select 1 from public.ai_agents as agent where agent.id = p_agent_id and agent.enabled
    ) then
      raise exception using errcode = 'P0001', message = 'ai_agent_unavailable';
    end if;

    select conversation.* into selected from public.ai_conversations as conversation
    where conversation.user_id = acting_user_id and conversation.agent_id = p_agent_id;
    if not found then
      begin
        insert into public.ai_conversations (user_id, agent_id)
        values (acting_user_id, p_agent_id)
        returning ai_conversations.* into selected;
      exception when unique_violation then
        select conversation.* into selected from public.ai_conversations as conversation
        where conversation.user_id = acting_user_id and conversation.agent_id = p_agent_id;
      end;
    end if;
  else
    if not exists (
      select 1 from public.ai_personas as persona
      where persona.id = p_persona_id and persona.owner_user_id = acting_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
    end if;

    select conversation.* into selected from public.ai_conversations as conversation
    where conversation.user_id = acting_user_id and conversation.persona_id = p_persona_id;
    if not found then
      begin
        insert into public.ai_conversations (user_id, persona_id)
        values (acting_user_id, p_persona_id)
        returning ai_conversations.* into selected;
      exception when unique_violation then
        select conversation.* into selected from public.ai_conversations as conversation
        where conversation.user_id = acting_user_id and conversation.persona_id = p_persona_id;
      end;
    end if;
  end if;

  return query
  select details.* from private.ai_conversation_details(selected.id) as details;
end;
$$;

create function public.list_my_ai_conversations(p_limit integer default 30)
returns table (
  id uuid,
  kind text,
  agent_id uuid,
  persona_id uuid,
  display_name text,
  description text,
  avatar_key text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  return query
  select
    conversation.id,
    case when conversation.agent_id is not null then 'builtin' else 'custom' end,
    conversation.agent_id,
    conversation.persona_id,
    coalesce(agent.name, persona.name),
    coalesce(agent.description, persona.description),
    coalesce(agent.avatar_key, persona.avatar_path),
    coalesce(persona.archived_at is not null, false),
    conversation.created_at,
    conversation.updated_at,
    conversation.last_message_at
  from public.ai_conversations as conversation
  left join public.ai_agents as agent on agent.id = conversation.agent_id
  left join public.ai_personas as persona on persona.id = conversation.persona_id
  where conversation.user_id = acting_user_id
  order by conversation.updated_at desc, conversation.id desc
  limit p_limit;
end;
$$;

revoke all on function public.create_custom_persona(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_custom_persona(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.list_my_custom_personas() from public, anon, authenticated;
revoke all on function public.get_or_create_ai_conversation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_my_ai_conversations(integer) from public, anon, authenticated;

grant execute on function public.create_custom_persona(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.update_custom_persona(uuid, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.list_my_custom_personas() to authenticated;
grant execute on function public.get_or_create_ai_conversation(uuid, uuid) to authenticated;
grant execute on function public.list_my_ai_conversations(integer) to authenticated;
