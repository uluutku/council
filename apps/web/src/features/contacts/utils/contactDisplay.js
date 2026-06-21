// Display helpers shared by every contact surface. Email and biography are never
// part of these contracts, so there is nothing sensitive to format here.

export function contactDisplayName(item) {
  return item.display_name || item.username || 'Council member';
}

export function contactInitials(item) {
  const source = (item.display_name || item.username || '').trim();
  if (source === '') return '?';

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatBlockedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
