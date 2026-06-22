-- Task 006: private, database-originated Realtime Broadcast events.
--
-- Realtime events are minimal invalidation hints. PostgreSQL remains the
-- authoritative source for every conversation, message, reaction, receipt,
-- and social state.

create function private.conversation_realtime_topic(target_conversation_id uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'conversation:' || target_conversation_id::text;
$$;

create function private.user_inbox_realtime_topic(target_user_id uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'user:' || target_user_id::text || ':inbox';
$$;

create function private.can_receive_council_realtime_topic(
  target_topic text,
  target_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  parsed_conversation_id uuid;
begin
  if target_topic is null or target_user_id is null then
    return false;
  end if;

  if target_topic = private.user_inbox_realtime_topic(target_user_id) then
    return true;
  end if;

  if target_topic !~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  parsed_conversation_id := substring(target_topic from 14)::uuid;
  return private.is_conversation_member(parsed_conversation_id, target_user_id);
exception
  when invalid_text_representation then
    return false;
end;
$$;

comment on function private.can_receive_council_realtime_topic(text, uuid) is
  'Fail-closed authorization for exact Council conversation and user inbox topics.';

create function private.send_council_realtime_event(
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
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  envelope jsonb;
begin
  if event_name not in (
    'message.created',
    'message.edited',
    'message.deleted',
    'reaction.changed',
    'receipt.changed',
    'messaging.availability_changed',
    'conversation.created',
    'conversation.changed'
  ) then
    raise exception using
      errcode = '22023',
      message = 'unsupported realtime event';
  end if;

  envelope := jsonb_strip_nulls(
    jsonb_build_object(
      'id', extensions.gen_random_uuid(),
      'version', 1,
      'event', event_name,
      'occurred_at', occurred_at,
      'conversation_id', target_conversation_id,
      'entity_id', target_entity_id,
      'sequence', target_sequence,
      'actor_user_id', target_actor_user_id,
      'last_sequence', target_last_sequence,
      'read_sequence', target_read_sequence,
      'delivered_sequence', target_delivered_sequence
    )
  );

  perform realtime.send(envelope, event_name, target_topic, true);
end;
$$;

create function private.send_conversation_inbox_event(
  target_conversation_id uuid,
  event_name text,
  occurred_at timestamptz,
  target_last_sequence bigint default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  participant_id uuid;
begin
  for participant_id in
    select member.user_id
    from public.conversation_members as member
    where member.conversation_id = target_conversation_id
    order by member.user_id
  loop
    perform private.send_council_realtime_event(
      private.user_inbox_realtime_topic(participant_id),
      event_name,
      occurred_at,
      target_conversation_id,
      null,
      null,
      null,
      target_last_sequence
    );
  end loop;
end;
$$;

create function private.emit_message_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_time timestamptz := clock_timestamp();
  event_name text;
  affects_preview boolean := false;
  current_last_sequence bigint;
  current_last_message_id uuid;
begin
  if tg_op = 'INSERT' then
    event_name := 'message.created';
    affects_preview := true;
  elsif old.deleted_at is distinct from new.deleted_at then
    event_name := 'message.deleted';
  elsif old.content is distinct from new.content
    or old.edited_at is distinct from new.edited_at then
    event_name := 'message.edited';
  else
    return new;
  end if;

  select conversation.last_sequence, conversation.last_message_id
  into current_last_sequence, current_last_message_id
  from public.conversations as conversation
  where conversation.id = new.conversation_id;

  affects_preview := affects_preview or current_last_message_id = new.id;

  perform private.send_council_realtime_event(
    private.conversation_realtime_topic(new.conversation_id),
    event_name,
    event_time,
    new.conversation_id,
    new.id,
    new.sequence,
    new.sender_user_id,
    current_last_sequence
  );

  if affects_preview then
    perform private.send_conversation_inbox_event(
      new.conversation_id,
      'conversation.changed',
      event_time,
      current_last_sequence
    );
  end if;

  return new;
end;
$$;

create trigger messages_emit_realtime
after insert or update of content, edited_at, deleted_at
on public.messages
for each row execute function private.emit_message_realtime_event();

create function private.emit_reaction_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_message_id uuid := coalesce(new.message_id, old.message_id);
  acting_user_id uuid := coalesce(new.user_id, old.user_id);
  target_conversation_id uuid;
  event_time timestamptz := clock_timestamp();
begin
  select message.conversation_id
  into target_conversation_id
  from public.messages as message
  where message.id = target_message_id;

  if target_conversation_id is not null then
    perform private.send_council_realtime_event(
      private.conversation_realtime_topic(target_conversation_id),
      'reaction.changed',
      event_time,
      target_conversation_id,
      target_message_id,
      null,
      acting_user_id
    );
  end if;

  return coalesce(new, old);
end;
$$;

create trigger message_reactions_emit_realtime
after insert or delete on public.message_reactions
for each row execute function private.emit_reaction_realtime_event();

create function private.emit_receipt_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.last_delivered_sequence = new.last_delivered_sequence
    and old.last_read_sequence = new.last_read_sequence then
    return new;
  end if;

  perform private.send_council_realtime_event(
    private.conversation_realtime_topic(new.conversation_id),
    'receipt.changed',
    clock_timestamp(),
    new.conversation_id,
    new.user_id,
    null,
    new.user_id,
    null,
    new.last_read_sequence,
    new.last_delivered_sequence
  );

  return new;
end;
$$;

create trigger conversation_members_emit_receipt_realtime
after update of last_delivered_sequence, last_read_sequence
on public.conversation_members
for each row execute function private.emit_receipt_realtime_event();

create function private.emit_conversation_created_realtime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_conversation_id uuid;
  participant_id uuid;
  event_time timestamptz;
begin
  for target_conversation_id in
    select distinct inserted.conversation_id
    from inserted_conversation_members as inserted
  loop
    if exists (
      select 1
      from public.direct_conversation_pairs as pair
      where pair.conversation_id = target_conversation_id
    )
    and (
      select count(*)
      from public.conversation_members as member
      where member.conversation_id = target_conversation_id
    ) = 2 then
      event_time := clock_timestamp();

      for participant_id in
        select member.user_id
        from public.conversation_members as member
        where member.conversation_id = target_conversation_id
        order by member.user_id
      loop
        perform private.send_council_realtime_event(
          private.user_inbox_realtime_topic(participant_id),
          'conversation.created',
          event_time,
          target_conversation_id
        );
      end loop;
    end if;
  end loop;

  return null;
end;
$$;

create trigger conversation_members_emit_created_realtime
after insert on public.conversation_members
referencing new table as inserted_conversation_members
for each statement execute function private.emit_conversation_created_realtime();

create function private.emit_messaging_availability_changed(
  user_a uuid,
  user_b uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  target_conversation_id uuid;
  event_time timestamptz;
begin
  select pair.conversation_id
  into target_conversation_id
  from public.direct_conversation_pairs as pair
  where pair.user_low_id = least(user_a, user_b)
    and pair.user_high_id = greatest(user_a, user_b);

  if target_conversation_id is null then
    return;
  end if;

  event_time := clock_timestamp();
  perform private.send_council_realtime_event(
    private.conversation_realtime_topic(target_conversation_id),
    'messaging.availability_changed',
    event_time,
    target_conversation_id
  );
  perform private.send_conversation_inbox_event(
    target_conversation_id,
    'messaging.availability_changed',
    event_time
  );
end;
$$;

create function private.emit_relationship_availability_realtime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_available boolean := tg_op <> 'INSERT' and old.status = 'accepted';
  new_available boolean := tg_op <> 'DELETE' and new.status = 'accepted';
begin
  -- block_user inserts the block before deleting the accepted relationship.
  -- The block trigger is the single emission point for that logical action.
  if tg_op = 'DELETE'
    and private.is_blocked_between(old.user_low_id, old.user_high_id) then
    return old;
  end if;

  if old_available is distinct from new_available then
    perform private.emit_messaging_availability_changed(
      coalesce(new.user_low_id, old.user_low_id),
      coalesce(new.user_high_id, old.user_high_id)
    );
  end if;

  return coalesce(new, old);
end;
$$;

create trigger contact_relationships_emit_availability_realtime
after insert or update of status or delete
on public.contact_relationships
for each row execute function private.emit_relationship_availability_realtime();

create function private.emit_block_availability_realtime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.emit_messaging_availability_changed(
    coalesce(new.blocker_id, old.blocker_id),
    coalesce(new.blocked_id, old.blocked_id)
  );
  return coalesce(new, old);
end;
$$;

create trigger user_blocks_emit_availability_realtime
after insert or delete on public.user_blocks
for each row execute function private.emit_block_availability_realtime();

revoke all on function private.conversation_realtime_topic(uuid)
  from public, anon, authenticated;
revoke all on function private.user_inbox_realtime_topic(uuid)
  from public, anon, authenticated;
revoke all on function private.can_receive_council_realtime_topic(text, uuid)
  from public, anon, authenticated;
revoke all on function private.send_council_realtime_event(
  text, text, timestamptz, uuid, uuid, bigint, uuid, bigint, bigint, bigint
) from public, anon, authenticated;
revoke all on function private.send_conversation_inbox_event(
  uuid, text, timestamptz, bigint
) from public, anon, authenticated;
revoke all on function private.emit_message_realtime_event()
  from public, anon, authenticated;
revoke all on function private.emit_reaction_realtime_event()
  from public, anon, authenticated;
revoke all on function private.emit_receipt_realtime_event()
  from public, anon, authenticated;
revoke all on function private.emit_conversation_created_realtime()
  from public, anon, authenticated;
revoke all on function private.emit_messaging_availability_changed(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.emit_relationship_availability_realtime()
  from public, anon, authenticated;
revoke all on function private.emit_block_availability_realtime()
  from public, anon, authenticated;

grant execute on function private.can_receive_council_realtime_topic(text, uuid)
  to authenticated;

revoke insert, update on table realtime.messages from anon, authenticated;
revoke select on table realtime.messages from anon;
grant select on table realtime.messages to authenticated;

create policy council_private_topics_select
on realtime.messages
for select
to authenticated
using (
  private.can_receive_council_realtime_topic(
    realtime.topic(),
    auth.uid()
  )
);

comment on policy council_private_topics_select on realtime.messages is
  'Allows private Council conversation topics to stored members and user inbox topics only to their authenticated owner. No browser broadcast insert policy exists.';
