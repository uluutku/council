-- Task 009: first built-in AI contact (text-only) with a credit-gated trial.
--
-- Public agent identity is separated from the private system prompt. Browser
-- clients receive read-only access to their own conversations, messages, and
-- credit state through RLS and bounded read RPCs. Every privileged mutation
-- (reserving a credit, persisting messages, recording runs) is performed by the
-- ai-chat Edge Function through service-role-only functions; authenticated
-- browser roles cannot insert messages, runs, or alter credits directly.

-- ---------------------------------------------------------------------------
-- Centralized, documented trial policy.
-- ---------------------------------------------------------------------------
create function private.ai_trial_credit_allowance()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 20; $$;

create function private.ai_trial_duration()
returns interval language sql immutable set search_path = public, pg_temp
as $$ select interval '7 days'; $$;

create function private.ai_max_user_content_length()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 8000; $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.ai_agents (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  avatar_key text null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint ai_agents_slug_format_check check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  constraint ai_agents_name_length_check check (char_length(name) between 1 and 80),
  constraint ai_agents_description_length_check check (char_length(description) between 1 and 400)
);

comment on table public.ai_agents is
  'Public-safe AI contact identity. Readable by authenticated users; never carries the private system prompt.';

create table public.ai_agent_prompt_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  version integer not null,
  system_prompt text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ai_agent_prompt_versions_unique unique (agent_id, version),
  constraint ai_agent_prompt_versions_prompt_length_check
    check (char_length(system_prompt) between 1 and 8000)
);

comment on table public.ai_agent_prompt_versions is
  'Private server-only prompt configuration. No browser role may read this table.';

create unique index ai_agent_prompt_versions_one_active
  on public.ai_agent_prompt_versions (agent_id)
  where is_active;

create table public.ai_conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz null,
  constraint ai_conversations_unique_user_agent unique (user_id, agent_id)
);

create index ai_conversations_user_activity_idx
  on public.ai_conversations (user_id, updated_at desc, id desc);

create table public.ai_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null,
  content text not null,
  client_message_id uuid not null default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint ai_messages_role_check check (role in ('user', 'assistant')),
  constraint ai_messages_content_length_check check (char_length(content) between 1 and 40000)
);

create index ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at, id);

-- User-message idempotency: a client id is unique among user messages in a
-- conversation, so a retry converges on the same row.
create unique index ai_messages_user_idempotency
  on public.ai_messages (conversation_id, client_message_id)
  where role = 'user';

create table public.ai_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_message_id uuid null references public.ai_messages (id) on delete set null,
  assistant_message_id uuid null references public.ai_messages (id) on delete set null,
  status text not null default 'running',
  model text null,
  provider_request_id text null,
  input_tokens integer null,
  output_tokens integer null,
  provider_cost numeric(12, 6) null,
  credit_reserved boolean not null default false,
  error_category text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint ai_runs_status_check check (status in ('running', 'completed', 'failed', 'cancelled'))
);

create index ai_runs_conversation_status_idx
  on public.ai_runs (conversation_id, status);

create table public.ai_credit_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_started_at timestamptz null,
  trial_expires_at timestamptz null,
  trial_credits_remaining integer not null default private.ai_trial_credit_allowance(),
  pro_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint ai_credit_accounts_credits_nonnegative check (trial_credits_remaining >= 0)
);

comment on table public.ai_credit_accounts is
  'Per-user AI trial/credit state. Only service-role generation functions and future billing code mutate balances.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.ai_agents enable row level security;
alter table public.ai_agent_prompt_versions enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_credit_accounts enable row level security;

create policy ai_agents_select_enabled
on public.ai_agents for select to authenticated
using (enabled);

-- No policy on ai_agent_prompt_versions or ai_runs => browser roles are denied.

create policy ai_conversations_select_own
on public.ai_conversations for select to authenticated
using (user_id = auth.uid());

create policy ai_messages_select_own
on public.ai_messages for select to authenticated
using (
  exists (
    select 1 from public.ai_conversations as conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.user_id = auth.uid()
  )
);

create policy ai_credit_accounts_select_own
on public.ai_credit_accounts for select to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants: read-only table access for authenticated; everything else revoked.
-- ---------------------------------------------------------------------------
revoke all on table public.ai_agents from public, anon, authenticated;
revoke all on table public.ai_agent_prompt_versions from public, anon, authenticated;
revoke all on table public.ai_conversations from public, anon, authenticated;
revoke all on table public.ai_messages from public, anon, authenticated;
revoke all on table public.ai_runs from public, anon, authenticated;
revoke all on table public.ai_credit_accounts from public, anon, authenticated;

