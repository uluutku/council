import { formatDayLabel } from '../utils/datetime.js';

// A day divider in the message stream. Rendered as a separator so screen readers
// announce the date boundary without it reading as a message.
export function DateSeparator({ timestamp }) {
  const label = formatDayLabel(timestamp);
  return (
    <li className="date-separator" role="separator" aria-label={label}>
      <span>{label}</span>
    </li>
  );
}
