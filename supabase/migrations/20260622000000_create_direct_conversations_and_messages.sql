-- Task 005: direct human conversations and text-message persistence.
--
-- Browser clients receive read-only table grants filtered by RLS. Every
-- mutation is performed through an authenticated security-definer function.

create table public.conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  type text not null default 'direct',
  created_by uuid not null references auth.users (id) on delete cascade,
  last_sequence bigint not null default 0,
  last_message_id uuid null,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_type_check check (type = 'direct'),
  constraint conversations_last_sequence_check check (last_sequence >= 0)
);

create table public.direct_conversation_pairs (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  user_low_id uuid not null references auth.users (id) on delete cascade,
  user_high_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint direct_conversation_pairs_canonical_check check (user_low_id < user_high_id),
  constraint direct_conversation_pairs_unique_pair unique (user_low_id, user_high_id)
);

comment on constraint direct_conversation_pairs_canonical_check
on public.direct_conversation_pairs is
  'A direct human pair is stored once with the lower UUID first; self-pairs are impossible.';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_delivered_sequence bigint not null default 0,
  last_read_sequence bigint not null default 0,
  primary key (conversation_id, user_id),
  constraint conversation_members_receipts_nonnegative_check check (
    last_delivered_sequence >= 0 and last_read_sequence >= 0
  ),
  constraint conversation_members_read_not_ahead_of_delivered_check check (
    last_read_sequence <= last_delivered_sequence
  )
);

create table public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sequence bigint not null,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  client_message_id uuid not null,
  content text null,
  reply_to_message_id uuid null references public.messages (id) on delete restrict,
  idempotency_payload_hash text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  deleted_at timestamptz null,
  constraint messages_sequence_positive_check check (sequence > 0),
  constraint messages_conversation_sequence_key unique (conversation_id, sequence),
  constraint messages_conversation_sender_client_key unique (
    conversation_id,
    sender_user_id,
    client_message_id
  ),
  constraint messages_sender_client_key unique (sender_user_id, client_message_id),
  constraint messages_content_length_check check (
    content is null or char_length(content) <= 8000
  ),
  constraint messages_content_tombstone_check check (
    (
      deleted_at is null
      and content is not null
      and char_length(btrim(content)) > 0
    )
    or (
      deleted_at is not null
      and content is null
    )
  ),
  constraint messages_edited_before_deleted_check check (
    edited_at is null or deleted_at is null or edited_at <= deleted_at
  )
);

comment on column public.messages.idempotency_payload_hash is
  'Server-generated SHA-256 of the original normalized send payload. It preserves retry conflict detection after message content is cleared by deletion and is never returned to clients.';

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint message_reactions_emoji_check check (
    char_length(btrim(emoji)) between 1 and 32
  )
);

create index conversation_members_user_conversation_idx
  on public.conversation_members (user_id, conversation_id);

create index conversations_activity_idx
  on public.conversations (updated_at desc, id desc);

create index messages_conversation_sequence_idx
  on public.messages (conversation_id, sequence desc);

create index messages_sender_client_lookup_idx
  on public.messages (sender_user_id, client_message_id);

create index message_reactions_message_order_idx
  on public.message_reactions (message_id, emoji, user_id);

create index conversation_members_user_read_state_idx
  on public.conversation_members (
    user_id,
    last_read_sequence,
    last_delivered_sequence
  );

create function private.validate_direct_conversation_pair()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.conversations as conversation
    where conversation.id = new.conversation_id
      and conversation.type = 'direct'
  ) then
    raise exception using
      errcode = '23514',
      message = 'direct conversation pair requires a direct conversation';
  end if;

  return new;
end;
$$;

create trigger direct_conversation_pairs_validate_conversation
before insert or update on public.direct_conversation_pairs
for each row execute function private.validate_direct_conversation_pair();

create function private.delete_conversation_after_direct_pair()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.conversations as conversation
  where conversation.id = old.conversation_id;

  return old;
end;
$$;

create trigger direct_conversation_pairs_delete_conversation
after delete on public.direct_conversation_pairs
for each row execute function private.delete_conversation_after_direct_pair();

