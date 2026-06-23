-- Task 016: private persistent AI artifacts and immutable versions.

create table public.ai_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ai_conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  agent_id uuid references public.ai_agents(id),
  persona_id uuid references public.ai_personas(id),
  type text not null,
  title text not null,
  current_version_number integer not null default 1,
  create_request_id uuid not null,
  create_payload_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint ai_artifacts_identity_check check ((agent_id is null) <> (persona_id is null)),
  constraint ai_artifacts_type_check check (type in (
    'document', 'plan', 'checklist', 'research_brief', 'comparison',
    'study_plan', 'decision_record', 'project_outline'
  )),
  constraint ai_artifacts_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint ai_artifacts_version_check check (current_version_number >= 1),
  constraint ai_artifacts_payload_hash_check check (create_payload_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_artifacts_request_unique unique (user_id, create_request_id)
);

create index ai_artifacts_owner_updated_idx
  on public.ai_artifacts(user_id, archived_at, updated_at desc, id desc);

create table public.ai_artifact_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  artifact_id uuid not null references public.ai_artifacts(id) on delete cascade,
  version_number integer not null,
  content text not null,
  source_ai_message_id uuid references public.ai_messages(id) on delete set null,
  created_by text not null,
  client_request_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint ai_artifact_versions_number_check check (version_number >= 1),
  constraint ai_artifact_versions_content_check check (char_length(content) between 1 and 100000),
  constraint ai_artifact_versions_creator_check check (created_by in ('user', 'ai')),
  constraint ai_artifact_versions_payload_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_artifact_versions_number_unique unique (artifact_id, version_number),
  constraint ai_artifact_versions_request_unique unique (artifact_id, client_request_id)
);

create index ai_artifact_versions_history_idx
  on public.ai_artifact_versions(artifact_id, version_number desc);

alter table public.ai_artifacts enable row level security;
alter table public.ai_artifact_versions enable row level security;

create policy ai_artifacts_owner_select on public.ai_artifacts
  for select to authenticated using (user_id = auth.uid());
create policy ai_artifact_versions_owner_select on public.ai_artifact_versions
  for select to authenticated using (
    exists (
      select 1 from public.ai_artifacts artifact
      where artifact.id = artifact_id and artifact.user_id = auth.uid()
    )
  );

revoke all on table public.ai_artifacts, public.ai_artifact_versions
  from public, anon, authenticated;
grant select on table public.ai_artifacts, public.ai_artifact_versions to authenticated;
grant all on table public.ai_artifacts, public.ai_artifact_versions to service_role;

create function private.ai_artifact_contact_name(p_artifact public.ai_artifacts)
returns text language sql stable set search_path = public, pg_temp
as $$
  select case
    when p_artifact.agent_id is not null then
      (select agent.name from public.ai_agents agent where agent.id = p_artifact.agent_id)
    else
      (select persona.name from public.ai_personas persona where persona.id = p_artifact.persona_id)
  end;
$$;

create function private.ai_artifact_json(p_artifact_id uuid, p_include_versions boolean default false)
returns jsonb language sql stable set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', artifact.id,
    'ai_conversation_id', artifact.ai_conversation_id,
    'agent_id', artifact.agent_id,
    'persona_id', artifact.persona_id,
    'type', artifact.type,
    'title', artifact.title,
    'current_version_number', artifact.current_version_number,
    'current_content', current_version.content,
    'ai_contact_name', private.ai_artifact_contact_name(artifact),
    'ai_revision_available', case
      when artifact.agent_id is not null then exists (
        select 1 from public.ai_agents agent where agent.id = artifact.agent_id and agent.enabled
      )
      else exists (
        select 1 from public.ai_personas persona
        where persona.id = artifact.persona_id and persona.archived_at is null
      )
    end,
    'created_at', artifact.created_at,
    'updated_at', artifact.updated_at,
    'archived_at', artifact.archived_at,
    'versions', case when p_include_versions then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', version.id,
        'version_number', version.version_number,
        'content', version.content,
        'source_ai_message_id', version.source_ai_message_id,
        'created_by', version.created_by,
        'created_at', version.created_at
      ) order by version.version_number desc)
      from public.ai_artifact_versions version where version.artifact_id = artifact.id
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.ai_artifacts artifact
  join public.ai_artifact_versions current_version
    on current_version.artifact_id = artifact.id
   and current_version.version_number = artifact.current_version_number
  where artifact.id = p_artifact_id;
