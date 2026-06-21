import { REACTION_CHOICES, reactionAccessibleLabel } from '../utils/reactions.js';

// The restrained reaction picker: a fixed small set of emoji. Selecting an emoji
// the user already reacted with removes it; otherwise it is added. Disabled when
// messaging is unavailable (adding is blocked, but the surrounding UI still
// allows removing an existing reaction).
export function MessageReactionPicker({ activeEmojis, onToggle, disabled }) {
  return (
    <div className="reaction-picker" role="group" aria-label="Add a reaction">
      {REACTION_CHOICES.map((emoji) => {
        const active = activeEmojis?.includes(emoji);
        return (
          <button
            key={emoji}
            type="button"
            className="reaction-choice"
            data-active={active ? 'true' : undefined}
            aria-pressed={active ? 'true' : 'false'}
            aria-label={`${reactionAccessibleLabel(emoji)}${active ? ', selected' : ''}`}
            disabled={disabled && !active}
            onClick={() => onToggle(emoji, Boolean(active))}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
    </div>
  );
}