create function private.validate_conversation_member()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  conversation_last_sequence bigint;
begin
  if not exists (
    select 1
    from public.direct_conversation_pairs as pair
    where pair.conversation_id = new.conversation_id
      and new.user_id in (pair.user_low_id, pair.user_high_id)
  ) then
    raise exception using
      errcode = '23514',
      message = 'direct conversation member must belong to the canonical pair';
  end if;

  select conversation.last_sequence
  into conversation_last_sequence
  from public.conversations as conversation
  where conversation.id = new.conversation_id;

  if new.last_delivered_sequence > conversation_last_sequence
    or new.last_read_sequence > conversation_last_sequence then
    raise exception using
      errcode = '23514',
      message = 'conversation receipt sequence exceeds current conversation sequence';
  end if;

  return new;
end;
$$;

create trigger conversation_members_validate_pair_and_receipts
before insert or update on public.conversation_members
for each row execute function private.validate_conversation_member();

create function private.validate_message_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.conversation_members as member
    where member.conversation_id = new.conversation_id
      and member.user_id = new.sender_user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'message sender must be a conversation member';
  end if;

  if new.reply_to_message_id is not null
    and not exists (
      select 1
      from public.messages as reply
      where reply.id = new.reply_to_message_id
        and reply.conversation_id = new.conversation_id
    ) then
    raise exception using
      errcode = '23514',
      message = 'reply target must belong to the same conversation';
  end if;

  return new;
end;
$$;

create trigger messages_validate_membership_and_reply
before insert or update of conversation_id, sender_user_id, reply_to_message_id
on public.messages
for each row execute function private.validate_message_row();

create function private.is_conversation_member(
  target_conversation_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_members as member
    where member.conversation_id = target_conversation_id
      and member.user_id = target_user_id
  );
$$;

create function private.is_current_user_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and private.is_conversation_member(target_conversation_id, auth.uid());
$$;