$$;

create function public.list_my_ai_artifacts(
  p_include_archived boolean default true,
  p_limit integer default 100
)
returns setof jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare acting_user_id uuid := private.require_authenticated();
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  return query
  select private.ai_artifact_json(artifact.id, false)
  from public.ai_artifacts artifact
  where artifact.user_id = acting_user_id
    and (p_include_archived or artifact.archived_at is null)
  order by artifact.updated_at desc, artifact.id desc
  limit p_limit;
end;
$$;

create function public.get_ai_artifact(p_artifact_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  result jsonb;
begin
  select private.ai_artifact_json(artifact.id, true) into result
  from public.ai_artifacts artifact
  where artifact.id = p_artifact_id and artifact.user_id = acting_user_id;
  if result is null then
    raise exception using errcode = 'P0001', message = 'artifact_not_found';
  end if;
  return result;
end;
$$;

create function public.create_ai_artifact(
  p_source_ai_message_id uuid,
  p_type text,
  p_title text,
  p_content text,
  p_client_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  source_message public.ai_messages;
  conversation public.ai_conversations;
  normalized_title text := btrim(coalesce(p_title, ''));
  chosen_content text;
  payload_hash text;
  existing public.ai_artifacts;
  new_artifact_id uuid;
begin
  if p_client_request_id is null or normalized_title = ''
    or char_length(normalized_title) > 120
    or p_type not in (
      'document', 'plan', 'checklist', 'research_brief', 'comparison',
      'study_plan', 'decision_record', 'project_outline'
    ) then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('ai-artifact-limit:' || acting_user_id::text, 0)
  );

  select message.* into source_message
  from public.ai_messages message
  join public.ai_conversations ai_conversation on ai_conversation.id = message.conversation_id
  where message.id = p_source_ai_message_id
    and message.role = 'assistant'
    and ai_conversation.user_id = acting_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'source_message_unavailable';
  end if;
  select * into conversation from public.ai_conversations where id = source_message.conversation_id;
  chosen_content := coalesce(nullif(p_content, ''), source_message.content);
  if char_length(chosen_content) < 1 or char_length(chosen_content) > 100000 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  payload_hash := encode(extensions.digest(
    source_message.id::text || chr(31) || p_type || chr(31) || normalized_title
    || chr(31) || chosen_content, 'sha256'
  ), 'hex');

  select * into existing from public.ai_artifacts
  where user_id = acting_user_id and create_request_id = p_client_request_id;
  if found then
    if existing.create_payload_hash is distinct from payload_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return private.ai_artifact_json(existing.id, true);
  end if;
  if (select count(*) from public.ai_artifacts
      where user_id = acting_user_id and archived_at is null) >= 100 then
    raise exception using errcode = 'P0001', message = 'artifact_limit_reached';
  end if;

  insert into public.ai_artifacts(
    user_id, ai_conversation_id, agent_id, persona_id, type, title,
    create_request_id, create_payload_hash
  ) values (
    acting_user_id, conversation.id, conversation.agent_id, conversation.persona_id,
    p_type, normalized_title, p_client_request_id, payload_hash
  ) returning id into new_artifact_id;

  insert into public.ai_artifact_versions(
    artifact_id, version_number, content, source_ai_message_id, created_by,
    client_request_id, payload_hash
  ) values (
    new_artifact_id, 1, chosen_content, source_message.id, 'user',
    p_client_request_id, encode(extensions.digest(chosen_content, 'sha256'), 'hex')
  );
  return private.ai_artifact_json(new_artifact_id, true);
end;
$$;

create function public.create_ai_artifact_version(
  p_artifact_id uuid,
  p_content text,
  p_created_by text,
  p_client_request_id uuid,
  p_expected_current_version integer default null
)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  artifact public.ai_artifacts;
  existing public.ai_artifact_versions;
  next_version integer;
  payload_hash text;
begin
  if p_client_request_id is null or p_created_by <> 'user'
    or char_length(coalesce(p_content, '')) < 1 or char_length(p_content) > 100000 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  select * into artifact from public.ai_artifacts
  where id = p_artifact_id and user_id = acting_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'artifact_not_found'; end if;
  if artifact.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'artifact_archived';
  end if;
  payload_hash := encode(extensions.digest(p_created_by || chr(31) || p_content, 'sha256'), 'hex');
  select * into existing from public.ai_artifact_versions
  where artifact_id = artifact.id and client_request_id = p_client_request_id;
  if found then
    if existing.payload_hash is distinct from payload_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return private.ai_artifact_json(artifact.id, true);
  end if;
  if p_expected_current_version is not null
    and p_expected_current_version <> artifact.current_version_number then
    raise exception using errcode = 'P0001', message = 'artifact_version_conflict';
  end if;
  next_version := artifact.current_version_number + 1;
  insert into public.ai_artifact_versions(
    artifact_id, version_number, content, created_by, client_request_id, payload_hash
  ) values (
    artifact.id, next_version, p_content, p_created_by, p_client_request_id, payload_hash
  );
  update public.ai_artifacts
  set current_version_number = next_version, updated_at = now()
  where id = artifact.id;
  return private.ai_artifact_json(artifact.id, true);
end;
$$;

create function public.restore_ai_artifact_version(
  p_artifact_id uuid,
  p_version_number integer,
  p_client_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  content_to_restore text;
begin
  select version.content into content_to_restore
  from public.ai_artifact_versions version
  join public.ai_artifacts artifact on artifact.id = version.artifact_id
  where artifact.id = p_artifact_id and artifact.user_id = acting_user_id
    and version.version_number = p_version_number;
  if content_to_restore is null then
    raise exception using errcode = 'P0001', message = 'artifact_version_not_found';
  end if;
  return public.create_ai_artifact_version(
    p_artifact_id, content_to_restore, 'user', p_client_request_id, null
  );
end;
$$;

create function public.save_ai_artifact_revision(
  p_run_id uuid,
  p_client_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  run public.ai_runs;
  artifact public.ai_artifacts;
  existing public.ai_artifact_versions;
  next_version integer;
  payload_hash text;
begin
  if p_client_request_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  select * into run from public.ai_runs
  where id = p_run_id and user_id = acting_user_id and status = 'completed'
    and artifact_id is not null and proposed_artifact_content is not null;
  if not found then
    raise exception using errcode = 'P0001', message = 'artifact_revision_unavailable';
  end if;
  select * into artifact from public.ai_artifacts
  where id = run.artifact_id and user_id = acting_user_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'artifact_not_found'; end if;
  if artifact.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'artifact_archived';
  end if;
  payload_hash := encode(extensions.digest(
    'ai' || chr(31) || run.id::text || chr(31) || run.proposed_artifact_content, 'sha256'
  ), 'hex');
  select * into existing from public.ai_artifact_versions
  where artifact_id = artifact.id and client_request_id = p_client_request_id;
  if found then
    if existing.payload_hash is distinct from payload_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return private.ai_artifact_json(artifact.id, true);
  end if;
  if run.artifact_request_hash is distinct from encode(extensions.digest(
    artifact.id::text || chr(31) || artifact.current_version_number::text
    || chr(31) || run.artifact_instruction, 'sha256'
  ), 'hex') then
    raise exception using errcode = 'P0001', message = 'artifact_version_conflict';
  end if;
  next_version := artifact.current_version_number + 1;
  insert into public.ai_artifact_versions(
    artifact_id, version_number, content, created_by, client_request_id, payload_hash
  ) values (
    artifact.id, next_version, run.proposed_artifact_content,
    'ai', p_client_request_id, payload_hash
  );
  update public.ai_artifacts
  set current_version_number = next_version, updated_at = now()
  where id = artifact.id;
  return private.ai_artifact_json(artifact.id, true);
end;
$$;

create function public.rename_ai_artifact(p_artifact_id uuid, p_title text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare acting_user_id uuid := private.require_authenticated();
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  update public.ai_artifacts set title = btrim(p_title), updated_at = now()
  where id = p_artifact_id and user_id = acting_user_id;
  if not found then raise exception using errcode = 'P0001', message = 'artifact_not_found'; end if;
  return private.ai_artifact_json(p_artifact_id, true);
end;
$$;

create function public.archive_ai_artifact(p_artifact_id uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare acting_user_id uuid := private.require_authenticated();
begin
  update public.ai_artifacts set archived_at = now(), updated_at = now()
  where id = p_artifact_id and user_id = acting_user_id and archived_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'artifact_not_found'; end if;
end;
$$;

create function public.restore_ai_artifact(p_artifact_id uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare acting_user_id uuid := private.require_authenticated();
begin
  perform pg_advisory_xact_lock(
    hashtextextended('ai-artifact-limit:' || acting_user_id::text, 0)
  );
  if (select count(*) from public.ai_artifacts
      where user_id = acting_user_id and archived_at is null) >= 100 then
    raise exception using errcode = 'P0001', message = 'artifact_limit_reached';
  end if;
  update public.ai_artifacts set archived_at = null, updated_at = now()
  where id = p_artifact_id and user_id = acting_user_id and archived_at is not null;
  if not found then raise exception using errcode = 'P0001', message = 'artifact_not_found'; end if;
end;
$$;

alter table public.ai_runs
  add column artifact_id uuid references public.ai_artifacts(id) on delete cascade,
  add column artifact_client_request_id uuid,
  add column artifact_request_hash text,
  add column artifact_instruction text,
  add column proposed_artifact_content text;

alter table public.ai_runs
  add constraint ai_runs_artifact_hash_check
    check (artifact_request_hash is null or artifact_request_hash ~ '^[0-9a-f]{64}$'),
  add constraint ai_runs_artifact_instruction_check
    check (artifact_instruction is null or char_length(artifact_instruction) between 1 and 8000),
  add constraint ai_runs_proposal_length_check
    check (proposed_artifact_content is null or char_length(proposed_artifact_content) between 1 and 100000);

create unique index ai_runs_artifact_request_unique
  on public.ai_runs(user_id, artifact_client_request_id)
  where artifact_id is not null;

create function public.start_ai_artifact_revision(
  p_user_id uuid,
  p_artifact_id uuid,
  p_instruction text,
  p_client_request_id uuid,
  p_model text
)
returns table (
  run_id uuid, status text, is_replay boolean,
  credits_remaining integer, access_state text
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  artifact public.ai_artifacts;
  conversation public.ai_conversations;
  account public.ai_credit_accounts;
  existing public.ai_runs;
  normalized_instruction text := btrim(coalesce(p_instruction, ''));
  request_hash text;
  new_run_id uuid;
  reserved boolean := false;
  state text;
begin
  if p_client_request_id is null or normalized_instruction = ''
    or char_length(normalized_instruction) > 8000 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  perform public.recover_expired_ai_runs(p_user_id, null);
  select * into artifact from public.ai_artifacts
  where id = p_artifact_id and user_id = p_user_id;
  if not found then raise exception using errcode = 'P0001', message = 'artifact_not_found'; end if;
  if artifact.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'artifact_archived';
  end if;
  select * into conversation from public.ai_conversations where id = artifact.ai_conversation_id;
  if artifact.agent_id is not null then
    if not exists (select 1 from public.ai_agents where id = artifact.agent_id and enabled) then
      raise exception using errcode = 'P0001', message = 'ai_agent_unavailable';
    end if;
  elsif not exists (
    select 1 from public.ai_personas
    where id = artifact.persona_id and owner_user_id = p_user_id and archived_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'ai_agent_unavailable';
  end if;
  request_hash := encode(extensions.digest(
    artifact.id::text || chr(31) || artifact.current_version_number::text
    || chr(31) || normalized_instruction, 'sha256'
  ), 'hex');
  select * into existing from public.ai_runs
  where user_id = p_user_id and artifact_client_request_id = p_client_request_id;
  if found then
    if existing.artifact_request_hash is distinct from request_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select * into account from public.ai_credit_accounts where user_id = p_user_id;
    return query select existing.id, existing.status, true,
      account.trial_credits_remaining,
      case when account.pro_enabled then 'pro' else 'trial_active' end;
    return;
  end if;
  if exists (
    select 1 from public.ai_runs active_run
    where active_run.conversation_id = conversation.id and active_run.status = 'running'
  ) then raise exception using errcode = 'P0001', message = 'ai_run_in_progress'; end if;

  insert into public.ai_credit_accounts(user_id) values (p_user_id) on conflict do nothing;
  select * into account from public.ai_credit_accounts where user_id = p_user_id for update;
  if not account.pro_enabled and account.trial_started_at is null then
    update public.ai_credit_accounts
    set trial_started_at = now(), trial_expires_at = now() + private.ai_trial_duration(),
        updated_at = now()
    where user_id = p_user_id returning * into account;
  end if;
  if account.pro_enabled then state := 'pro';
  elsif now() >= account.trial_expires_at then
    raise exception using errcode = 'P0001', message = 'trial_expired';
  elsif account.trial_credits_remaining <= 0 then
    raise exception using errcode = 'P0001', message = 'credits_exhausted';
  else
    update public.ai_credit_accounts
    set trial_credits_remaining = trial_credits_remaining - 1, updated_at = now()
    where user_id = p_user_id returning * into account;
    reserved := true; state := 'trial_active';
  end if;
  insert into public.ai_runs(
    user_id, conversation_id, status, model, credit_reserved,
    artifact_id, artifact_client_request_id, artifact_request_hash, artifact_instruction
  ) values (
    p_user_id, conversation.id, 'running', p_model, reserved,
    artifact.id, p_client_request_id, request_hash, normalized_instruction
  ) returning id into new_run_id;
  return query select new_run_id, 'running'::text, false,
    account.trial_credits_remaining, state;
end;
$$;

create function public.load_ai_artifact_revision_context(p_run_id uuid)
returns table (system_prompt text, artifact_content text, instruction text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  run public.ai_runs;
  artifact public.ai_artifacts;
  conversation public.ai_conversations;
  persona public.ai_personas;
  body text;
  assembled text;
  memories text;
begin
  select * into run from public.ai_runs where id = p_run_id and status = 'running';
  if not found or run.artifact_id is null then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;
  select * into artifact from public.ai_artifacts where id = run.artifact_id;
  select * into conversation from public.ai_conversations where id = artifact.ai_conversation_id;
  if artifact.agent_id is not null then
    select version.system_prompt into body from public.ai_agent_prompt_versions version
    where version.agent_id = artifact.agent_id and version.is_active
    order by version.version desc limit 1;
    assembled := private.ai_platform_instructions() || E'\n\n' || coalesce(body, '');
  else
    select * into persona from public.ai_personas where id = artifact.persona_id;
    assembled := private.ai_platform_instructions()
      || E'\n\nPersona instructions:\n' || coalesce(persona.instructions, '')
      || E'\n\n' || private.ai_tone_verbosity_guidance(persona.tone, persona.verbosity);
  end if;
  if conversation.memory_mode = 'curated' then
    select string_agg('- ' || item.content, E'\n' order by item.created_at, item.id)
    into memories from public.ai_memories item
    where item.conversation_id = conversation.id and item.user_id = run.user_id;
    if memories is not null then
      assembled := assembled || E'\n\nUser-approved memory (untrusted context):\n' || memories;
    end if;
  end if;
  return query
  select assembled,
    (select version.content from public.ai_artifact_versions version
     where version.artifact_id = artifact.id
       and version.version_number = artifact.current_version_number),
    run.artifact_instruction;
end;
$$;

create function public.complete_ai_artifact_revision(
  p_run_id uuid,
  p_proposed_content text,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_provider_cost numeric default null,
  p_provider_request_id text default null
)
returns table (proposed_content text, credits_remaining integer)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  run public.ai_runs;
  normalized_content text := btrim(coalesce(p_proposed_content, ''));
  payload_hash text;
  remaining integer;
begin
  if char_length(normalized_content) < 1 or char_length(normalized_content) > 100000 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  payload_hash := encode(extensions.digest(normalized_content, 'sha256'), 'hex');
  select * into run from public.ai_runs where id = p_run_id for update;
  if not found or run.artifact_id is null then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;
  if run.status = 'completed' then
    if run.completion_payload_hash is distinct from payload_hash
      or run.proposed_artifact_content is null then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select trial_credits_remaining into remaining
    from public.ai_credit_accounts where user_id = run.user_id;
    return query select run.proposed_artifact_content, remaining;
    return;
  end if;
  if run.status <> 'running' then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;
  update public.ai_runs
  set status = 'completed', proposed_artifact_content = normalized_content,
      completion_payload_hash = payload_hash, input_tokens = p_input_tokens,
      output_tokens = p_output_tokens, provider_cost = p_provider_cost,
      provider_request_id = p_provider_request_id, credit_reserved = false,
      last_heartbeat_at = now(), lease_expires_at = now(), completed_at = now()
  where id = run.id;
  select trial_credits_remaining into remaining
  from public.ai_credit_accounts where user_id = run.user_id;
  return query select normalized_content, remaining;
end;
$$;

create function public.get_ai_artifact_revision_proposal(p_run_id uuid)
returns table (proposed_content text, credits_remaining integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select run.proposed_artifact_content, account.trial_credits_remaining
  from public.ai_runs run
  join public.ai_credit_accounts account on account.user_id = run.user_id
  where run.id = p_run_id and run.status = 'completed'
    and run.artifact_id is not null and run.proposed_artifact_content is not null;
$$;

create function private.reject_ai_artifact_version_mutation()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  -- Preserve immutable history for direct mutations while allowing referential
  -- actions during parent deletion (for example, account or conversation cleanup).
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'immutable_artifact_version';
end;
$$;

create trigger ai_artifact_versions_immutable
before update or delete on public.ai_artifact_versions
for each row execute function private.reject_ai_artifact_version_mutation();

revoke all on function private.ai_artifact_contact_name(public.ai_artifacts)
  from public, anon, authenticated;
revoke all on function private.ai_artifact_json(uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.reject_ai_artifact_version_mutation()
  from public, anon, authenticated;

revoke all on function public.list_my_ai_artifacts(boolean, integer)
  from public, anon, authenticated;
revoke all on function public.get_ai_artifact(uuid) from public, anon, authenticated;
revoke all on function public.create_ai_artifact(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_ai_artifact_version(uuid, text, text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.restore_ai_artifact_version(uuid, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.save_ai_artifact_revision(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.rename_ai_artifact(uuid, text) from public, anon, authenticated;
revoke all on function public.archive_ai_artifact(uuid) from public, anon, authenticated;
revoke all on function public.restore_ai_artifact(uuid) from public, anon, authenticated;
revoke all on function public.start_ai_artifact_revision(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.load_ai_artifact_revision_context(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_ai_artifact_revision(
  uuid, text, integer, integer, numeric, text
) from public, anon, authenticated;
revoke all on function public.get_ai_artifact_revision_proposal(uuid)
  from public, anon, authenticated;

grant execute on function public.list_my_ai_artifacts(boolean, integer) to authenticated;
grant execute on function public.get_ai_artifact(uuid) to authenticated;
grant execute on function public.create_ai_artifact(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.create_ai_artifact_version(uuid, text, text, uuid, integer)
  to authenticated;
grant execute on function public.restore_ai_artifact_version(uuid, integer, uuid) to authenticated;
grant execute on function public.save_ai_artifact_revision(uuid, uuid) to authenticated;
grant execute on function public.rename_ai_artifact(uuid, text) to authenticated;
grant execute on function public.archive_ai_artifact(uuid) to authenticated;
grant execute on function public.restore_ai_artifact(uuid) to authenticated;
grant execute on function public.start_ai_artifact_revision(uuid, uuid, text, uuid, text)
  to service_role;
grant execute on function public.load_ai_artifact_revision_context(uuid) to service_role;
grant execute on function public.complete_ai_artifact_revision(
  uuid, text, integer, integer, numeric, text
) to service_role;
grant execute on function public.get_ai_artifact_revision_proposal(uuid) to service_role;
