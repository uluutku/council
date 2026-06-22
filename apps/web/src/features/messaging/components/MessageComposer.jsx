import { useEffect, useRef, useState } from 'react';
import { ReplyPreview } from './ReplyPreview.jsx';
import { AttachmentDraftList } from './AttachmentDraftList.jsx';
import { ATTACHMENT_ACCEPT, attachmentRejectionMessage } from '../utils/attachments.js';

const MAX_LENGTH = 8000;
const COUNTER_THRESHOLD = 500;

const EMPTY_ATTACHMENTS = {
  drafts: [],
  addFiles: () => ({ rejected: [] }),
  removeDraft: () => {},
  retryDraft: () => {},
  hasAny: false,
  allReady: false,
  isUploading: false,
  hasFailed: false,
};

// The message composer. Multiline input with a send button, an attachment
// picker (button + hidden input + drag-and-drop), a pending-attachment tray, a
// character counter near the limit, and an optional reply preview. Enter sends;
// Shift+Enter inserts a newline; IME composition is respected. A message may
// carry text, attachments, or both, but sending waits until every selected
// upload has finalized.
export function MessageComposer({
  replyReference,
  onCancelReply,
  onSend,
  autoFocusKey,
  attachments = EMPTY_ATTACHMENTS,
}) {
  const [value, setValue] = useState('');
  const [rejections, setRejections] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const composingRef = useRef(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const trimmed = value.trim();
  const textLength = trimmed.length;
  const textValid = textLength <= MAX_LENGTH;
  const hasReadyAttachments = attachments.hasAny && attachments.allReady;
  const attachmentsBlocking = attachments.hasAny && !attachments.allReady;
  const canSubmit = !attachmentsBlocking && textValid && (textLength >= 1 || hasReadyAttachments);
  const remaining = MAX_LENGTH - value.length;

  // Focus the composer when a reply is started so keyboard users continue typing.
  useEffect(() => {
    if (replyReference) textareaRef.current?.focus();
  }, [replyReference]);

  function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const { rejected } = attachments.addFiles(fileList);
    setRejections(rejected);
  }

  function submit() {
    if (!canSubmit) return;
    const clientMessageId = onSend(trimmed);
    if (clientMessageId) {
      setValue('');
      setRejections([]);
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
      data-dragging={isDragging ? 'true' : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
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
      {replyReference ? (
        <ReplyPreview reference={replyReference} variant="composer" onCancel={onCancelReply} />
      ) : null}

      <AttachmentDraftList
        drafts={attachments.drafts}
        onRemove={attachments.removeDraft}
        onRetry={attachments.retryDraft}
      />

      {rejections.length > 0 ? (
        <ul className="attachment-rejections" role="alert">
          {rejections.map((rejection, index) => (
            <li key={index}>{attachmentRejectionMessage(rejection)}</li>
          ))}
        </ul>
      ) : null}

      <div className="message-composer-row">
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          multiple
          accept={ATTACHMENT_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="button button--secondary message-composer-attach"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
        >
          Attach
        </button>
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
        <button type="submit" className="button message-composer-send" disabled={!canSubmit}>
          Send
        </button>
      </div>
      {attachments.isUploading ? (
        <p className="message-composer-hint" role="status">
          Waiting for attachments to finish uploading…
        </p>
      ) : null}
      {remaining <= COUNTER_THRESHOLD ? (
        <p className="message-composer-counter" data-over={remaining < 0 ? 'true' : undefined}>
          {value.length} / {MAX_LENGTH}
        </p>
      ) : null}
    </form>
  );
}
