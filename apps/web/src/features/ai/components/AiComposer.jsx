import { useRef, useState } from 'react';

const MAX_LENGTH = 8000;

// Multiline AI composer. Enter sends; Shift+Enter inserts a newline; IME
// composition is respected. The input is disabled while a response is streaming
// or when AI access is unavailable. A Stop control aborts an active request.
// `initialValue` seeds the field (used by starter prompts); the parent remounts
// the composer via a key to apply a new starter without a state-sync effect.
export function AiComposer({ onSend, onStop, isStreaming, disabled, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);
  const composingRef = useRef(false);
  const textareaRef = useRef(null);

  const trimmed = value.trim();
  const canSend = !disabled && !isStreaming && trimmed.length >= 1 && trimmed.length <= MAX_LENGTH;

  function submit() {
    if (!canSend) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="ai-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="ai-composer-row">
        <label className="sr-only" htmlFor="ai-composer-input">
          Message Council Assistant
        </label>
        <textarea
          id="ai-composer-input"
          ref={textareaRef}
          className="ai-composer-input"
          value={value}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder={disabled ? 'AI is unavailable' : 'Message Council Assistant'}
          disabled={disabled || isStreaming}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
        />
        {isStreaming ? (
          <button
            type="button"
            className="button button--secondary ai-composer-stop"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="button ai-composer-send" disabled={!canSend}>
            Send
          </button>
        )}
      </div>
    </form>
  );
}
