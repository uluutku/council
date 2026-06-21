import { useEffect, useRef, useState } from 'react';
import { ReplyPreview } from './ReplyPreview.jsx';

const MAX_LENGTH = 8000;
const COUNTER_THRESHOLD = 500;

// The message composer. Multiline input with a send button, a character counter
// near the limit, and an optional reply preview. Enter sends; Shift+Enter
// inserts a newline; IME composition is respected so committing a candidate
// never sends. Sending is optimistic, so the input clears immediately once the
// optimistic message is enqueued.
export function MessageComposer({ replyReference, onCancelReply, onSend, autoFocusKey }) {
  const [value, setValue] = useState('');
  const composingRef = useRef(false);
  const textareaRef = useRef(null);
  const trimmed = value.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= MAX_LENGTH;
  const remaining = MAX_LENGTH - value.length;

  // Focus the composer when a reply is started so keyboard users continue typing.
  useEffect(() => {
    if (replyReference) textareaRef.current?.focus();
  }, [replyReference]);

  function submit() {
    if (!isValid) return;
    const clientMessageId = onSend(trimmed);
    if (clientMessageId) {
      setValue('');
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="message-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {replyReference ? (
        <ReplyPreview reference={replyReference} variant="composer" onCancel={onCancelReply} />
      ) : null}
      <div className="message-composer-row">
        <label className="sr-only" htmlFor="message-composer-input">
          Message
        </label>
        <textarea
          id="message-composer-input"
          ref={textareaRef}
          className="message-composer-input"
          value={value}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Write a message"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          data-autofocus-key={autoFocusKey}
        />
        <button type="submit" className="button message-composer-send" disabled={!isValid}>
          Send
        </button>
      </div>
      {remaining <= COUNTER_THRESHOLD ? (
        <p className="message-composer-counter" data-over={remaining < 0 ? 'true' : undefined}>
          {value.length} / {MAX_LENGTH}
        </p>
      ) : null}
    </form>
  );
}