grant select on table public.ai_agents to authenticated;
grant select on table public.ai_conversations to authenticated;
grant select on table public.ai_messages to authenticated;
grant select on table public.ai_credit_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- Read RPCs (authenticated, identity from auth.uid()).
-- ---------------------------------------------------------------------------
create function public.list_ai_agents()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  avatar_key text,
  enabled boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select agent.id, agent.slug, agent.name, agent.description, agent.avatar_key, agent.enabled
  from public.ai_agents as agent
  where agent.enabled
    and private.require_authenticated() is not null
  order by agent.name;
$$;

create function public.get_or_create_ai_conversation(p_agent_id uuid)
returns table (
  id uuid,
  agent_id uuid,
  agent_slug text,
  agent_name text,
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
  if not exists (
    select 1 from public.ai_agents as agent where agent.id = p_agent_id and agent.enabled
  ) then
    raise exception using errcode = 'P0001', message = 'ai_agent_unavailable';
  end if;

  insert into public.ai_conversations (user_id, agent_id)
  values (acting_user_id, p_agent_id)
  on conflict on constraint ai_conversations_unique_user_agent do nothing;

  select conversation.* into selected
  from public.ai_conversations as conversation
  where conversation.user_id = acting_user_id and conversation.agent_id = p_agent_id;

  return query
  select selected.id, selected.agent_id, agent.slug, agent.name,
         selected.created_at, selected.updated_at, selected.last_message_at
  from public.ai_agents as agent
  where agent.id = selected.agent_id;
end;
$$;

create function public.list_my_ai_conversations(p_limit integer default 30)
returns table (
  id uuid,
  agent_id uuid,
  agent_slug text,
  agent_name text,
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
  select conversation.id, conversation.agent_id, agent.slug, agent.name,
         conversation.created_at, conversation.updated_at, conversation.last_message_at
  from public.ai_conversations as conversation
  join public.ai_agents as agent on agent.id = conversation.agent_id
  where conversation.user_id = acting_user_id
  order by conversation.updated_at desc, conversation.id desc
  limit p_limit;
end;
$$;

create function public.list_ai_messages(
  p_conversation_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  conversation_id uuid,
  role text,
  content text,
  client_message_id uuid,
  created_at timestamptz
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
    where conversation.id = p_conversation_id and conversation.user_id = acting_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
  end if;

  return query
  select message.id, message.conversation_id, message.role, message.content,
         message.client_message_id, message.created_at
  from public.ai_messages as message
  where message.conversation_id = p_conversation_id
  order by message.created_at, message.id
  limit p_limit;
end;
$$;

-- Derives the access state and ensures a credit account row exists.
create function public.get_my_ai_access()
returns table (
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  trial_credits_remaining integer,
  pro_enabled boolean,
  access_state text,
  can_generate boolean
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  account public.ai_credit_accounts;
  state text;
  allowed boolean;
begin
  insert into public.ai_credit_accounts (user_id)
  values (acting_user_id)
  on conflict (user_id) do nothing;

  select * into account from public.ai_credit_accounts where user_id = acting_user_id;

  if account.pro_enabled then
    state := 'pro';
  elsif account.trial_started_at is null then
    state := 'trial_available';
  elsif now() >= account.trial_expires_at then
    state := 'trial_expired';
  elsif account.trial_credits_remaining <= 0 then
    state := 'credits_exhausted';
  else
    state := 'trial_active';
  end if;

  allowed := state in ('pro', 'trial_available', 'trial_active');

  return query
  select account.trial_started_at, account.trial_expires_at, account.trial_credits_remaining,
         account.pro_enabled, state, allowed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileged generation functions (service-role only).
-- ---------------------------------------------------------------------------

-- Reserves a generation: starts the trial once, enforces access, reserves one
-- trial credit (unless Pro), idempotently records the user message, and opens a
-- run. A retry with the same client id converges: a running/completed run is
-- returned without a second credit; a previously failed/cancelled run starts a
-- fresh run reusing the same user message.
create function public.start_ai_generation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_user_content text,
  p_model text
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
  normalized_content text := btrim(coalesce(p_user_content, ''));
  existing_user_message public.ai_messages;
  existing_run public.ai_runs;
  new_user_message_id uuid;
  new_run_id uuid;
  reserved boolean := false;
  state text;
begin
  if normalized_content = ''
    or char_length(normalized_content) > private.ai_max_user_content_length() then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  if not exists (
    select 1 from public.ai_conversations as conversation
    where conversation.id = p_conversation_id and conversation.user_id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
  end if;

  -- Serialize per user so concurrent duplicate requests converge.
  insert into public.ai_credit_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into account from public.ai_credit_accounts
  where user_id = p_user_id for update;

  -- Idempotent replay on an existing user message for this client id.
  select * into existing_user_message
  from public.ai_messages as message
  where message.conversation_id = p_conversation_id
    and message.client_message_id = p_client_message_id
    and message.role = 'user';

  if found then
    select * into existing_run
    from public.ai_runs as run
    where run.user_message_id = existing_user_message.id
    order by run.created_at desc
    limit 1;

    if found and existing_run.status in ('running', 'completed') then
      return query
      select existing_run.id, existing_user_message.id, existing_run.assistant_message_id,
             existing_run.status, true, account.trial_credits_remaining,
             case when account.pro_enabled then 'pro' else 'trial_active' end;
      return;
    end if;
    new_user_message_id := existing_user_message.id;
  end if;

  -- Enforce one active run per conversation.
  if exists (
    select 1 from public.ai_runs as run
    where run.conversation_id = p_conversation_id and run.status = 'running'
  ) then
    raise exception using errcode = 'P0001', message = 'ai_run_in_progress';
  end if;

  -- Coarse per-user rate limit as a safety backstop.
  if (
    select count(*) from public.ai_runs as run
    where run.user_id = p_user_id and run.created_at > now() - interval '60 seconds'
  ) >= 30 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  -- Start trial on first generation.
  if not account.pro_enabled and account.trial_started_at is null then
    update public.ai_credit_accounts
    set trial_started_at = now(),
        trial_expires_at = now() + private.ai_trial_duration(),
        updated_at = now()
    where user_id = p_user_id
    returning * into account;
  end if;

  -- Determine access and reserve a credit.
  if account.pro_enabled then
    state := 'pro';
  elsif now() >= account.trial_expires_at then
    raise exception using errcode = 'P0001', message = 'trial_expired';
  elsif account.trial_credits_remaining <= 0 then
    raise exception using errcode = 'P0001', message = 'credits_exhausted';
  else
    update public.ai_credit_accounts
    set trial_credits_remaining = trial_credits_remaining - 1, updated_at = now()
    where user_id = p_user_id
    returning * into account;
    reserved := true;
    state := 'trial_active';
  end if;

  if new_user_message_id is null then
    insert into public.ai_messages (conversation_id, role, content, client_message_id)
    values (p_conversation_id, 'user', normalized_content, p_client_message_id)
    returning id into new_user_message_id;
  end if;

  insert into public.ai_runs (
    user_id, conversation_id, user_message_id, status, model, credit_reserved
  )
  values (p_user_id, p_conversation_id, new_user_message_id, 'running', p_model, reserved)
  returning id into new_run_id;

  update public.ai_conversations
  set updated_at = now(), last_message_at = now()
  where id = p_conversation_id;

  return query
  select new_run_id, new_user_message_id, null::uuid, 'running', false,
         account.trial_credits_remaining, state;
end;
$$;

-- Persists the assistant response and marks the run completed.
create function public.complete_ai_generation(
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
  new_assistant_message_id uuid;
  remaining integer;
begin
  if normalized_content = '' or char_length(normalized_content) > 40000 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  update public.ai_runs set status = 'completed'
  where id = p_run_id and status = 'running'
  returning * into run;

  if not found then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;

  insert into public.ai_messages (conversation_id, role, content)
  values (run.conversation_id, 'assistant', normalized_content)
  returning id into new_assistant_message_id;

  update public.ai_runs
  set assistant_message_id = new_assistant_message_id,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      provider_cost = p_provider_cost,
      provider_request_id = p_provider_request_id,
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

-- Marks a run failed/cancelled and refunds the reserved credit exactly once.
create function public.fail_ai_generation(
  p_run_id uuid,
  p_error_category text default 'provider_unavailable',
  p_status text default 'failed'
)
returns table (credits_remaining integer)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  run public.ai_runs;
  remaining integer;
begin
  if p_status not in ('failed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  update public.ai_runs
  set status = p_status, error_category = left(coalesce(p_error_category, 'unknown'), 64),
      completed_at = now()
  where id = p_run_id and status = 'running'
  returning * into run;

  if not found then
    -- Already terminal: report the current balance without a second refund.
    select trial_credits_remaining into remaining
    from public.ai_credit_accounts
    where user_id = (select user_id from public.ai_runs where id = p_run_id);
    return query select remaining;
    return;
  end if;

  if run.credit_reserved then
    update public.ai_runs set credit_reserved = false where id = p_run_id;
    update public.ai_credit_accounts
    set trial_credits_remaining = trial_credits_remaining + 1, updated_at = now()
    where user_id = run.user_id
    returning trial_credits_remaining into remaining;
  else
    select trial_credits_remaining into remaining
    from public.ai_credit_accounts where user_id = run.user_id;
  end if;

  return query select remaining;
end;
$$;

-- Trusted backend / future billing hook for adjusting credit and Pro state.
-- Reachable only by the service role; this is the single sanctioned path for
-- changing balances (used by billing later and by local tests today).
create function public.admin_set_ai_credits(
  p_user_id uuid,
  p_trial_credits_remaining integer default null,
  p_pro_enabled boolean default null,
  p_trial_expires_at timestamptz default null,
  p_trial_started_at timestamptz default null
)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  insert into public.ai_credit_accounts (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  update public.ai_credit_accounts
  set trial_credits_remaining = coalesce(p_trial_credits_remaining, trial_credits_remaining),
      pro_enabled = coalesce(p_pro_enabled, pro_enabled),
      trial_expires_at = coalesce(p_trial_expires_at, trial_expires_at),
      trial_started_at = coalesce(p_trial_started_at, trial_started_at),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function grants.
-- ---------------------------------------------------------------------------
revoke all on function private.ai_trial_credit_allowance() from public, anon, authenticated;
revoke all on function private.ai_trial_duration() from public, anon, authenticated;
revoke all on function private.ai_max_user_content_length() from public, anon, authenticated;

revoke all on function public.list_ai_agents() from public, anon, authenticated;
revoke all on function public.get_or_create_ai_conversation(uuid) from public, anon, authenticated;
revoke all on function public.list_my_ai_conversations(integer) from public, anon, authenticated;
revoke all on function public.list_ai_messages(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_my_ai_access() from public, anon, authenticated;
revoke all on function public.start_ai_generation(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_ai_generation(uuid, text, integer, integer, numeric, text)
  from public, anon, authenticated;
revoke all on function public.fail_ai_generation(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.list_ai_agents() to authenticated;
grant execute on function public.get_or_create_ai_conversation(uuid) to authenticated;
grant execute on function public.list_my_ai_conversations(integer) to authenticated;
grant execute on function public.list_ai_messages(uuid, integer) to authenticated;
grant execute on function public.get_my_ai_access() to authenticated;

-- Generation functions are reachable only by the service role (the Edge Function).
grant execute on function public.start_ai_generation(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.complete_ai_generation(uuid, text, integer, integer, numeric, text)
  to service_role;
grant execute on function public.fail_ai_generation(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Seed the built-in Council Assistant and its private prompt.
-- ---------------------------------------------------------------------------
insert into public.ai_agents (slug, name, description, enabled)
values (
  'council-assistant',
  'Council Assistant',
  'A thoughtful general-purpose assistant for planning, writing, learning and problem solving.',
  true
);

insert into public.ai_agent_prompt_versions (agent_id, version, system_prompt, is_active)
select
  agent.id,
  1,
  'You are Council Assistant, a thoughtful, general-purpose AI assistant inside the Council '
  || 'messenger. You help with planning, writing, learning, and problem solving. Be clear, '
  || 'concise, and honest. You are an AI, not a human; if asked, say so plainly and never claim '
  || 'to be a real person. You do not have access to the user''s other conversations, files, or '
  || 'images. If you are unsure or could be wrong, say so.',
  true
from public.ai_agents as agent
where agent.slug = 'council-assistant';

-- Loads everything the provider needs for a run: the active private system
-- prompt and a bounded recent message window, ordered oldest-first. Reachable
-- only by the service role (the Edge Function); the prompt never reaches a
-- browser client.
create function public.load_ai_run_context(p_run_id uuid, p_max_messages integer default 20)
returns table (system_prompt text, messages jsonb)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  run public.ai_runs;
begin
  select * into run from public.ai_runs where id = p_run_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;

  return query
  select
    (
      select version.system_prompt
      from public.ai_conversations as conversation
      join public.ai_agent_prompt_versions as version
        on version.agent_id = conversation.agent_id and version.is_active
      where conversation.id = run.conversation_id
      limit 1
    ),
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('role', windowed.role, 'content', windowed.content)
                         order by windowed.created_at, windowed.id)
        from (
          select message.role, message.content, message.created_at, message.id
          from public.ai_messages as message
          where message.conversation_id = run.conversation_id
          order by message.created_at desc, message.id desc
          limit greatest(p_max_messages, 1)
        ) as windowed
      ),
      '[]'::jsonb
    );
end;
$$;

-- Returns a completed run's assistant message, used to satisfy an idempotent
-- replay without calling the provider again.
create function public.get_ai_assistant_message(p_run_id uuid)
returns table (id uuid, content text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select message.id, message.content, message.created_at
  from public.ai_runs as run
  join public.ai_messages as message on message.id = run.assistant_message_id
  where run.id = p_run_id;
$$;

revoke all on function public.load_ai_run_context(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_ai_assistant_message(uuid) from public, anon, authenticated;
grant execute on function public.load_ai_run_context(uuid, integer) to service_role;
grant execute on function public.get_ai_assistant_message(uuid) to service_role;

revoke all on function public.admin_set_ai_credits(uuid, integer, boolean, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_set_ai_credits(uuid, integer, boolean, timestamptz, timestamptz)
  to service_role;
