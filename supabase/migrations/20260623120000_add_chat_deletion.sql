-- Task 018: owner-scoped chat deletion for human and AI conversations.

-- Human direct chats are durable shared conversations. Deleting a human chat
-- clears only the caller's visible history through the current sequence and
-- hides the inbox row until a newer message arrives.
alter table public.conversation_preferences
  add column deleted_at timestamptz null,
  add column deleted_through_sequence bigint not null default 0,
  add constraint conversation_preferences_deleted_sequence_check
    check (deleted_through_sequence >= 0);

create function public.delete_conversation_for_me(p_conversation_id uuid)
returns table (
  conversation_id uuid,
  deleted_at timestamptz,
  deleted_through_sequence bigint
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  target_last_sequence bigint;
  deletion_time timestamptz := clock_timestamp();
  preference public.conversation_preferences;
begin
  select conversation.last_sequence
  into target_last_sequence
  from public.conversations conversation
  where conversation.id = p_conversation_id
    and private.is_conversation_member(conversation.id, acting_user_id)
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'conversation_not_found';
  end if;

  insert into public.conversation_preferences (
    conversation_id, user_id, deleted_at, deleted_through_sequence
  ) values (
    p_conversation_id, acting_user_id, deletion_time, target_last_sequence
  )
  on conflict on constraint conversation_preferences_pkey do update
  set deleted_at = excluded.deleted_at,
      deleted_through_sequence = greatest(
        public.conversation_preferences.deleted_through_sequence,
        excluded.deleted_through_sequence
      ),
      updated_at = now()
  returning * into preference;

  perform private.send_council_realtime_event(
    private.user_inbox_realtime_topic(acting_user_id),
    'conversation.changed',
    deletion_time,
    p_conversation_id,
    null,
    target_last_sequence
  );

  return query select
    preference.conversation_id,
    preference.deleted_at,
    preference.deleted_through_sequence;
end;
$$;

comment on function public.delete_conversation_for_me(uuid) is
  'Owner-scoped human chat deletion. Preserves shared membership and peer history while hiding messages through the current sequence from the caller.';

-- AI conversations are owner-scoped, so deleting the chat may delete the row
-- and dependent owner-only history. Active generation runs are rejected so a
-- reserved credit cannot be lost by cascading a running run.
create function public.delete_ai_conversation(p_conversation_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  deleted_id uuid;
begin
  if not exists (
    select 1 from public.ai_conversations conversation
    where conversation.id = p_conversation_id
      and conversation.user_id = acting_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'ai_conversation_not_found';
  end if;

  if exists (
    select 1 from public.ai_runs run
    where run.conversation_id = p_conversation_id
      and run.status = 'running'
  ) then
    raise exception using errcode = 'P0001', message = 'ai_run_in_progress';
  end if;

  delete from public.ai_conversations conversation
  where conversation.id = p_conversation_id
    and conversation.user_id = acting_user_id
  returning conversation.id into deleted_id;

  return deleted_id;
end;
$$;

comment on function public.delete_ai_conversation(uuid) is
  'Deletes an owner-scoped AI conversation and its dependent owner-only history when no generation run is active.';

-- Rebuild read functions so deleted human chat history is hidden from only the
-- deleting user and reappears for newer messages.
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
    greatest(
      conversation.last_sequence
        - greatest(member.last_read_sequence, coalesce(preference.deleted_through_sequence, 0)),
      0
    ),
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
      preference.deleted_at is null
      or conversation.last_sequence > preference.deleted_through_sequence
    )
    and (
      cursor_updated_at is null
      or (conversation.updated_at, conversation.id) < (cursor_updated_at, cursor_id)
    )
  order by conversation.updated_at desc, conversation.id desc
  limit result_limit;
end;
$$;

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
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  deleted_through bigint := 0;
begin
  if p_result_limit is null or p_result_limit < 1 or p_result_limit > 100
    or p_before_sequence is not null and p_before_sequence <= 0 then
    raise exception using errcode = 'P0001', message = 'invalid_cursor';
  end if;

  if not private.is_conversation_member(p_conversation_id, acting_user_id) then
    raise exception using errcode = 'P0001', message = 'conversation_not_found';
  end if;

  select coalesce((
    select preference.deleted_through_sequence
    from public.conversation_preferences preference
    where preference.conversation_id = p_conversation_id
      and preference.user_id = acting_user_id
      and preference.deleted_at is not null
  ), 0) into deleted_through;

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
    and message.sequence > deleted_through
    and (
      p_before_sequence is null
      or message.sequence < p_before_sequence
    )
  order by message.sequence desc
  limit p_result_limit;
end;
$$;

create or replace function public.search_my_conversations(
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
  left join public.conversation_preferences preference
    on preference.conversation_id = conversation.id and preference.user_id = acting_user_id
  where member.user_id = acting_user_id
    and (
      preference.deleted_at is null
      or conversation.last_sequence > preference.deleted_through_sequence
    )
    and not private.is_blocked_between(acting_user_id, peer.id)
    and (
      lower(coalesce(profile.display_name, '')) like '%' || normalized_query || '%'
      or lower(coalesce(profile.username, '')) like '%' || normalized_query || '%'
    )
  order by conversation.updated_at desc, conversation.id desc
  limit p_result_limit;
end;
$$;

create or replace function public.search_my_messages(
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
  left join public.conversation_preferences preference
    on preference.conversation_id = message.conversation_id
    and preference.user_id = acting_user_id
  where message.deleted_at is null
    and message.content is not null
    and message.sequence > case
      when preference.deleted_at is null then 0
      else coalesce(preference.deleted_through_sequence, 0)
    end
    and to_tsvector('simple', message.content) @@ plainto_tsquery('simple', normalized_query)
    and (
      p_before_created_at is null
      or (message.created_at, message.id) < (p_before_created_at, p_before_id)
    )
  order by message.created_at desc, message.id desc
  limit p_result_limit;
end;
$$;

create or replace function public.get_message_window(
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
  deleted_through bigint := 0;
begin
  if p_radius < 1 or p_radius > 50
    or not private.is_conversation_member(p_conversation_id, acting_user_id) then
    raise exception using errcode = 'P0001', message = 'conversation_not_found';
  end if;

  select coalesce((
    select preference.deleted_through_sequence
    from public.conversation_preferences preference
    where preference.conversation_id = p_conversation_id
      and preference.user_id = acting_user_id
      and preference.deleted_at is not null
  ), 0) into deleted_through;

  select message.sequence into target_sequence
  from public.messages message
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
    and message.sequence > deleted_through;
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
    and message.sequence > deleted_through
    and message.sequence between greatest(target_sequence - p_radius, 1)
      and target_sequence + p_radius
  order by message.sequence;
end;
$$;

revoke all on function public.delete_conversation_for_me(uuid)
  from public, anon, authenticated;
revoke all on function public.delete_ai_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_conversation_for_me(uuid) to authenticated;
grant execute on function public.delete_ai_conversation(uuid) to authenticated;
