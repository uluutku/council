export class RealtimeSubscriptionError extends Error {
  constructor(category, cause) {
    super(category, { cause });
    this.name = 'RealtimeSubscriptionError';
    this.category = category;
  }
}

export function normalizeRealtimeStatus(status) {
  switch (status) {
    case 'SUBSCRIBED':
      return 'subscribed';
    case 'CHANNEL_ERROR':
      return 'channel_error';
    case 'TIMED_OUT':
      return 'timed_out';
    case 'CLOSED':
      return 'closed';
    default:
      return 'connecting';
  }
}
