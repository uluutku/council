-- Task 017: messaging polish, private presence/search, and owner-issued Premium access.

-- ---------------------------------------------------------------------------
-- Conversation preferences and private presence
-- ---------------------------------------------------------------------------

create table public.conversation_preferences (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_until timestamptz null,
  muted_forever boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_preferences_mute_check check (
    not muted_forever or muted_until is null
  )
);

create table public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_active_at timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.conversation_preferences enable row level security;
alter table public.user_presence enable row level security;

create policy conversation_preferences_select_own
on public.conversation_preferences for select to authenticated
using (user_id = auth.uid());

revoke all on table public.conversation_preferences, public.user_presence
  from public, anon, authenticated;
grant select on table public.conversation_preferences to authenticated;
grant all on table public.conversation_preferences, public.user_presence to service_role;

create function public.set_conversation_mute(
  p_conversation_id uuid,
  p_duration_seconds integer default null,
  p_forever boolean default false
)
returns table (
  conversation_id uuid,
  muted_until timestamptz,
  muted_forever boolean,
  is_muted boolean
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  preference public.conversation_preferences;
begin
  if not private.is_conversation_member(p_conversation_id, acting_user_id) then
    raise exception using errcode = 'P0001', message = 'conversation_not_found';
  end if;
  if p_forever and p_duration_seconds is not null then
    raise exception using errcode = 'P0001', message = 'invalid_mute';
  end if;
  if p_duration_seconds is not null
    and p_duration_seconds not in (3600, 28800, 604800) then
    raise exception using errcode = 'P0001', message = 'invalid_mute';
  end if;

  insert into public.conversation_preferences (
    conversation_id, user_id, muted_until, muted_forever
  ) values (
    p_conversation_id,
    acting_user_id,
    case when p_duration_seconds is null then null else now() + make_interval(secs => p_duration_seconds) end,
    p_forever
  )
  on conflict on constraint conversation_preferences_pkey do update
  set muted_until = excluded.muted_until,
      muted_forever = excluded.muted_forever,
      updated_at = now()
  returning * into preference;

  return query select preference.conversation_id, preference.muted_until,
    preference.muted_forever,
    preference.muted_forever or preference.muted_until > now();
end;
$$;

create function public.touch_my_presence()
returns timestamptz
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  touched_at timestamptz := now();
begin
  insert into public.user_presence(user_id, last_active_at, updated_at)
  values (acting_user_id, touched_at, touched_at)
  on conflict (user_id) do update
  set last_active_at = case
        when public.user_presence.updated_at <= touched_at - interval '45 seconds'
          then touched_at
        else public.user_presence.last_active_at
      end,
      updated_at = case
        when public.user_presence.updated_at <= touched_at - interval '45 seconds'
          then touched_at
        else public.user_presence.updated_at
      end
  returning last_active_at into touched_at;
  return touched_at;
end;
$$;

create function public.mark_my_presence_offline()
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  insert into public.user_presence(user_id, last_active_at, updated_at)
  values (acting_user_id, null, now())
  on conflict (user_id) do update
  set last_active_at = null, updated_at = now();
end;
$$;

create function public.get_presence_for_users(p_user_ids uuid[])
returns table (
  user_id uuid,
  is_online boolean,
  last_seen_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  requested_ids uuid[];
begin
  select coalesce(array_agg(distinct requested_id order by requested_id), '{}'::uuid[])
  into requested_ids
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) requested_id;
  if cardinality(requested_ids) > 50 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  return query
  select
    profile.id,
    case
      when coalesce((settings.privacy_preferences ->> 'show_online_status')::boolean, true)
        then presence.last_active_at is not null
          and presence.last_active_at > now() - interval '90 seconds'
      else null
    end,
    case
      when coalesce((settings.privacy_preferences ->> 'show_last_seen')::boolean, true)
        then presence.last_active_at
      else null
    end
  from public.profiles profile
  join public.user_settings settings on settings.user_id = profile.id
  left join public.user_presence presence on presence.user_id = profile.id
  where profile.id = any(requested_ids)
    and profile.id <> acting_user_id
    and not private.is_blocked_between(acting_user_id, profile.id)
    and exists (
      select 1 from public.contact_relationships relationship
      where relationship.user_low_id = least(acting_user_id, profile.id)
        and relationship.user_high_id = greatest(acting_user_id, profile.id)
        and relationship.status = 'accepted'
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Bounded conversation and message search
-- ---------------------------------------------------------------------------

create index messages_human_search_idx
  on public.messages using gin (to_tsvector('simple', coalesce(content, '')))
  where deleted_at is null;

create function public.search_my_conversations(
  p_query text,
  p_result_limit integer default 20
)
returns table (
  conversation_id uuid,
  peer_id uuid,
  peer_username text,
  peer_display_name text,
  peer_avatar_path text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_query text := lower(btrim(coalesce(p_query, '')));
begin
  if char_length(normalized_query) < 2 or char_length(normalized_query) > 200
    or p_result_limit < 1 or p_result_limit > 25 then
    raise exception using errcode = 'P0001', message = 'invalid_search';
  end if;

  return query
  select conversation.id, peer.id, profile.username, profile.display_name, profile.avatar_path
  from public.conversation_members member
  join public.conversations conversation on conversation.id = member.conversation_id
  cross join lateral (
    select private.get_direct_conversation_peer(conversation.id, acting_user_id) id
  ) peer
  join public.profiles profile on profile.id = peer.id
  where member.user_id = acting_user_id
    and not private.is_blocked_between(acting_user_id, peer.id)
    and (
      lower(coalesce(profile.display_name, '')) like '%' || normalized_query || '%'
      or lower(coalesce(profile.username, '')) like '%' || normalized_query || '%'
    )
  order by conversation.updated_at desc, conversation.id desc
  limit p_result_limit;
end;
$$;

create function public.search_my_messages(
  p_query text,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_result_limit integer default 30
)
returns table (
  conversation_id uuid,
  message_id uuid,
  sequence bigint,
  snippet text,
  sender_id uuid,
  created_at timestamptz,
  peer_id uuid,
  peer_username text,
  peer_display_name text,
  peer_avatar_path text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_query text := btrim(coalesce(p_query, ''));
begin
  if char_length(normalized_query) < 2 or char_length(normalized_query) > 200
    or p_result_limit < 1 or p_result_limit > 50
    or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = 'P0001', message = 'invalid_search';
  end if;

  return query
  select
    message.conversation_id,
    message.id,
    message.sequence,
    left(regexp_replace(message.content, '[[:space:]]+', ' ', 'g'), 240),
    message.sender_user_id,
    message.created_at,
    peer.id,
    case when private.can_view_profile(peer.id) then profile.username else null end,
    case when private.can_view_profile(peer.id) then profile.display_name else null end,
    case when private.can_view_profile(peer.id) then profile.avatar_path else null end
  from public.messages message
  join public.conversation_members member
    on member.conversation_id = message.conversation_id
    and member.user_id = acting_user_id
  cross join lateral (
    select private.get_direct_conversation_peer(message.conversation_id, acting_user_id) id
  ) peer
  left join public.profiles profile on profile.id = peer.id
  where message.deleted_at is null
    and message.content is not null
    and to_tsvector('simple', message.content) @@ plainto_tsquery('simple', normalized_query)
    and (
      p_before_created_at is null
      or (message.created_at, message.id) < (p_before_created_at, p_before_id)
    )
  order by message.created_at desc, message.id desc
  limit p_result_limit;
end;
$$;

create function public.get_message_window(
  p_conversation_id uuid,
  p_message_id uuid,
  p_radius integer default 25
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
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  target_sequence bigint;
begin
  if p_radius < 1 or p_radius > 50
    or not private.is_conversation_member(p_conversation_id, acting_user_id) then
    raise exception using errcode = 'P0001', message = 'conversation_not_found';
  end if;
  select message.sequence into target_sequence
  from public.messages message
  where message.id = p_message_id and message.conversation_id = p_conversation_id;
  if target_sequence is null then
    raise exception using errcode = 'P0001', message = 'message_not_found';
  end if;

  return query
  select message.id, message.conversation_id, message.sequence, message.sender_user_id,
    case when message.deleted_at is null then message.content else null end,
    message.reply_to_message_id, message.created_at, message.edited_at, message.deleted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'message_id', reaction.message_id, 'user_id', reaction.user_id,
        'emoji', reaction.emoji, 'created_at', reaction.created_at
      ) order by reaction.emoji, reaction.user_id)
      from public.message_reactions reaction where reaction.message_id = message.id
    ), '[]'::jsonb),
    case when message.deleted_at is null then private.message_attachments_json(message.id)
      else '[]'::jsonb end
  from public.messages message
  where message.conversation_id = p_conversation_id
    and message.sequence between greatest(target_sequence - p_radius, 1)
      and target_sequence + p_radius
  order by message.sequence;
end;
$$;

-- Include mute state in the authoritative inbox response.
drop function public.list_my_conversations(integer, timestamptz, uuid);
create function public.list_my_conversations(
  result_limit integer default 30,
  cursor_updated_at timestamptz default null,
  cursor_id uuid default null
)
returns table (
  conversation_id uuid,
  conversation_type text,
  peer_id uuid,
  peer_username text,
  peer_display_name text,
  peer_avatar_path text,
  peer_status_text text,
  last_message_id uuid,
  last_message_content text,
  last_message_deleted boolean,
  last_message_sender_id uuid,
  last_message_sequence bigint,
  last_message_at timestamptz,
  last_read_sequence bigint,
  last_delivered_sequence bigint,
  unread_count bigint,
  can_send boolean,
  updated_at timestamptz,
  muted_until timestamptz,
  muted_forever boolean,
  is_muted boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if result_limit is null or result_limit < 1 or result_limit > 50
    or ((cursor_updated_at is null) <> (cursor_id is null)) then
    raise exception using errcode = 'P0001', message = 'invalid_cursor';
  end if;
  return query
  select conversation.id, conversation.type, peer.id,
    case when private.can_view_profile(peer.id) then profile.username else null end,
    case when private.can_view_profile(peer.id) then profile.display_name else null end,
    case when private.can_view_profile(peer.id) then profile.avatar_path else null end,
    case when private.can_view_profile(peer.id) then profile.status_text else null end,
    last_message.id,
    case when last_message.deleted_at is null then last_message.content else null end,
    coalesce(last_message.deleted_at is not null, false),
    last_message.sender_user_id, conversation.last_sequence, conversation.last_message_at,
    member.last_read_sequence, member.last_delivered_sequence,
    greatest(conversation.last_sequence - member.last_read_sequence, 0),
    private.can_pair_message(pair.user_low_id, pair.user_high_id), conversation.updated_at,
    preference.muted_until, coalesce(preference.muted_forever, false),
    coalesce(preference.muted_forever, false)
      or coalesce(preference.muted_until > now(), false)
  from public.conversation_members member
  join public.conversations conversation on conversation.id = member.conversation_id
  join public.direct_conversation_pairs pair on pair.conversation_id = conversation.id
  cross join lateral (
    select private.get_direct_conversation_peer(conversation.id, acting_user_id) id
  ) peer
  left join public.profiles profile on profile.id = peer.id
  left join public.messages last_message on last_message.id = conversation.last_message_id
  left join public.conversation_preferences preference
    on preference.conversation_id = conversation.id and preference.user_id = acting_user_id
  where member.user_id = acting_user_id
    and (
      cursor_updated_at is null
      or (conversation.updated_at, conversation.id) < (cursor_updated_at, cursor_id)
    )
  order by conversation.updated_at desc, conversation.id desc
  limit result_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private ephemeral typing topics
-- ---------------------------------------------------------------------------

create function private.conversation_ephemeral_realtime_topic(target_conversation_id uuid)
returns text language sql immutable set search_path = public, pg_temp
as $$ select 'conversation:' || target_conversation_id::text || ':ephemeral' $$;

create function private.can_use_council_ephemeral_topic(target_topic text, target_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parsed_conversation_id uuid;
begin
  if target_topic !~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:ephemeral$'
    or target_user_id is null then
    return false;
  end if;
  parsed_conversation_id := substring(target_topic from 14 for 36)::uuid;
  return private.is_conversation_member(parsed_conversation_id, target_user_id);
exception when invalid_text_representation then return false;
end;
$$;

create or replace function private.can_receive_council_realtime_topic(
  target_topic text,
  target_user_id uuid
)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parsed_conversation_id uuid;
begin
  if target_topic is null or target_user_id is null then return false; end if;
  if target_topic = private.user_inbox_realtime_topic(target_user_id) then return true; end if;
  if private.can_use_council_ephemeral_topic(target_topic, target_user_id) then return true; end if;
  if target_topic !~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then return false;
  end if;
  parsed_conversation_id := substring(target_topic from 14)::uuid;
  return private.is_conversation_member(parsed_conversation_id, target_user_id);
exception when invalid_text_representation then return false;
end;
$$;

create policy council_ephemeral_topics_insert
on realtime.messages for insert to authenticated
with check (
  private.can_use_council_ephemeral_topic(realtime.topic(), auth.uid())
  and extension = 'broadcast'
);
grant insert on table realtime.messages to authenticated;

create or replace function private.send_council_realtime_event(
  target_topic text,
  event_name text,
  occurred_at timestamptz,
  target_conversation_id uuid default null,
  target_entity_id uuid default null,
  target_sequence bigint default null,
  target_actor_user_id uuid default null,
  target_last_sequence bigint default null,
  target_read_sequence bigint default null,
  target_delivered_sequence bigint default null
)
returns void language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  envelope jsonb;
begin
  if event_name not in (
    'message.created', 'message.edited', 'message.deleted', 'message.incoming',
    'reaction.changed', 'receipt.changed', 'messaging.availability_changed',
    'conversation.created', 'conversation.changed'
  ) then
    raise exception using errcode = '22023', message = 'unsupported realtime event';
  end if;
  envelope := jsonb_strip_nulls(jsonb_build_object(
    'id', extensions.gen_random_uuid(), 'version', 1, 'event', event_name,
    'occurred_at', occurred_at, 'conversation_id', target_conversation_id,
    'entity_id', target_entity_id, 'sequence', target_sequence,
    'actor_user_id', target_actor_user_id, 'last_sequence', target_last_sequence,
    'read_sequence', target_read_sequence, 'delivered_sequence', target_delivered_sequence
  ));
  perform realtime.send(envelope, event_name, target_topic, true);
end;
$$;

create or replace function private.emit_message_realtime_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  event_time timestamptz := clock_timestamp();
  event_name text;
  affects_preview boolean := false;
  current_last_sequence bigint;
  current_last_message_id uuid;
  participant_id uuid;
begin
  if tg_op = 'INSERT' then
    event_name := 'message.created';
    affects_preview := true;
  elsif old.deleted_at is distinct from new.deleted_at then
    event_name := 'message.deleted';
  elsif old.content is distinct from new.content or old.edited_at is distinct from new.edited_at then
    event_name := 'message.edited';
  else
    return new;
  end if;
  select conversation.last_sequence, conversation.last_message_id
  into current_last_sequence, current_last_message_id
  from public.conversations conversation where conversation.id = new.conversation_id;
  affects_preview := affects_preview or current_last_message_id = new.id;
  perform private.send_council_realtime_event(
    private.conversation_realtime_topic(new.conversation_id), event_name, event_time,
    new.conversation_id, new.id, new.sequence, new.sender_user_id, current_last_sequence
  );
  if affects_preview then
    perform private.send_conversation_inbox_event(
      new.conversation_id, 'conversation.changed', event_time, current_last_sequence
    );
  end if;
  if tg_op = 'INSERT' then
    for participant_id in
      select member.user_id from public.conversation_members member
      where member.conversation_id = new.conversation_id
        and member.user_id <> new.sender_user_id
    loop
      perform private.send_council_realtime_event(
        private.user_inbox_realtime_topic(participant_id), 'message.incoming', event_time,
        new.conversation_id, new.id, new.sequence, new.sender_user_id, current_last_sequence
      );
    end loop;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner-issued Premium codes and immutable grants
-- ---------------------------------------------------------------------------

create table public.premium_access_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  code_hash bytea not null unique,
  code_prefix text not null,
  duration_days integer not null,
  ai_credits integer not null,
  expires_at timestamptz null,
  redeemed_at timestamptz null,
  redeemed_by uuid null references auth.users(id) on delete set null,
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint premium_access_codes_prefix_check check (char_length(code_prefix) between 4 and 16),
  constraint premium_access_codes_days_check check (duration_days between 1 and 365),
  constraint premium_access_codes_credits_check check (ai_credits between 1 and 1000),
  constraint premium_access_codes_redemption_check check (
    (redeemed_at is null) = (redeemed_by is null)
  )
);

create table public.premium_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_code_id uuid not null unique references public.premium_access_codes(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  credits_granted integer not null,
  created_at timestamptz not null default now(),
  constraint premium_grants_duration_check check (ends_at > starts_at),
  constraint premium_grants_credits_check check (credits_granted between 1 and 1000)
);

create table public.premium_redemption_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index premium_grants_user_created_idx
  on public.premium_grants(user_id, created_at desc, id desc);
create index premium_redemption_attempts_user_time_idx
  on public.premium_redemption_attempts(user_id, attempted_at desc);

alter table public.premium_access_codes enable row level security;
alter table public.premium_grants enable row level security;
alter table public.premium_redemption_attempts enable row level security;

create policy premium_grants_select_own
on public.premium_grants for select to authenticated
using (user_id = auth.uid());

revoke all on table public.premium_access_codes, public.premium_grants,
  public.premium_redemption_attempts from public, anon, authenticated;
grant select on table public.premium_grants to authenticated;
grant all on table public.premium_access_codes, public.premium_grants,
  public.premium_redemption_attempts to service_role;

alter table public.ai_credit_accounts
  add column pro_expires_at timestamptz null,
  add column pro_credits_remaining integer not null default 0,
  add constraint ai_credit_accounts_pro_credits_nonnegative check (pro_credits_remaining >= 0);

alter table public.ai_runs
  add column credit_source text null,
  add constraint ai_runs_credit_source_check check (credit_source in ('premium', 'trial'));

create function public.create_premium_access_code(
  p_code_hash bytea,
  p_code_prefix text,
  p_duration_days integer default 30,
  p_ai_credits integer default 100,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if octet_length(p_code_hash) <> 32
    or char_length(btrim(coalesce(p_code_prefix, ''))) not between 4 and 16
    or p_duration_days not between 1 and 365
    or p_ai_credits not between 1 and 1000
    or (p_expires_at is not null and p_expires_at <= now()) then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  insert into public.premium_access_codes(
    code_hash, code_prefix, duration_days, ai_credits, expires_at
  ) values (
    p_code_hash, upper(btrim(p_code_prefix)), p_duration_days, p_ai_credits, p_expires_at
  ) returning id into new_id;
  return new_id;
end;
$$;

create function public.redeem_premium_access_code(p_code text)
returns table (
  redeemed boolean,
  pro_expires_at timestamptz,
  pro_credits_remaining integer
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_code text := upper(btrim(coalesce(p_code, '')));
  selected_code public.premium_access_codes;
  account public.ai_credit_accounts;
  grant_start timestamptz;
  grant_end timestamptz;
begin
  if (
    select count(*) from public.premium_redemption_attempts attempt
    where attempt.user_id = acting_user_id
      and attempt.attempted_at > now() - interval '1 hour'
  ) >= 10 then
    return query select false, null::timestamptz, null::integer;
    return;
  end if;

  if char_length(normalized_code) between 16 and 128 then
    select * into selected_code
    from public.premium_access_codes code
    where code.code_hash = extensions.digest(normalized_code, 'sha256')
    for update;
  end if;

  if selected_code.id is null
    or selected_code.disabled_at is not null
    or selected_code.redeemed_at is not null
    or (selected_code.expires_at is not null and selected_code.expires_at <= now()) then
    insert into public.premium_redemption_attempts(user_id) values (acting_user_id);
    return query select false, null::timestamptz, null::integer;
    return;
  end if;

  insert into public.ai_credit_accounts(user_id) values (acting_user_id)
  on conflict (user_id) do nothing;
  select * into account from public.ai_credit_accounts
  where user_id = acting_user_id for update;

  grant_start := greatest(now(), coalesce(account.pro_expires_at, now()));
  grant_end := grant_start + make_interval(days => selected_code.duration_days);

  update public.premium_access_codes
  set redeemed_at = now(), redeemed_by = acting_user_id
  where id = selected_code.id and redeemed_at is null;
  if not found then
    insert into public.premium_redemption_attempts(user_id) values (acting_user_id);
    return query select false, null::timestamptz, null::integer;
    return;
  end if;

  insert into public.premium_grants(
    user_id, access_code_id, starts_at, ends_at, credits_granted
  ) values (
    acting_user_id, selected_code.id, grant_start, grant_end, selected_code.ai_credits
  );

  update public.ai_credit_accounts as credit_account
  set pro_enabled = true,
      pro_expires_at = grant_end,
      pro_credits_remaining = credit_account.pro_credits_remaining + selected_code.ai_credits,
      updated_at = now()
  where credit_account.user_id = acting_user_id
  returning * into account;

  return query select true, account.pro_expires_at, account.pro_credits_remaining;
end;
$$;

create function public.list_my_premium_grants(p_limit integer default 20)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  credits_granted integer,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  return query
  select grant_row.id, grant_row.starts_at, grant_row.ends_at,
    grant_row.credits_granted, grant_row.created_at
  from public.premium_grants grant_row
  where grant_row.user_id = acting_user_id
  order by grant_row.created_at desc, grant_row.id desc
  limit p_limit;
end;
$$;

drop function public.get_my_ai_access();
create function public.get_my_ai_access()
returns table (
  is_pro boolean,
  pro_expires_at timestamptz,
  pro_credits_remaining integer,
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  trial_credits_remaining integer,
  active_credit_source text,
  access_state text,
  can_generate boolean
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  account public.ai_credit_accounts;
  premium_active boolean;
  trial_active boolean;
  source text;
  state text;
begin
  insert into public.ai_credit_accounts(user_id) values (acting_user_id)
  on conflict (user_id) do nothing;
  select * into account from public.ai_credit_accounts where user_id = acting_user_id;

  premium_active := account.pro_expires_at > now() and account.pro_credits_remaining > 0;
  trial_active := account.trial_started_at is null
    or (account.trial_expires_at > now() and account.trial_credits_remaining > 0);
  source := case when premium_active then 'premium' when trial_active then 'trial' else null end;
  state := case
    when premium_active then 'pro'
    when account.trial_started_at is null then 'trial_available'
    when account.trial_expires_at <= now() then 'trial_expired'
    when account.trial_credits_remaining <= 0 then 'credits_exhausted'
    else 'trial_active'
  end;

  return query select premium_active, account.pro_expires_at, account.pro_credits_remaining,
    account.trial_started_at, account.trial_expires_at, account.trial_credits_remaining,
    source, state, source is not null;
end;
$$;

-- Replace the core generation reservation with Premium-first, trial-second credit use.
create or replace function public.start_ai_generation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_user_content text,
  p_model text,
  p_attachment_ids uuid[] default '{}',
  p_source_conversation_id uuid default null,
  p_source_message_ids uuid[] default '{}'
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
  message_content text;
  attachment_ids uuid[];
  attachment_count integer;
  ready_count integer;
  combined_size bigint;
  source_message_ids uuid[];
  source_count integer;
  source_character_count integer;
  invalid_source_count integer;
  forwarding boolean;
  import_payload_hash text;
  context_import_id uuid;
  existing_import public.ai_context_imports;
  payload_hash text;
  existing_user_message public.ai_messages;
  existing_run public.ai_runs;
  new_user_message_id uuid;
  new_run_id uuid;
  source text;
  state text;
  remaining integer;
begin
  if p_client_message_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;
  select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
  into attachment_ids from unnest(coalesce(p_attachment_ids, '{}'::uuid[])) id;
  attachment_count := cardinality(attachment_ids);
  if attachment_count <> cardinality(coalesce(p_attachment_ids, '{}'::uuid[]))
    or attachment_count > 2 then
    raise exception using errcode = 'P0001', message = 'invalid_image';
  end if;
  forwarding := p_source_conversation_id is not null
    or cardinality(coalesce(p_source_message_ids, '{}'::uuid[])) > 0;
  if forwarding then
    if p_source_conversation_id is null
      or cardinality(coalesce(p_source_message_ids, '{}'::uuid[])) < 1
      or cardinality(coalesce(p_source_message_ids, '{}'::uuid[])) > 20
      or char_length(normalized_content) > 2000 or attachment_count > 0 then
      raise exception using errcode = 'P0001', message = 'invalid_context_import';
    end if;
    message_content := coalesce(nullif(normalized_content, ''), 'Please review the forwarded context.');
  else
    if normalized_content = ''
      or char_length(normalized_content) > private.ai_max_user_content_length() then
      raise exception using errcode = 'P0001', message = 'invalid_request';
    end if;
    message_content := normalized_content;
  end if;

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

  if forwarding then
    if not exists (
      select 1 from public.conversations source_conversation
      join public.conversation_members member
        on member.conversation_id = source_conversation.id
      where source_conversation.id = p_source_conversation_id
        and source_conversation.type = 'direct' and member.user_id = p_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'source_conversation_unavailable';
    end if;
    select coalesce(array_agg(message.id order by message.sequence, message.id), '{}'::uuid[]),
      count(*)::integer, coalesce(sum(char_length(message.content)), 0)::integer,
      count(*) filter (where message.deleted_at is not null or message.content is null
        or char_length(btrim(message.content)) = 0)::integer
    into source_message_ids, source_count, source_character_count, invalid_source_count
    from public.messages message
    where message.id = any(coalesce(p_source_message_ids, '{}'::uuid[]))
      and message.conversation_id = p_source_conversation_id;
    if source_count <> cardinality(coalesce(p_source_message_ids, '{}'::uuid[]))
      or source_count <> cardinality(source_message_ids) or invalid_source_count > 0 then
      raise exception using errcode = 'P0001', message = 'source_message_unavailable';
    end if;
    if source_count > 20 or source_character_count > 20000 then
      raise exception using errcode = 'P0001', message = 'context_import_too_large';
    end if;
    import_payload_hash := encode(extensions.digest(
      p_conversation_id::text || chr(31) || p_source_conversation_id::text || chr(31)
      || array_to_string(source_message_ids, ',') || chr(31) || normalized_content,
      'sha256'), 'hex');
    select * into existing_import from public.ai_context_imports context_import
    where context_import.user_id = p_user_id
      and context_import.client_request_id = p_client_message_id;
    if found then
      if existing_import.request_payload_hash is distinct from import_payload_hash then
        raise exception using errcode = 'P0001', message = 'idempotency_conflict';
      end if;
      context_import_id := existing_import.id;
    else
      insert into public.ai_context_imports(
        user_id, source_conversation_id, destination_ai_conversation_id,
        client_request_id, request_payload_hash, instruction,
        message_count, copied_character_count
      ) values (
        p_user_id, p_source_conversation_id, p_conversation_id,
        p_client_message_id, import_payload_hash, nullif(normalized_content, ''),
        source_count, source_character_count
      ) returning id into context_import_id;
      insert into public.ai_context_import_items(
        context_import_id, source_message_id, source_sender_label, copied_content,
        source_created_at, position, attachments_excluded
      )
      select context_import_id, message.id,
        case when message.sender_user_id = p_user_id then 'You'
          else coalesce(nullif(btrim(profile.display_name), ''),
            case when profile.username is not null then '@' || profile.username end, 'Contact') end,
        message.content, message.created_at,
        row_number() over (order by message.sequence, message.id)::integer,
        message.has_attachments
      from public.messages message
      left join public.profiles profile on profile.id = message.sender_user_id
      where message.id = any(source_message_ids)
        and message.conversation_id = p_source_conversation_id
      order by message.sequence, message.id;
    end if;
  end if;

  payload_hash := encode(extensions.digest(
    p_conversation_id::text || chr(31) || message_content || chr(31)
    || array_to_string(attachment_ids, ',') || chr(31) || coalesce(import_payload_hash, ''),
    'sha256'), 'hex');
  insert into public.ai_credit_accounts(user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  select * into account from public.ai_credit_accounts where user_id = p_user_id for update;

  select message.* into existing_user_message from public.ai_messages message
  where message.conversation_id = p_conversation_id
    and message.client_message_id = p_client_message_id and message.role = 'user';
  if found then
    if existing_user_message.generation_payload_hash is distinct from payload_hash
      or existing_user_message.context_import_id is distinct from context_import_id then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select run.* into existing_run from public.ai_runs run
    where run.user_message_id = existing_user_message.id
    order by run.created_at desc limit 1;
    if found and existing_run.status in ('running', 'completed') then
      remaining := case when existing_run.credit_source = 'premium'
        then account.pro_credits_remaining else account.trial_credits_remaining end;
      return query select existing_run.id, existing_user_message.id,
        existing_run.assistant_message_id, existing_run.status, true, remaining,
        case when existing_run.credit_source = 'premium' then 'pro' else 'trial_active' end;
      return;
    end if;
    new_user_message_id := existing_user_message.id;
  end if;

  if attachment_count > 0 and new_user_message_id is null then
    perform 1 from public.ai_message_attachments attachment
    where attachment.id = any(attachment_ids) and attachment.user_id = p_user_id
      and attachment.conversation_id = p_conversation_id and attachment.status = 'ready'
      and attachment.message_id is null for update;
    get diagnostics ready_count = row_count;
    if ready_count <> attachment_count then
      raise exception using errcode = 'P0001', message = 'image_unavailable';
    end if;
    select sum(size_bytes) into combined_size from public.ai_message_attachments attachment
    where attachment.id = any(attachment_ids);
    if combined_size > 8388608 then
      raise exception using errcode = 'P0001', message = 'image_too_large';
    end if;
  end if;
  if exists (select 1 from public.ai_runs run
    where run.conversation_id = p_conversation_id and run.status = 'running') then
    raise exception using errcode = 'P0001', message = 'ai_run_in_progress';
  end if;
  if (select count(*) from public.ai_runs recent_run
    where recent_run.user_id = p_user_id
      and recent_run.created_at > now() - interval '60 seconds') >= 30 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  if account.pro_expires_at > now() and account.pro_credits_remaining > 0 then
    update public.ai_credit_accounts
    set pro_credits_remaining = pro_credits_remaining - 1, updated_at = now()
    where user_id = p_user_id returning * into account;
    source := 'premium'; state := 'pro'; remaining := account.pro_credits_remaining;
  else
    if account.trial_started_at is null then
      update public.ai_credit_accounts
      set trial_started_at = now(), trial_expires_at = now() + private.ai_trial_duration(),
        updated_at = now()
      where user_id = p_user_id returning * into account;
    end if;
    if account.trial_expires_at <= now() then
      raise exception using errcode = 'P0001', message = 'trial_expired';
    elsif account.trial_credits_remaining <= 0 then
      raise exception using errcode = 'P0001', message = 'credits_exhausted';
    end if;
    update public.ai_credit_accounts
    set trial_credits_remaining = trial_credits_remaining - 1, updated_at = now()
    where user_id = p_user_id returning * into account;
    source := 'trial'; state := 'trial_active'; remaining := account.trial_credits_remaining;
  end if;

  if new_user_message_id is null then
    insert into public.ai_messages(
      conversation_id, role, content, client_message_id, generation_payload_hash, context_import_id
    ) values (
      p_conversation_id, 'user', message_content, p_client_message_id, payload_hash, context_import_id
    ) returning id into new_user_message_id;
    if attachment_count > 0 then
      update public.ai_message_attachments
      set status = 'attached', message_id = new_user_message_id, attached_at = now()
      where id = any(attachment_ids);
    end if;
  end if;
  insert into public.ai_runs(
    user_id, conversation_id, user_message_id, status, model, credit_reserved, credit_source
  ) values (
    p_user_id, p_conversation_id, new_user_message_id, 'running', p_model, true, source
  ) returning id into new_run_id;
  update public.ai_conversations set updated_at = now(), last_message_at = now()
  where id = p_conversation_id;
  return query select new_run_id, new_user_message_id, null::uuid, 'running', false,
    remaining, state;
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
  if not found then raise exception using errcode = 'P0001', message = 'ai_run_not_active'; end if;
  if run.status = 'completed' then
    if run.completion_payload_hash is distinct from payload_hash or run.assistant_message_id is null then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    select case when run.credit_source = 'premium' then account.pro_credits_remaining
      else account.trial_credits_remaining end into remaining
    from public.ai_credit_accounts account where account.user_id = run.user_id;
    return query select run.assistant_message_id, remaining; return;
  end if;
  if run.status <> 'running' then
    raise exception using errcode = 'P0001', message = 'ai_run_not_active';
  end if;
  insert into public.ai_messages(conversation_id, role, content)
  values (run.conversation_id, 'assistant', normalized_content)
  returning id into new_assistant_message_id;
  update public.ai_runs set status = 'completed', assistant_message_id = new_assistant_message_id,
    completion_payload_hash = payload_hash, input_tokens = p_input_tokens,
    output_tokens = p_output_tokens, provider_cost = p_provider_cost,
    provider_request_id = p_provider_request_id, credit_reserved = false,
    last_heartbeat_at = now(), lease_expires_at = now(), completed_at = now()
  where id = p_run_id;
  update public.ai_conversations set updated_at = now(), last_message_at = now()
  where id = run.conversation_id;
  select case when run.credit_source = 'premium' then account.pro_credits_remaining
    else account.trial_credits_remaining end into remaining
  from public.ai_credit_accounts account where account.user_id = run.user_id;
  return query select new_assistant_message_id, remaining;
end;
$$;

create or replace function public.fail_ai_generation(
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
  select * into run from public.ai_runs where id = p_run_id for update;
  if not found then
    return query select null::integer;
    return;
  end if;
  if run.status <> 'running' then
    select case when run.credit_source = 'premium' then account.pro_credits_remaining
      else account.trial_credits_remaining end into remaining
    from public.ai_credit_accounts account where account.user_id = run.user_id;
    return query select remaining;
    return;
  end if;
  update public.ai_runs set status = p_status,
    error_category = left(coalesce(p_error_category, 'unknown'), 64),
    completed_at = now(), credit_reserved = false
  where id = p_run_id and status = 'running';
  if run.credit_reserved then
    if run.credit_source = 'premium' then
      update public.ai_credit_accounts
      set pro_credits_remaining = pro_credits_remaining + 1, updated_at = now()
      where user_id = run.user_id returning pro_credits_remaining into remaining;
    else
      update public.ai_credit_accounts
      set trial_credits_remaining = trial_credits_remaining + 1, updated_at = now()
      where user_id = run.user_id returning trial_credits_remaining into remaining;
    end if;
  else
    select case when run.credit_source = 'premium' then account.pro_credits_remaining
      else account.trial_credits_remaining end into remaining
    from public.ai_credit_accounts account where account.user_id = run.user_id;
  end if;
  return query select remaining;
end;
$$;

create or replace function public.recover_expired_ai_runs(
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
    select run.id, run.user_id, run.credit_reserved, run.credit_source
    from public.ai_runs run
    where run.status = 'running' and run.lease_expires_at <= now()
      and (p_user_id is null or run.user_id = p_user_id)
      and (p_conversation_id is null or run.conversation_id = p_conversation_id)
    order by run.created_at, run.id for update skip locked
  loop
    update public.ai_runs set status = 'failed', error_category = 'run_lease_expired',
      completed_at = now(), credit_reserved = false
    where id = item.id and status = 'running';
    if found then
      recovered := recovered + 1;
      if item.credit_reserved then
        if item.credit_source = 'premium' then
          update public.ai_credit_accounts
          set pro_credits_remaining = pro_credits_remaining + 1, updated_at = now()
          where user_id = item.user_id;
        else
          update public.ai_credit_accounts
          set trial_credits_remaining = trial_credits_remaining + 1, updated_at = now()
          where user_id = item.user_id;
        end if;
        refunded := refunded + 1;
      end if;
    end if;
  end loop;
  return query select recovered, refunded;
end;
$$;

-- Keep the existing test/admin hook compatible while preventing unlimited Pro.
create or replace function public.admin_set_ai_credits(
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
  insert into public.ai_credit_accounts(user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  update public.ai_credit_accounts
  set trial_credits_remaining = coalesce(p_trial_credits_remaining, trial_credits_remaining),
      pro_enabled = case when p_pro_enabled is false then false else pro_enabled end,
      pro_expires_at = case when p_pro_enabled is false then null else pro_expires_at end,
      pro_credits_remaining = case when p_pro_enabled is false then 0 else pro_credits_remaining end,
      trial_expires_at = coalesce(p_trial_expires_at, trial_expires_at),
      trial_started_at = coalesce(p_trial_started_at, trial_started_at),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.set_conversation_mute(uuid, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.touch_my_presence() from public, anon, authenticated;
revoke all on function public.mark_my_presence_offline() from public, anon, authenticated;
revoke all on function public.get_presence_for_users(uuid[]) from public, anon, authenticated;
revoke all on function public.search_my_conversations(text, integer)
  from public, anon, authenticated;
revoke all on function public.search_my_messages(text, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.get_message_window(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.list_my_conversations(integer, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.redeem_premium_access_code(text)
  from public, anon, authenticated;
revoke all on function public.list_my_premium_grants(integer)
  from public, anon, authenticated;
revoke all on function public.create_premium_access_code(bytea, text, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function private.conversation_ephemeral_realtime_topic(uuid)
  from public, anon, authenticated;
revoke all on function private.can_use_council_ephemeral_topic(text, uuid)
  from public, anon, authenticated;

grant execute on function public.set_conversation_mute(uuid, integer, boolean) to authenticated;
grant execute on function public.touch_my_presence() to authenticated;
grant execute on function public.mark_my_presence_offline() to authenticated;
grant execute on function public.get_presence_for_users(uuid[]) to authenticated;
grant execute on function public.search_my_conversations(text, integer) to authenticated;
grant execute on function public.search_my_messages(text, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.get_message_window(uuid, uuid, integer) to authenticated;
grant execute on function public.list_my_conversations(integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.redeem_premium_access_code(text) to authenticated;
grant execute on function public.list_my_premium_grants(integer) to authenticated;
grant execute on function public.create_premium_access_code(bytea, text, integer, integer, timestamptz)
  to service_role;
grant execute on function private.can_use_council_ephemeral_topic(text, uuid) to authenticated;
