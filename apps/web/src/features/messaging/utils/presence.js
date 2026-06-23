export function presenceLabel(presence, now = Date.now()) {
  if (!presence) return '';
  if (presence.is_online === true) return 'Online';
  if (!presence.last_seen_at) return '';
  const elapsed = Math.max(0, now - new Date(presence.last_seen_at).getTime());
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `Last seen ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days} day${days === 1 ? '' : 's'} ago`;
}
