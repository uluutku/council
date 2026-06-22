import { useEffect, useId, useRef, useState } from 'react';

const MAX_LENGTH = 8000;

// Inline editor that replaces a message's body while editing. Prepopulated with
// the current content, validates non-blank and length, saves through the parent
// (edit_message), and preserves the original on failure. Enter saves,
// Shift+Enter inserts a newline, Escape cancels. IME composition is respected so
// committing a candidate never triggers a save.
export function EditMessageForm({ initialContent, isSaving, errorMessage, onSave, onCancel }) {
  const [value, setValue] = useState(initialContent ?? '');
  const composingRef = useRef(false);
  const textareaRef = useRef(null);
  const errorId = useId();
  const trimmed = value.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= MAX_LENGTH;

  useEffect(() => {
    const node = textareaRef.current;
    if (node) {
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    }
  }, []);

  function submit() {
    if (!isValid || isSaving) return;
    onSave(trimmed);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="edit-message-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor={`edit-${errorId}`}>
        Edit message
      </label>
      <textarea
        id={`edit-${errorId}`}
        ref={textareaRef}
        className="edit-message-input"
        value={value}
        rows={2}
        maxLength={MAX_LENGTH}
        aria-invalid={!isValid && trimmed.length === 0 ? 'true' : undefined}
        aria-describedby={errorMessage ? errorId : undefined}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
      />
      {errorMessage ? (
        <p className="field-error" id={errorId} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="edit-message-actions">
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button type="submit" className="button button--small" disabled={!isValid || isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
