const ERROR_MESSAGES = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_verified: 'Verify your email before signing in.',
  registration_unavailable:
    'Council could not complete registration. Try logging in or recovering your password.',
  weak_password: 'The authentication service rejected this password.',
  rate_limited: 'Too many attempts. Wait briefly and try again.',
  network_unavailable: 'Council cannot reach the server.',
  session_expired: 'Your session has expired. Sign in again.',
  username_unavailable: 'That username is already in use.',
  backend_unavailable: 'Council is temporarily unavailable. Try again.',
  unknown: 'Something went wrong. Try again.',
};

export function mapSupabaseError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  const status = Number(error?.status ?? 0);

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return { category: 'invalid_credentials', message: ERROR_MESSAGES.invalid_credentials };
  }

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return { category: 'email_not_verified', message: ERROR_MESSAGES.email_not_verified };
  }

  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    message.includes('already registered')
  ) {
    return {
      category: 'registration_unavailable',
      message: ERROR_MESSAGES.registration_unavailable,
    };
  }

  if (code === 'weak_password' || message.includes('password should be')) {
    return { category: 'validation_error', message: ERROR_MESSAGES.weak_password };
  }

  if (
    status === 429 ||
    code.includes('rate_limit') ||
    code.includes('over_email_send_rate_limit') ||
    message.includes('rate limit')
  ) {
    return { category: 'rate_limited', message: ERROR_MESSAGES.rate_limited };
  }

  if (code === '23505' || message.includes('username is already taken')) {
    return { category: 'username_unavailable', message: ERROR_MESSAGES.username_unavailable };
  }

  if (code === 'refresh_token_not_found' || code === 'session_not_found') {
    return { category: 'session_expired', message: ERROR_MESSAGES.session_expired };
  }

  if (
    error instanceof TypeError ||
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return { category: 'network_unavailable', message: ERROR_MESSAGES.network_unavailable };
  }

  if (status >= 500 || code.startsWith('pgrst')) {
    return { category: 'backend_unavailable', message: ERROR_MESSAGES.backend_unavailable };
  }

  return { category: 'unknown', message: ERROR_MESSAGES.unknown };
}
