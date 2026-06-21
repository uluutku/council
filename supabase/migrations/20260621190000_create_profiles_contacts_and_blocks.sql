create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text null,
  display_name text null,
  bio text null,
  avatar_path text null,
  status_text text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format_check check (
    username is null
    or (
      username = lower(username)
      and char_length(username) between 3 and 24
      and username ~ '^[a-z0-9][a-z0-9_]{2,23}$'
    )
  ),
  constraint profiles_display_name_length_check check (
    display_name is null or char_length(display_name) <= 60
  ),
  constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 300),
  constraint profiles_status_text_length_check check (
    status_text is null or char_length(status_text) <= 120
  ),
  constraint profiles_avatar_path_length_check check (
    avatar_path is null or char_length(avatar_path) <= 512
  ),
  constraint profiles_avatar_path_relative_check check (
    avatar_path is null
    or (
      avatar_path !~ '^[\\/]'
      and avatar_path !~* '^[a-z][a-z0-9+.-]*:'
      and avatar_path !~ '(^|[\\/])\.\.([\\/]|$)'
      and avatar_path !~ '[[:cntrl:]]'
    )
  ),
  constraint profiles_username_key unique (username)
);

comment on constraint profiles_avatar_path_relative_check on public.profiles is
  'Avatar values are private Storage-relative paths, never remote URLs, absolute paths, or parent traversals.';

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system',
  notification_preferences jsonb not null default jsonb_build_object(
    'message_notifications', true,
    'message_previews', false,
    'sound', true
  ),
  privacy_preferences jsonb not null default jsonb_build_object(
    'show_online_status', true,
    'show_last_seen', true,
    'allow_contact_requests', true
  ),
  ai_preferences jsonb not null default jsonb_build_object(
    'trial_disclosure_seen', false
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_check check (theme in ('system', 'light', 'dark')),
  constraint user_settings_notification_preferences_object_check check (
    jsonb_typeof(notification_preferences) = 'object'
  ),
  constraint user_settings_privacy_preferences_object_check check (
    jsonb_typeof(privacy_preferences) = 'object'
  ),
  constraint user_settings_ai_preferences_object_check check (
    jsonb_typeof(ai_preferences) = 'object'
  )
);

create table public.contact_relationships (
  id uuid primary key default extensions.gen_random_uuid(),
  user_low_id uuid not null references auth.users (id) on delete cascade,
  user_high_id uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint contact_relationships_canonical_pair_check check (user_low_id < user_high_id),
  constraint contact_relationships_requested_by_participant_check check (
    requested_by in (user_low_id, user_high_id)
  ),
  constraint contact_relationships_status_check check (
    status in ('pending', 'accepted', 'rejected')
  ),
  constraint contact_relationships_response_time_check check (
    (status = 'pending' and responded_at is null)
    or (status in ('accepted', 'rejected') and responded_at is not null)
  ),
  constraint contact_relationships_pair_key unique (user_low_id, user_high_id)
);

comment on constraint contact_relationships_canonical_pair_check on public.contact_relationships is
  'Each unordered user pair is stored once, with the lower UUID first.';

comment on constraint contact_relationships_response_time_check on public.contact_relationships is
  'Pending requests have no response time; accepted and rejected requests must record one.';

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self_check check (blocker_id <> blocked_id)
);

create index profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops)
  where username is not null;

create index profiles_display_name_trgm_idx
  on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops)
  where display_name is not null;

create index contact_relationships_low_status_idx
  on public.contact_relationships (user_low_id, status);

create index contact_relationships_high_status_idx
  on public.contact_relationships (user_high_id, status);

create index contact_relationships_requested_by_idx
  on public.contact_relationships (requested_by, status);

create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.normalize_profile_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.username := nullif(lower(btrim(new.username)), '');
  new.display_name := nullif(btrim(new.display_name), '');
  new.bio := nullif(btrim(new.bio), '');
  new.avatar_path := nullif(btrim(new.avatar_path), '');
  new.status_text := nullif(btrim(new.status_text), '');
  return new;
end;
$$;

create trigger profiles_normalize_fields
before insert or update of username, display_name, bio, avatar_path, status_text
on public.profiles
for each row execute function private.normalize_profile_fields();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function private.touch_updated_at();

create trigger contact_relationships_touch_updated_at
before update on public.contact_relationships
for each row execute function private.touch_updated_at();

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.profiles (id)
select auth.users.id
from auth.users
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select auth.users.id
from auth.users
on conflict (user_id) do nothing;

create function private.require_authenticated()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := auth.uid();
begin
  if acting_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  return acting_user_id;
end;
$$;

