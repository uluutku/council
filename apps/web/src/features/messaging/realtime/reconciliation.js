export function assessRealtimeSequence({
  knownLastSequence,
  eventSequence,
  reconciliationRequired = false,
}) {
  if (reconciliationRequired || eventSequence == null) {
    return 'full_refresh';
  }

  if (knownLastSequence == null || eventSequence <= knownLastSequence + 1) {
    return 'no_gap';
  }

  return 'possible_gap';
}
