const STARTERS = [
  'Help me plan my week',
  'Explain a difficult concept',
  'Improve a piece of writing',
  'Break down a problem',
];

// Empty-state suggestions. Selecting one fills the composer rather than sending,
// so the user stays in control of the first message.
export function AiStarterPrompts({ onSelect, disabled }) {
  return (
    <div className="ai-starters">
      <p className="ai-starters-title">Try asking</p>
      <ul className="ai-starters-list">
        {STARTERS.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              className="button button--secondary ai-starter"
              onClick={() => onSelect(prompt)}
              disabled={disabled}
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
