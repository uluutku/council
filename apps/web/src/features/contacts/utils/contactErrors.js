// Maps Supabase/PostgreSQL errors raised by the social database functions to a
// fixed set of user-facing categories. Raw SQL, stack traces, internal function
// names, and UUIDs are never surfaced. Blocking and privacy rejections collapse
// into a single generic "unavailable" message so the UI cannot reveal that the
// other user blocked the caller or disabled contact requests.

const CONTACT_ERROR_MESSAGES = {
  validation_error: 'Check the highlighted values and try again.',
  query_too_short: 'Type at least two characters to search.',
  user_unavailable: 'This person is not available right now.',
  request_already_pending: 'A request is already pending with this person.',
  already_contacts: 'You are already contacts.',
  request_no_longer_pending: 'This request is no longer available. Refresh and try again.',
  action_not_permitted: 'You are not able to perform that action.',
  blocked_unavailable: 'This person is not available right now.',
  rate_limited: 'Too many attempts. Wait briefly and try again.',
  network_unavailable: 'Council cannot reach the server.',
  session_expired: 'Your session has expired. Sign in again.',
  backend_unavailable: 'Council is temporarily unavailable. Try again.',
  unknown: 'Something went wrong. Try again.',
};

function category(name) {
  return { category: name, message: CONTACT_ERROR_MESSAGES[name] };
}

export function contactErrorMessage(name) {
  return CONTACT_ERROR_MESSAGES[name] ?? CONTACT_ERROR_MESSAGES.unknown;
}

export function mapContactError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  const sqlState = String(error?.code ?? '').toUpperCase();
  const message = String(error?.message ?? '').toLowerCase();
  const status = Number(error?.status ?? 0);

  if (
    error instanceof TypeError ||
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return category('network_unavailable');
  }

  if (status === 429 || code.includes('rate_limit') || message.includes('rate limit')) {
    return category('rate_limited');
  }

  if (
    code === 'refresh_token_not_found' ||
    code === 'session_not_found' ||
    code === 'pgrst301' ||
    (sqlState === '42501' && message.includes('authentication required'))
  ) {
    return category('session_expired');
  }

  switch (sqlState) {
    case '22023':
      if (message.includes('at least 2 characters')) return category('query_too_short');
      if (message.includes('only pending')) return category('request_no_longer_pending');
      return category('validation_error');
    case 'P0002':
      if (message.includes('contact request not found')) {
        return category('request_no_longer_pending');
      }
      return category('user_unavailable');
    case '42501':
      if (
        message.includes('not allowed') ||
        message.includes('not available') ||
        message.includes('does not allow')
      ) {
        return category('blocked_unavailable');
      }
      return category('action_not_permitted');
    default:
      break;
  }

  if (status >= 500 || code.startsWith('pgrst')) {
    return category('backend_unavailable');
  }

  return category('unknown');
}
