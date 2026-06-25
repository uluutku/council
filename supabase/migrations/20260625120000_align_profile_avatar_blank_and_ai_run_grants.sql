-- Keep profile avatar writes compatible with optional-field normalization while
-- retaining owner-prefixed private Storage validation.

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
  normalized_avatar_path text := nullif(btrim($4), '');
  updated_profile public.profiles;
begin
  if normalized_avatar_path is not null
     and not private.is_current_user_avatar_path(normalized_avatar_path) then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_avatar_path';
  end if;

  update public.profiles
  set
    username = $1,
    display_name = $2,
    bio = $3,
    avatar_path = normalized_avatar_path,
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

grant insert on table public.ai_runs to service_role;
