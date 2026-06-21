-- The blocked-users settings screen needs to read minimal profile fields for
-- users the caller has blocked. Direct profile RLS intentionally hides blocked
-- pairs from each other (see private.can_view_profile), so a plain table join
-- cannot satisfy this screen. This narrowly scoped security-definer function
-- returns only the caller's own block rows joined to minimal public profile
-- fields, derives identity from auth.uid(), and never exposes block direction
-- beyond the caller's own rows.

create function public.list_my_blocked_users()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  status_text text,
  blocked_at timestamptz
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
    user_blocks.created_at
  from public.user_blocks
  join public.profiles
    on profiles.id = user_blocks.blocked_id
  where user_blocks.blocker_id = acting_user_id
  order by
    lower(coalesce(profiles.display_name, profiles.username, '')),
    profiles.username,
    profiles.id;
end;
$$;

comment on function public.list_my_blocked_users() is
  'Returns only the authenticated user''s own blocked targets with minimal profile fields. Identity is derived from auth.uid(); block direction is never exposed beyond the caller''s own rows.';

revoke all on function public.list_my_blocked_users()
  from public, anon, authenticated;

grant execute on function public.list_my_blocked_users()
  to authenticated;
