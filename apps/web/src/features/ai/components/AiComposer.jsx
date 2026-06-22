import { useRef, useState } from 'react';
import { AiImageDraftList } from './AiImageDraftList.jsx';
import { AI_IMAGE_ACCEPT, aiImageRejectionMessage } from '../utils/aiImages.js';

const MAX_LENGTH = 8000;

// Multiline AI composer. Enter sends; Shift+Enter inserts a newline; IME
// composition is respected. The input is disabled while a response is streaming
// or when AI access is unavailable. A Stop control aborts an active request.
// `initialValue` seeds the field (used by starter prompts); the parent remounts
// the composer via a key to apply a new starter without a state-sync effect.
export function AiComposer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  initialValue = '',
  contactName = 'the assistant',
  images,
}) {
  const [value, setValue] = useState(initialValue);
  const composingRef = useRef(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [rejections, setRejections] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const trimmed = value.trim();
  const imagesBlocking = images.hasAny && !images.allReady;
  const canSend =
    !disabled &&
    !isStreaming &&
    !imagesBlocking &&
    trimmed.length >= 1 &&
    trimmed.length <= MAX_LENGTH;

  function submit() {
    if (!canSend) return;
    const selected = images.consume();
    onSend(trimmed, selected);
    setValue('');
    setRejections([]);
    textareaRef.current?.focus();
  }

  function handleFiles(files) {
    const { rejected } = images.addFiles(files);
    setRejections(rejected);
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
      data-dragging={isDragging ? 'true' : undefined}
      onDragOver={(event) => {
        if (event.dataTransfer?.types?.includes('Files')) {
          event.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.target === event.currentTarget) setIsDragging(false);
      }}
      onDrop={(event) => {
        if (event.dataTransfer?.files?.length) {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }
      }}
    >
      <AiImageDraftList
        drafts={images.drafts}
        onRemove={images.removeDraft}
        onRetry={images.retryDraft}
      />
      {images.hasAny ? (
        <p className="ai-image-disclosure" role="note">
          Images attached here will be sent to Council’s configured AI provider for analysis.
        </p>
      ) : null}
      {rejections.length > 0 ? (
        <ul className="attachment-rejections" role="alert">
          {rejections.map((rejection, index) => (
            <li key={index}>{aiImageRejectionMessage(rejection)}</li>
          ))}
        </ul>
      ) : null}
      <div className="ai-composer-row">
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          multiple
          accept={AI_IMAGE_ACCEPT}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="button button--secondary ai-composer-attach"
          aria-label="Attach images"
          disabled={disabled || isStreaming}
          onClick={() => fileInputRef.current?.click()}
        >
          Attach
        </button>
        <label className="sr-only" htmlFor="ai-composer-input">
          Message the assistant
        </label>
        <textarea
          id="ai-composer-input"
          ref={textareaRef}
          className="ai-composer-input"
          value={value}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder={disabled ? 'AI is unavailable' : `Message ${contactName}`}
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
      {images.isUploading ? (
        <p className="ai-composer-hint" role="status">
          Preparing images…
        </p>
      ) : null}
    </form>
  );
}
