// Communicates realtime transport health when it is meaningful. When the
// channel is subscribed there is nothing to show. Other states are announced
// politely so the user understands that delivery may be delayed and that the
// client will reconcile from the database on reconnect.
const MESSAGES = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  channel_error: 'Reconnecting…',
  timed_out: 'Reconnecting…',
  closed: 'Offline — messages will sync when reconnected',
};

export function RealtimeStatusIndicator({ status }) {
  const message = MESSAGES[status];
  if (!message) return null;

  return (
    <p className="realtime-status" role="status" aria-live="polite" data-status={status}>
      <span className="realtime-status-dot" aria-hidden="true" />
      {message}
    </p>
  );
}
