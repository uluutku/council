import { getSupabaseClient } from '../../../lib/supabase.js';

function profileNotReadyError() {
  const error = new Error('Profile is not ready.');
  error.code = 'PROFILE_NOT_READY';
  return error;
}

export async function getMyProfile(userId, client = getSupabaseClient()) {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (error) throw error;
  if (!data) throw profileNotReadyError();
  return data;
}

export async function getMyProfileWithRetry(userId, client = getSupabaseClient(), attempts = 4) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getMyProfile(userId, client);
    } catch (error) {
      lastError = error;
      if (error.code !== 'PROFILE_NOT_READY' || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }

  throw lastError;
}

export async function setMyProfile(profile, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('set_my_profile', {
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      avatar_path: profile.avatar_path,
      status_text: profile.status_text,
    })
    .single();

  if (error) throw error;
  return data;
}

export async function getMySettings(userId, client = getSupabaseClient()) {
  const { data, error } = await client
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const missingError = new Error('Settings are not ready.');
    missingError.code = 'SETTINGS_NOT_READY';
    throw missingError;
  }

  return data;
}

export async function updateMySettings(settings, client = getSupabaseClient()) {
  const { data, error } = await client
    .rpc('update_my_settings', {
      p_theme: settings.theme,
      p_notification_preferences: settings.notification_preferences,
      p_privacy_preferences: settings.privacy_preferences,
      p_appearance_preferences: settings.appearance_preferences,
    })
    .single();

  if (error) throw error;
  return data;
}
