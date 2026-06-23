-- Task 015: deterministic AI history pagination and recoverable AI run leases.

alter table public.ai_runs
  add column lease_expires_at timestamptz,
  add column last_heartbeat_at timestamptz,
  add column completion_payload_hash text;

update public.ai_runs
set last_heartbeat_at = created_at,
    lease_expires_at = case
      when status = 'running' then created_at + interval '10 minutes'
      else completed_at
    end;

alter table public.ai_runs
  alter column last_heartbeat_at set default now(),
  alter column lease_expires_at set default (now() + interval '10 minutes');

alter table public.ai_runs
  add constraint ai_runs_completion_payload_hash_check
    check (completion_payload_hash is null or completion_payload_hash ~ '^[0-9a-f]{64}$');

create index ai_runs_expired_lease_idx
  on public.ai_runs (lease_expires_at)
  where status = 'running';

drop function public.list_ai_messages(uuid, integer);
create function public.list_ai_messages(
  p_conversation_id uuid,
  p_limit integer default 100,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  conversation_id uuid,
  role text,
  content text,
  client_message_id uuid,
  created_at timestamptz,
  attachments jsonb,
  documents jsonb,
  context_import jsonb
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if p_limit is null or p_limit < 1 or p_limit > 200
    or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  if not exists (
    select 1 from public.ai_conversations as conversation
    where conversation.id = p_conversation_id and conversation.user_id = acting_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
  end if;

  return query
  select recent.id, recent.conversation_id, recent.role, recent.content,
    recent.client_message_id, recent.created_at, recent.attachments,
    recent.documents, recent.context_import
  from (
    select message.id, message.conversation_id, message.role, message.content,
      message.client_message_id, message.created_at,
      private.ai_message_attachments_json(message.id) as attachments,
      private.ai_message_documents_json(message.id) as documents,
      private.ai_context_import_json(message.context_import_id) as context_import
    from public.ai_messages as message
    where message.conversation_id = p_conversation_id
      and (
        p_before_created_at is null
        or (message.created_at, message.id) < (p_before_created_at, p_before_id)
      )
    order by message.created_at desc, message.id desc
    limit p_limit
  ) as recent
  order by recent.created_at, recent.id;
end;
$$;

create function public.recover_expired_ai_runs(
  p_user_id uuid default null,
  p_conversation_id uuid default null
)
returns table (recovered_count integer, refunded_count integer)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  recovered integer := 0;
  refunded integer := 0;
  item record;
begin
  for item in
    select run.id, run.user_id, run.credit_reserved
    from public.ai_runs as run
    where run.status = 'running'
      and run.lease_expires_at <= now()
      and (p_user_id is null or run.user_id = p_user_id)
      and (p_conversation_id is null or run.conversation_id = p_conversation_id)
    order by run.created_at, run.id
    for update skip locked
  loop
    update public.ai_runs
    set status = 'failed',
        error_category = 'run_lease_expired',
        completed_at = now(),
        credit_reserved = false
    where id = item.id and status = 'running';
    if found then
      recovered := recovered + 1;
      if item.credit_reserved then
        update public.ai_credit_accounts
        set trial_credits_remaining = trial_credits_remaining + 1,
            updated_at = now()
        where user_id = item.user_id;
        refunded := refunded + 1;
      end if;
    end if;
  end loop;
  return query select recovered, refunded;
end;
$$;

create function public.heartbeat_ai_run(p_run_id uuid)
returns timestamptz
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  next_expiry timestamptz := now() + interval '10 minutes';
begin
  update public.ai_runs
  set last_heartbeat_at = now(), lease_expires_at = next_expiry
  where id = p_run_id and status = 'running';
  if not found then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;
  return next_expiry;
end;
$$;

create or replace function public.complete_ai_generation(
  p_run_id uuid,
  p_assistant_content text,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_provider_cost numeric default null,
  p_provider_request_id text default null
)
returns table (assistant_message_id uuid, credits_remaining integer)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  run public.ai_runs;
  normalized_content text := btrim(coalesce(p_assistant_content, ''));
  payload_hash text;
  new_assistant_message_id uuid;
  remaining integer;
begin
  if normalized_content = '' or char_length(normalized_content) > 40000 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  payload_hash := encode(extensions.digest(normalized_content, 'sha256'), 'hex');

  select * into run from public.ai_runs where id = p_run_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;

  if run.status = 'completed' then
    if run.completion_payload_hash is distinct from payload_hash
      or run.assistant_message_id is null then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select trial_credits_remaining into remaining
    from public.ai_credit_accounts where user_id = run.user_id;
    return query select run.assistant_message_id, remaining;
    return;
  end if;
  if run.status <> 'running' then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;

  insert into public.ai_messages (conversation_id, role, content)
  values (run.conversation_id, 'assistant', normalized_content)
  returning id into new_assistant_message_id;

  update public.ai_runs
  set status = 'completed',
      assistant_message_id = new_assistant_message_id,
      completion_payload_hash = payload_hash,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      provider_cost = p_provider_cost,
      provider_request_id = p_provider_request_id,
      credit_reserved = false,
      last_heartbeat_at = now(),
      lease_expires_at = now(),
      completed_at = now()
  where id = p_run_id;

  update public.ai_conversations
  set updated_at = now(), last_message_at = now()
  where id = run.conversation_id;

  select trial_credits_remaining into remaining
  from public.ai_credit_accounts where user_id = run.user_id;
  return query select new_assistant_message_id, remaining;
end;
$$;

revoke all on function public.list_ai_messages(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.list_ai_messages(uuid, integer, timestamptz, uuid)
  to authenticated;

revoke all on function public.recover_expired_ai_runs(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.heartbeat_ai_run(uuid)
  from public, anon, authenticated;
grant execute on function public.recover_expired_ai_runs(uuid, uuid) to service_role;
grant execute on function public.heartbeat_ai_run(uuid) to service_role;
grant select on table public.ai_runs, public.ai_messages, public.ai_credit_accounts to service_role;
