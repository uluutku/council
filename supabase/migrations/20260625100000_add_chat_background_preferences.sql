alter table public.user_settings
add column appearance_preferences jsonb not null default jsonb_build_object(
  'chat_background', 'clean'
);

alter table public.user_settings
add constraint user_settings_appearance_preferences_object_check check (
  jsonb_typeof(appearance_preferences) = 'object'
);

grant update (appearance_preferences)
  on table public.user_settings to authenticated;

drop function public.update_my_settings(text, jsonb, jsonb);

create function public.update_my_settings(
  p_theme text default null,
  p_notification_preferences jsonb default null,
  p_privacy_preferences jsonb default null,
  p_appearance_preferences jsonb default null
)
returns public.user_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user_id uuid := private.require_authenticated();
  updated_settings public.user_settings;
begin
  if p_theme is null
    and p_notification_preferences is null
    and p_privacy_preferences is null
    and p_appearance_preferences is null then
    raise exception using
      errcode = '22023',
      message = 'at least one settings value is required';
  end if;

  if p_theme is not null and p_theme not in ('system', 'light', 'dark') then
    raise exception using
      errcode = '22023',
      message = 'theme must be system, light, or dark';
  end if;

  if p_notification_preferences is not null then
    if jsonb_typeof(p_notification_preferences) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'notification preferences must be an object';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(p_notification_preferences) as preference_key
      where preference_key not in ('message_notifications', 'message_previews', 'sound')
    ) then
      raise exception using
        errcode = '22023',
        message = 'notification preferences contain an unsupported key';
    end if;

    if exists (
      select 1
      from jsonb_each(p_notification_preferences) as preference
      where jsonb_typeof(preference.value) <> 'boolean'
    ) then
      raise exception using
        errcode = '22023',
        message = 'notification preference values must be booleans';
    end if;
  end if;

  if p_privacy_preferences is not null then
    if jsonb_typeof(p_privacy_preferences) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'privacy preferences must be an object';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(p_privacy_preferences) as preference_key
      where preference_key not in ('show_online_status', 'show_last_seen', 'allow_contact_requests')
    ) then
      raise exception using
        errcode = '22023',
        message = 'privacy preferences contain an unsupported key';
    end if;

    if exists (
      select 1
      from jsonb_each(p_privacy_preferences) as preference
      where jsonb_typeof(preference.value) <> 'boolean'
    ) then
      raise exception using
        errcode = '22023',
        message = 'privacy preference values must be booleans';
    end if;
  end if;

  if p_appearance_preferences is not null then
    if jsonb_typeof(p_appearance_preferences) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'appearance preferences must be an object';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(p_appearance_preferences) as preference_key
      where preference_key not in ('chat_background')
    ) then
      raise exception using
        errcode = '22023',
        message = 'appearance preferences contain an unsupported key';
    end if;

    if p_appearance_preferences ? 'chat_background'
      and (
        jsonb_typeof(p_appearance_preferences -> 'chat_background') <> 'string'
        or p_appearance_preferences ->> 'chat_background'
          not in ('clean', 'grid', 'paper', 'midnight')
      ) then
      raise exception using
        errcode = '22023',
        message = 'chat background must be clean, grid, paper, or midnight';
    end if;
  end if;

  update public.user_settings
  set
    theme = coalesce(p_theme, user_settings.theme),
    notification_preferences =
      case
        when p_notification_preferences is null then user_settings.notification_preferences
        else user_settings.notification_preferences || p_notification_preferences
      end,
    privacy_preferences =
      case
        when p_privacy_preferences is null then user_settings.privacy_preferences
        else user_settings.privacy_preferences || p_privacy_preferences
      end,
    appearance_preferences =
      case
        when p_appearance_preferences is null then user_settings.appearance_preferences
        else user_settings.appearance_preferences || p_appearance_preferences
      end
  where user_settings.user_id = acting_user_id
  returning user_settings.* into updated_settings;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'settings not found';
  end if;

  return updated_settings;
end;
$$;

comment on function public.update_my_settings(text, jsonb, jsonb, jsonb) is
  'Merges supported authenticated-user settings fields while preserving unrelated stored keys.';

revoke all on function public.update_my_settings(text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.update_my_settings(text, jsonb, jsonb, jsonb)
  to authenticated;
