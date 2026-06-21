// A small relationship-state label. The state is always conveyed by text, never
// by colour alone, so the badge remains legible without colour perception.
export function ContactStatusBadge({ label, tone = 'neutral' }) {
  if (!label) return null;

  return (
    <span className="status-badge" data-tone={tone}>
      {label}
    </span>
  );
}