create function private.get_direct_conversation_peer(
  target_conversation_id uuid,
  target_user_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when pair.user_low_id = target_user_id then pair.user_high_id
    when pair.user_high_id = target_user_id then pair.user_low_id
    else null
  end
  from public.direct_conversation_pairs as pair
  where pair.conversation_id = target_conversation_id;
$$;

create function private.can_pair_message(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    user_a is not null
    and user_b is not null
    and user_a <> user_b
    and private.are_contacts(user_a, user_b)
    and not private.is_blocked_between(user_a, user_b);
$$;

create function private.can_send_in_conversation(
  target_conversation_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversations as conversation
    join public.direct_conversation_pairs as pair
      on pair.conversation_id = conversation.id
    join public.conversation_members as member
      on member.conversation_id = conversation.id
      and member.user_id = target_user_id
    where conversation.id = target_conversation_id
      and conversation.type = 'direct'
      and private.can_pair_message(pair.user_low_id, pair.user_high_id)
  );
$$;

revoke all on function private.validate_direct_conversation_pair()
  from public, anon, authenticated;
revoke all on function private.delete_conversation_after_direct_pair()
  from public, anon, authenticated;
revoke all on function private.validate_conversation_member()
  from public, anon, authenticated;
revoke all on function private.validate_message_row()
  from public, anon, authenticated;
revoke all on function private.is_conversation_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.is_current_user_conversation_member(uuid)
  from public, anon, authenticated;
revoke all on function private.get_direct_conversation_peer(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_pair_message(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_send_in_conversation(uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.is_current_user_conversation_member(uuid)
  to authenticated;

alter table public.conversations enable row level security;
alter table public.direct_conversation_pairs enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

create policy conversations_select_member
on public.conversations
for select
to authenticated
using (private.is_current_user_conversation_member(id));

create policy direct_conversation_pairs_select_member
on public.direct_conversation_pairs
for select
to authenticated
using (private.is_current_user_conversation_member(conversation_id));

create policy conversation_members_select_conversation_member
on public.conversation_members
for select
to authenticated
using (private.is_current_user_conversation_member(conversation_id));

create policy messages_select_conversation_member
on public.messages
for select
to authenticated
using (private.is_current_user_conversation_member(conversation_id));

create policy message_reactions_select_conversation_member
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and private.is_current_user_conversation_member(message.conversation_id)
  )
);

create function public.create_or_get_direct_conversation(target_user_id uuid)
returns table (
  conversation_id uuid,
  conversation_type text,
  created_at timestamptz,
  updated_at timestamptz,
  can_send boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  pair_low_id uuid;
  pair_high_id uuid;
  selected_conversation public.conversations;
begin
  if target_user_id is null
    or target_user_id = acting_user_id
    or not exists (
      select 1 from auth.users as target where target.id = target_user_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'conversation_unavailable';
  end if;

  pair_low_id := least(acting_user_id, target_user_id);
  pair_high_id := greatest(acting_user_id, target_user_id);
  perform private.lock_social_pair(pair_low_id, pair_high_id);

  if not private.can_pair_message(pair_low_id, pair_high_id) then
    raise exception using
      errcode = 'P0001',
      message = 'conversation_unavailable';
  end if;

  select conversation.*
  into selected_conversation
  from public.direct_conversation_pairs as pair
  join public.conversations as conversation
    on conversation.id = pair.conversation_id
  where pair.user_low_id = pair_low_id
    and pair.user_high_id = pair_high_id;

  if not found then
    insert into public.conversations (type, created_by)
    values ('direct', acting_user_id)
    returning conversations.* into selected_conversation;

    insert into public.direct_conversation_pairs (
      conversation_id,
      user_low_id,
      user_high_id
    )
    values (
      selected_conversation.id,
      pair_low_id,
      pair_high_id
    );

    insert into public.conversation_members (conversation_id, user_id)
    values
      (selected_conversation.id, pair_low_id),
      (selected_conversation.id, pair_high_id);
  end if;

  return query
  select
    selected_conversation.id,
    selected_conversation.type,
    selected_conversation.created_at,
    selected_conversation.updated_at,
    true;
end;
$$;

comment on function public.create_or_get_direct_conversation(uuid) is
  'Creates at most one direct conversation for an accepted, unblocked canonical pair. Pair locking makes reciprocal calls idempotent.';

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
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if result_limit is null or result_limit < 1 or result_limit > 50 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_cursor';
  end if;

  if (cursor_updated_at is null) <> (cursor_id is null) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_cursor';
  end if;

  return query
  select
    conversation.id,
    conversation.type,
    peer.id,
    case when private.can_view_profile(peer.id) then profile.username else null end,
    case when private.can_view_profile(peer.id) then profile.display_name else null end,
    case when private.can_view_profile(peer.id) then profile.avatar_path else null end,
    case when private.can_view_profile(peer.id) then profile.status_text else null end,
    last_message.id,
    case when last_message.deleted_at is null then last_message.content else null end,
    coalesce(last_message.deleted_at is not null, false),
    last_message.sender_user_id,
    conversation.last_sequence,
    conversation.last_message_at,
    member.last_read_sequence,
    member.last_delivered_sequence,
    greatest(conversation.last_sequence - member.last_read_sequence, 0),
    private.can_pair_message(pair.user_low_id, pair.user_high_id),
    conversation.updated_at
  from public.conversation_members as member
  join public.conversations as conversation
    on conversation.id = member.conversation_id
  join public.direct_conversation_pairs as pair
    on pair.conversation_id = conversation.id
  cross join lateral (
    select private.get_direct_conversation_peer(conversation.id, acting_user_id) as id
  ) as peer
  left join public.profiles as profile
    on profile.id = peer.id
  left join public.messages as last_message
    on last_message.id = conversation.last_message_id
  where member.user_id = acting_user_id
    and (
      cursor_updated_at is null
      or (conversation.updated_at, conversation.id) < (cursor_updated_at, cursor_id)
    )
  order by conversation.updated_at desc, conversation.id desc
  limit result_limit;
end;
$$;

comment on function public.list_my_conversations(integer, timestamptz, uuid) is
  'Returns a bounded member-only direct-conversation page ordered by (updated_at, id) descending. Profile fields become null when normal profile visibility is unavailable.';

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
  reactions jsonb
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
    raise exception using
      errcode = 'P0001',
      message = 'invalid_cursor';
  end if;

  if not private.is_conversation_member(p_conversation_id, acting_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'conversation_not_found';
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
    )
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
  'Returns newest-first message pages. Deleted rows remain content-free tombstones and reactions use deterministic emoji/user ordering.';

create function public.send_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_content text,
  p_reply_to_message_id uuid default null
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
  reactions jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_content text := btrim(p_content);
  payload_hash text;
  existing_message public.messages;
  inserted_message public.messages;
  next_sequence bigint;
  activity_at timestamptz := clock_timestamp();
begin
  if p_client_message_id is null
    or normalized_content is null
    or normalized_content = ''
    or char_length(normalized_content) > 8000 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_message_content';
  end if;

  payload_hash := encode(
    extensions.digest(
      p_conversation_id::text
      || chr(31)
      || p_client_message_id::text
      || chr(31)
      || normalized_content
      || chr(31)
      || coalesce(p_reply_to_message_id::text, ''),
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
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
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
      '[]'::jsonb;
    return;
  end if;

  if not private.can_send_in_conversation(p_conversation_id, acting_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'messaging_unavailable';
  end if;

  if p_reply_to_message_id is not null
    and not exists (
      select 1
      from public.messages as reply
      where reply.id = p_reply_to_message_id
        and reply.conversation_id = p_conversation_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_reply';
  end if;

  update public.conversations as conversation
  set
    last_sequence = conversation.last_sequence + 1,
    last_message_at = activity_at,
    updated_at = activity_at
  where conversation.id = p_conversation_id
  returning conversation.last_sequence into next_sequence;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'messaging_unavailable';
  end if;

  insert into public.messages (
    conversation_id,
    sequence,
    sender_user_id,
    client_message_id,
    content,
    reply_to_message_id,
    idempotency_payload_hash,
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
    activity_at
  )
  returning messages.* into inserted_message;

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
    '[]'::jsonb;
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
        '[]'::jsonb;
      return;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'idempotency_conflict';
end;
$$;

comment on function public.send_message(uuid, uuid, text, uuid) is
  'Sends normalized text as auth.uid(), serializes sequence allocation on the conversation row, and returns the original row for an identical idempotent retry.';

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
  reactions jsonb
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
    raise exception using
      errcode = 'P0001',
      message = 'invalid_message_content';
  end if;

  select message.*
  into selected_message
  from public.messages as message
  where message.id = p_message_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'message_not_found';
  end if;

  if not private.is_conversation_member(
    selected_message.conversation_id,
    acting_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'message_not_found';
  end if;

  if selected_message.sender_user_id <> acting_user_id
    or selected_message.deleted_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'message_not_editable';
  end if;

  if not private.can_send_in_conversation(
    selected_message.conversation_id,
    acting_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'messaging_unavailable';
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
    );
end;
$$;

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
  reactions jsonb
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
    raise exception using
      errcode = 'P0001',
      message = 'message_not_found';
  end if;

  if not private.is_conversation_member(
    selected_message.conversation_id,
    acting_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'message_not_found';
  end if;

  if selected_message.sender_user_id <> acting_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'action_not_permitted';
  end if;

  if selected_message.deleted_at is null then
    delete from public.message_reactions as reaction
    where reaction.message_id = selected_message.id;

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
    '[]'::jsonb;
end;
$$;

create function public.add_message_reaction(p_message_id uuid, p_emoji text)
returns table (
  message_id uuid,
  user_id uuid,
  emoji text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_emoji text := btrim(p_emoji);
  target_message public.messages;
  selected_reaction public.message_reactions;
begin
  if normalized_emoji is null
    or normalized_emoji = ''
    or char_length(normalized_emoji) > 32 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_reaction';
  end if;

  select message.*
  into target_message
  from public.messages as message
  where message.id = p_message_id;

  if not found
    or target_message.deleted_at is not null
    or not private.can_send_in_conversation(
      target_message.conversation_id,
      acting_user_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'messaging_unavailable';
  end if;

  insert into public.message_reactions (
    message_id,
    user_id,
    emoji
  )
  values (
    target_message.id,
    acting_user_id,
    normalized_emoji
  )
  on conflict on constraint message_reactions_pkey
  do update set emoji = excluded.emoji
  returning message_reactions.* into selected_reaction;

  return query
  select
    selected_reaction.message_id,
    selected_reaction.user_id,
    selected_reaction.emoji,
    selected_reaction.created_at;
end;
$$;

create function public.remove_message_reaction(p_message_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_emoji text := btrim(p_emoji);
  target_conversation_id uuid;
begin
  if normalized_emoji is null
    or normalized_emoji = ''
    or char_length(normalized_emoji) > 32 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_reaction';
  end if;

  select message.conversation_id
  into target_conversation_id
  from public.messages as message
  where message.id = p_message_id;

  if not found
    or not private.is_conversation_member(target_conversation_id, acting_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'message_not_found';
  end if;

  delete from public.message_reactions as reaction
  where reaction.message_id = p_message_id
    and reaction.user_id = acting_user_id
    and reaction.emoji = normalized_emoji;

  return true;
end;
$$;

create function public.mark_conversation_delivered(
  p_conversation_id uuid,
  p_through_sequence bigint
)
returns table (
  conversation_id uuid,
  last_delivered_sequence bigint,
  last_read_sequence bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  conversation_last_sequence bigint;
  selected_member public.conversation_members;
begin
  if p_through_sequence is null or p_through_sequence < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_sequence';
  end if;

  select conversation.last_sequence
  into conversation_last_sequence
  from public.conversations as conversation
  where conversation.id = p_conversation_id
    and private.is_conversation_member(conversation.id, acting_user_id)
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'conversation_not_found';
  end if;

  if p_through_sequence > conversation_last_sequence then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_sequence';
  end if;

  update public.conversation_members as member
  set last_delivered_sequence = greatest(
    member.last_delivered_sequence,
    p_through_sequence
  )
  where member.conversation_id = p_conversation_id
    and member.user_id = acting_user_id
  returning member.* into selected_member;

  return query
  select
    selected_member.conversation_id,
    selected_member.last_delivered_sequence,
    selected_member.last_read_sequence;
end;
$$;

create function public.mark_conversation_read(
  p_conversation_id uuid,
  p_through_sequence bigint
)
returns table (
  conversation_id uuid,
  last_delivered_sequence bigint,
  last_read_sequence bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  conversation_last_sequence bigint;
  selected_member public.conversation_members;
begin
  if p_through_sequence is null or p_through_sequence < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_sequence';
  end if;

  select conversation.last_sequence
  into conversation_last_sequence
  from public.conversations as conversation
  where conversation.id = p_conversation_id
    and private.is_conversation_member(conversation.id, acting_user_id)
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'conversation_not_found';
  end if;

  if p_through_sequence > conversation_last_sequence then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_sequence';
  end if;

  update public.conversation_members as member
  set
    last_delivered_sequence = greatest(
      member.last_delivered_sequence,
      p_through_sequence
    ),
    last_read_sequence = greatest(
      member.last_read_sequence,
      p_through_sequence
  )
  where member.conversation_id = p_conversation_id
    and member.user_id = acting_user_id
  returning member.* into selected_member;

  return query
  select
    selected_member.conversation_id,
    selected_member.last_delivered_sequence,
    selected_member.last_read_sequence;
end;
$$;

comment on function public.mark_conversation_delivered(uuid, bigint) is
  'Monotonically advances only the authenticated member delivery sequence and rejects values beyond the current conversation sequence.';
comment on function public.mark_conversation_read(uuid, bigint) is
  'Monotonically advances only the authenticated member read sequence and delivery sequence, bounded by the current conversation sequence.';

revoke all on table public.conversations from public, anon, authenticated;
revoke all on table public.direct_conversation_pairs from public, anon, authenticated;
revoke all on table public.conversation_members from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;
revoke all on table public.message_reactions from public, anon, authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.direct_conversation_pairs to authenticated;
grant select on table public.conversation_members to authenticated;
grant select on table public.messages to authenticated;
grant select on table public.message_reactions to authenticated;

revoke all on function public.create_or_get_direct_conversation(uuid)
  from public, anon, authenticated;
revoke all on function public.list_my_conversations(integer, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.list_conversation_messages(uuid, bigint, integer)
  from public, anon, authenticated;
revoke all on function public.send_message(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.edit_message(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_message(uuid)
  from public, anon, authenticated;
revoke all on function public.add_message_reaction(uuid, text)
  from public, anon, authenticated;
revoke all on function public.remove_message_reaction(uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_conversation_delivered(uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.create_or_get_direct_conversation(uuid)
  to authenticated;
grant execute on function public.list_my_conversations(integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.list_conversation_messages(uuid, bigint, integer)
  to authenticated;
grant execute on function public.send_message(uuid, uuid, text, uuid)
  to authenticated;
grant execute on function public.edit_message(uuid, text)
  to authenticated;
grant execute on function public.delete_message(uuid)
  to authenticated;
grant execute on function public.add_message_reaction(uuid, text)
  to authenticated;
grant execute on function public.remove_message_reaction(uuid, text)
  to authenticated;
grant execute on function public.mark_conversation_delivered(uuid, bigint)
  to authenticated;
grant execute on function public.mark_conversation_read(uuid, bigint)
  to authenticated;