create function private.is_blocked_between(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_blocks
    where
      (user_blocks.blocker_id = user_a and user_blocks.blocked_id = user_b)
      or (user_blocks.blocker_id = user_b and user_blocks.blocked_id = user_a)
  );
$$;

create function private.are_contacts(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.contact_relationships
    where contact_relationships.user_low_id = least(user_a, user_b)
      and contact_relationships.user_high_id = greatest(user_a, user_b)
      and contact_relationships.status = 'accepted'
  );
$$;

create function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and (
      auth.uid() = target_user_id
      or (
        not private.is_blocked_between(auth.uid(), target_user_id)
        and exists (
          select 1
          from public.contact_relationships
          where contact_relationships.user_low_id = least(auth.uid(), target_user_id)
            and contact_relationships.user_high_id = greatest(auth.uid(), target_user_id)
            and contact_relationships.status in ('pending', 'accepted')
        )
      )
    );
$$;

create function private.lock_social_pair(user_a uuid, user_b uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(
    hashtextextended(least(user_a, user_b)::text || ':' || greatest(user_a, user_b)::text, 0)
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.contact_relationships enable row level security;
alter table public.user_blocks enable row level security;

create policy profiles_select_visible
on public.profiles
for select
to authenticated
using (private.can_view_profile(id));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy user_settings_select_own
on public.user_settings
for select
to authenticated
using (user_id = auth.uid());

create policy user_settings_update_own
on public.user_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy contact_relationships_select_participant
on public.contact_relationships
for select
to authenticated
using (auth.uid() in (user_low_id, user_high_id));

create policy user_blocks_select_own
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

create function public.set_my_profile(
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

comment on function public.set_my_profile(text, text, text, text, text) is
  'Updates only the authenticated user profile. Identity is always derived from auth.uid().';

create function public.search_profiles(query text, result_limit integer default 20)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  status_text text,
  relationship_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  normalized_query text := lower(btrim($1));
begin
  if char_length(normalized_query) < 2 then
    raise exception using
      errcode = '22023',
      message = 'profile search query must contain at least 2 characters';
  end if;

  if char_length(normalized_query) > 100 then
    raise exception using
      errcode = '22023',
      message = 'profile search query is too long';
  end if;

  if $2 is null or $2 < 1 or $2 > 25 then
    raise exception using
      errcode = '22023',
      message = 'profile search result limit must be between 1 and 25';
  end if;

  return query
  select
    profiles.id,
    profiles.username,
    profiles.display_name,
    profiles.avatar_path,
    profiles.status_text,
    contact_relationships.status
  from public.profiles
  left join public.contact_relationships
    on contact_relationships.user_low_id = least(acting_user_id, profiles.id)
    and contact_relationships.user_high_id = greatest(acting_user_id, profiles.id)
  left join public.user_settings
    on user_settings.user_id = profiles.id
  where profiles.id <> acting_user_id
    and profiles.username is not null
    and not private.is_blocked_between(acting_user_id, profiles.id)
    and (
      contact_relationships.id is not null
      or coalesce(
        user_settings.privacy_preferences -> 'allow_contact_requests' = 'true'::jsonb,
        false
      )
    )
    and (
      position(normalized_query in profiles.username) > 0
      or position(normalized_query in lower(coalesce(profiles.display_name, ''))) > 0
    )
  order by
    case
      when profiles.username = normalized_query then 0
      when left(profiles.username, char_length(normalized_query)) = normalized_query then 1
      when left(lower(coalesce(profiles.display_name, '')), char_length(normalized_query)) =
        normalized_query then 2
      else 3
    end,
    profiles.username,
    profiles.id
  limit $2;
end;
$$;

comment on function public.search_profiles(text, integer) is
  'Bounded authenticated discovery returning minimal public fields; direct profile table access is more restrictive.';

create function public.send_contact_request(target_user_id uuid)
returns public.contact_relationships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  pair_low_id uuid;
  pair_high_id uuid;
  target_allows_requests boolean;
  relationship public.contact_relationships;
begin
  if $1 is null or $1 = acting_user_id then
    raise exception using
      errcode = '22023',
      message = 'a contact request must target another user';
  end if;

  if not exists (select 1 from auth.users where auth.users.id = $1) then
    raise exception using
      errcode = 'P0002',
      message = 'target user not found';
  end if;

  pair_low_id := least(acting_user_id, $1);
  pair_high_id := greatest(acting_user_id, $1);
  perform private.lock_social_pair(pair_low_id, pair_high_id);

  if private.is_blocked_between(acting_user_id, $1) then
    raise exception using
      errcode = '42501',
      message = 'contact request is not allowed';
  end if;

  select contact_relationships.*
  into relationship
  from public.contact_relationships
  where contact_relationships.user_low_id = pair_low_id
    and contact_relationships.user_high_id = pair_high_id
  for update;

  if found then
    if relationship.status = 'accepted' then
      return relationship;
    end if;

    if relationship.status = 'pending' and relationship.requested_by = acting_user_id then
      return relationship;
    end if;

    if relationship.status = 'pending' and relationship.requested_by = $1 then
      update public.contact_relationships
      set
        status = 'accepted',
        responded_at = now()
      where contact_relationships.id = relationship.id
      returning contact_relationships.* into relationship;

      return relationship;
    end if;

    update public.contact_relationships
    set
      requested_by = acting_user_id,
      status = 'pending',
      created_at = now(),
      responded_at = null
    where contact_relationships.id = relationship.id
    returning contact_relationships.* into relationship;

    return relationship;
  end if;

  select coalesce(
    user_settings.privacy_preferences -> 'allow_contact_requests' = 'true'::jsonb,
    false
  )
  into target_allows_requests
  from public.user_settings
  where user_settings.user_id = $1;

  if not coalesce(target_allows_requests, false) then
    raise exception using
      errcode = '42501',
      message = 'target user does not allow contact requests';
  end if;

  insert into public.contact_relationships (
    user_low_id,
    user_high_id,
    requested_by,
    status
  )
  values (
    pair_low_id,
    pair_high_id,
    acting_user_id,
    'pending'
  )
  returning contact_relationships.* into relationship;

  return relationship;
end;
$$;

comment on function public.send_contact_request(uuid) is
  'Creates an idempotent canonical request, automatically accepting a reciprocal pending request. Rejected pairs may be requested again.';

create function public.respond_contact_request(relationship_id uuid, response text)
returns public.contact_relationships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  relationship public.contact_relationships;
  pair_low_id uuid;
  pair_high_id uuid;
begin
  if $2 not in ('accepted', 'rejected') then
    raise exception using
      errcode = '22023',
      message = 'response must be accepted or rejected';
  end if;

  select
    contact_relationships.user_low_id,
    contact_relationships.user_high_id
  into pair_low_id, pair_high_id
  from public.contact_relationships
  where contact_relationships.id = $1;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'contact request not found';
  end if;

  perform private.lock_social_pair(pair_low_id, pair_high_id);

  select contact_relationships.*
  into relationship
  from public.contact_relationships
  where contact_relationships.id = $1
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'contact request not found';
  end if;

  if acting_user_id not in (relationship.user_low_id, relationship.user_high_id) then
    raise exception using
      errcode = '42501',
      message = 'only a request participant may respond';
  end if;

  if relationship.requested_by = acting_user_id then
    raise exception using
      errcode = '42501',
      message = 'the requester cannot respond to their own request';
  end if;

  if relationship.status <> 'pending' then
    raise exception using
      errcode = '22023',
      message = 'only pending contact requests can be answered';
  end if;

  if private.is_blocked_between(relationship.user_low_id, relationship.user_high_id) then
    raise exception using
      errcode = '42501',
      message = 'contact request is not available';
  end if;

  update public.contact_relationships
  set
    status = $2,
    responded_at = now()
  where contact_relationships.id = relationship.id
  returning contact_relationships.* into relationship;

  return relationship;
end;
$$;

comment on function public.respond_contact_request(uuid, text) is
  'Allows only the receiving participant to accept or reject a pending contact request.';

create function public.remove_contact(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  removed_count integer;
begin
  if $1 is null or $1 = acting_user_id then
    raise exception using
      errcode = '22023',
      message = 'a contact removal must target another user';
  end if;

  perform private.lock_social_pair(acting_user_id, $1);

  delete from public.contact_relationships
  where contact_relationships.user_low_id = least(acting_user_id, $1)
    and contact_relationships.user_high_id = greatest(acting_user_id, $1)
    and contact_relationships.status = 'accepted';

  get diagnostics removed_count = row_count;
  return removed_count > 0;
end;
$$;

comment on function public.remove_contact(uuid) is
  'Idempotently removes an accepted relationship. A later request starts from a clean pair.';

create function public.block_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if $1 is null or $1 = acting_user_id then
    raise exception using
      errcode = '22023',
      message = 'a block must target another user';
  end if;

  if not exists (select 1 from auth.users where auth.users.id = $1) then
    raise exception using
      errcode = 'P0002',
      message = 'target user not found';
  end if;

  perform private.lock_social_pair(acting_user_id, $1);

  insert into public.user_blocks (blocker_id, blocked_id)
  values (acting_user_id, $1)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.contact_relationships
  where contact_relationships.user_low_id = least(acting_user_id, $1)
    and contact_relationships.user_high_id = greatest(acting_user_id, $1);

  return true;
end;
$$;

comment on function public.block_user(uuid) is
  'Idempotently blocks a user and transactionally removes every contact relationship for the pair.';

create function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  if $1 is null or $1 = acting_user_id then
    raise exception using
      errcode = '22023',
      message = 'an unblock must target another user';
  end if;

  perform private.lock_social_pair(acting_user_id, $1);

  delete from public.user_blocks
  where user_blocks.blocker_id = acting_user_id
    and user_blocks.blocked_id = $1;

  return true;
end;
$$;

comment on function public.unblock_user(uuid) is
  'Idempotently removes only the authenticated user block; prior relationships are never restored.';

create function public.list_my_contacts()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  status_text text,
  relationship_id uuid,
  accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  return query
  select
    profiles.id,
    profiles.username,
    profiles.display_name,
    profiles.avatar_path,
    profiles.status_text,
    contact_relationships.id,
    contact_relationships.responded_at
  from public.contact_relationships
  join public.profiles
    on profiles.id = case
      when contact_relationships.user_low_id = acting_user_id
        then contact_relationships.user_high_id
      else contact_relationships.user_low_id
    end
  where contact_relationships.status = 'accepted'
    and acting_user_id in (
      contact_relationships.user_low_id,
      contact_relationships.user_high_id
    )
    and not private.is_blocked_between(acting_user_id, profiles.id)
  order by
    lower(coalesce(profiles.display_name, profiles.username, '')),
    profiles.username,
    profiles.id;
end;
$$;

comment on function public.list_my_contacts() is
  'Returns a deterministic minimal accepted-contact list without email or settings data.';

create function public.list_my_contact_requests()
returns table (
  relationship_id uuid,
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  status_text text,
  direction text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
begin
  return query
  select
    contact_relationships.id,
    profiles.id,
    profiles.username,
    profiles.display_name,
    profiles.avatar_path,
    profiles.status_text,
    case
      when contact_relationships.requested_by = acting_user_id then 'outgoing'
      else 'incoming'
    end,
    contact_relationships.created_at
  from public.contact_relationships
  join public.profiles
    on profiles.id = case
      when contact_relationships.user_low_id = acting_user_id
        then contact_relationships.user_high_id
      else contact_relationships.user_low_id
    end
  where contact_relationships.status = 'pending'
    and acting_user_id in (
      contact_relationships.user_low_id,
      contact_relationships.user_high_id
    )
    and not private.is_blocked_between(acting_user_id, profiles.id)
  order by
    contact_relationships.created_at,
    contact_relationships.id;
end;
$$;

comment on function public.list_my_contact_requests() is
  'Returns incoming and outgoing pending requests with an explicit direction and minimal profile fields.';

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_settings from anon, authenticated;
revoke all on table public.contact_relationships from anon, authenticated;
revoke all on table public.user_blocks from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (username, display_name, bio, avatar_path, status_text)
  on table public.profiles to authenticated;

grant select on table public.user_settings to authenticated;
grant update (theme, notification_preferences, privacy_preferences, ai_preferences)
  on table public.user_settings to authenticated;

grant select on table public.contact_relationships to authenticated;
grant select on table public.user_blocks to authenticated;

revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.normalize_profile_fields() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.require_authenticated() from public, anon, authenticated;
revoke all on function private.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function private.are_contacts(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_view_profile(uuid) from public, anon, authenticated;
revoke all on function private.lock_social_pair(uuid, uuid) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

revoke all on function public.set_my_profile(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.search_profiles(text, integer)
  from public, anon, authenticated;
revoke all on function public.send_contact_request(uuid)
  from public, anon, authenticated;
revoke all on function public.respond_contact_request(uuid, text)
  from public, anon, authenticated;
revoke all on function public.remove_contact(uuid)
  from public, anon, authenticated;
revoke all on function public.block_user(uuid)
  from public, anon, authenticated;
revoke all on function public.unblock_user(uuid)
  from public, anon, authenticated;
revoke all on function public.list_my_contacts()
  from public, anon, authenticated;
revoke all on function public.list_my_contact_requests()
  from public, anon, authenticated;

grant execute on function public.set_my_profile(text, text, text, text, text)
  to authenticated;
grant execute on function public.search_profiles(text, integer)
  to authenticated;
grant execute on function public.send_contact_request(uuid)
  to authenticated;
grant execute on function public.respond_contact_request(uuid, text)
  to authenticated;
grant execute on function public.remove_contact(uuid)
  to authenticated;
grant execute on function public.block_user(uuid)
  to authenticated;
grant execute on function public.unblock_user(uuid)
  to authenticated;
grant execute on function public.list_my_contacts()
  to authenticated;
grant execute on function public.list_my_contact_requests()
  to authenticated;
