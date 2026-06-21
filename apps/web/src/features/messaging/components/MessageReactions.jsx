import { reactionAccessibleLabel, summarizeReactions } from '../utils/reactions.js';

// Displays the reaction summary chips for a message. Each chip shows the emoji
// and its count and indicates whether the current user reacted. Clicking a chip
// the user owns removes their reaction (permitted even when messaging is
// unavailable); clicking another chip adds the user's reaction (blocked when
// unavailable). Deleted messages render no reactions.
export function MessageReactions({ reactions, currentUserId, canAdd, onToggle }) {
  const summary = summarizeReactions(reactions, currentUserId);
  if (summary.length === 0) return null;

  return (
    <ul className="message-reactions" aria-label="Reactions">
      {summary.map((entry) => {
        const disabled = !entry.reactedByMe && !canAdd;
        const label = `${reactionAccessibleLabel(entry.emoji)}, ${entry.count}${
          entry.reactedByMe ? ', you reacted' : ''
        }`;
        return (
          <li key={entry.emoji}>
            <button
              type="button"
              className="reaction-chip"
              data-mine={entry.reactedByMe ? 'true' : undefined}
              aria-pressed={entry.reactedByMe ? 'true' : 'false'}
              aria-label={label}
              disabled={disabled}
              onClick={() => onToggle(entry.emoji, entry.reactedByMe)}
            >
              <span aria-hidden="true">{entry.emoji}</span>
              <span className="reaction-count" aria-hidden="true">
                {entry.count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
