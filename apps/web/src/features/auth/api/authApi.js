import { getSupabaseClient } from '../../../lib/supabase.js';

function applicationUrl(path) {
  return new URL(path, window.location.origin).toString();
}

export async function signUpWithEmail({ email, password }, client = getSupabaseClient()) {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: applicationUrl('/verify-email'),
    },
  });

  if (error) throw error;
  return data;
}

export async function resendVerificationEmail(email, client = getSupabaseClient()) {
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: applicationUrl('/verify-email'),
    },
  });

  if (error) throw error;
}

export async function signInWithEmail({ email, password }, client = getSupabaseClient()) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email, client = getSupabaseClient()) {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: applicationUrl('/reset-password'),
  });

  if (error) throw error;
}

export async function updatePassword(password, client = getSupabaseClient()) {
  const { data, error } = await client.auth.updateUser({ password });

  if (error) throw error;
  return data;
}

export async function signOutSession(scope = 'local', client = getSupabaseClient()) {
  let result = await client.auth.signOut({ scope });

  if (result.error && (result.error.status >= 500 || result.error instanceof TypeError)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    result = await client.auth.signOut({ scope });
  }

  if (result.error) throw result.error;
}
