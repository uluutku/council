import { useRef, useState } from 'react';
import { FileText, Image, Send, Square } from 'lucide-react';
import { AiImageDraftList } from './AiImageDraftList.jsx';
import { AI_IMAGE_ACCEPT, aiImageRejectionMessage } from '../utils/aiImages.js';
import { AiDocumentDraftList } from './AiDocumentDraftList.jsx';
import { AI_DOCUMENT_ACCEPT, aiDocumentRejectionMessage } from '../utils/aiDocuments.js';

const MAX_LENGTH = 8000;
const EMPTY_DOCUMENTS = {
  drafts: [],
  hasAny: false,
  allReady: false,
  isUploading: false,
  addFiles: () => ({ rejected: [] }),
  removeDraft: () => {},
  retryDraft: () => {},
  consume: () => [],
};

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
  documents = EMPTY_DOCUMENTS,
}) {
  const [value, setValue] = useState(initialValue);
  const composingRef = useRef(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const [imageRejections, setImageRejections] = useState([]);
  const [documentRejections, setDocumentRejections] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const trimmed = value.trim();
  const imagesBlocking = images.hasAny && !images.allReady;
  const documentsBlocking = documents.hasAny && !documents.allReady;
  const canSend =
    !disabled &&
    !isStreaming &&
    !imagesBlocking &&
    !documentsBlocking &&
    trimmed.length >= 1 &&
    trimmed.length <= MAX_LENGTH;

  function submit() {
    if (!canSend) return;
    const selected = images.consume();
    const selectedDocuments = documents.consume();
    if (selectedDocuments.length > 0) onSend(trimmed, selected, selectedDocuments);
    else onSend(trimmed, selected);
    setValue('');
    setImageRejections([]);
    setDocumentRejections([]);
    textareaRef.current?.focus();
  }

  function handleImageFiles(files) {
    const { rejected } = images.addFiles(files);
    setImageRejections(rejected);
  }

  function handleDocumentFiles(files) {
    const { rejected } = documents.addFiles(files);
    setDocumentRejections(rejected);
  }

  function handleDroppedFiles(files) {
    const all = Array.from(files ?? []);
    handleImageFiles(all.filter((file) => file.type.startsWith('image/')));
    handleDocumentFiles(all.filter((file) => !file.type.startsWith('image/')));
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
          handleDroppedFiles(event.dataTransfer.files);
        }
      }}
    >
      <AiImageDraftList
        drafts={images.drafts}
        onRemove={images.removeDraft}
        onRetry={images.retryDraft}
      />
      <AiDocumentDraftList
        drafts={documents.drafts}
        onRemove={documents.removeDraft}
        onRetry={documents.retryDraft}
      />
      {images.hasAny ? (
        <p className="ai-image-disclosure" role="note">
          Images attached here will be sent to Council’s configured AI provider for analysis.
        </p>
      ) : null}
      {documents.hasAny ? (
        <p className="ai-image-disclosure" role="note">
          Documents attached here will be securely processed by Council’s configured AI provider.
          Only files you explicitly send are analyzed.
        </p>
      ) : null}
      {imageRejections.length > 0 ? (
        <ul className="attachment-rejections" role="alert">
          {imageRejections.map((rejection, index) => (
            <li key={index}>{aiImageRejectionMessage(rejection)}</li>
          ))}
        </ul>
      ) : null}
      {documentRejections.length > 0 ? (
        <ul className="attachment-rejections" role="alert">
          {documentRejections.map((rejection, index) => (
            <li key={index}>{aiDocumentRejectionMessage(rejection)}</li>
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
            handleImageFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="icon-button ai-composer-attach"
          aria-label="Attach images"
          title="Attach images"
          disabled={disabled || isStreaming}
          onClick={() => fileInputRef.current?.click()}
        >
          <Image aria-hidden="true" size={19} strokeWidth={2} />
        </button>
        <input
          ref={documentInputRef}
          type="file"
          className="sr-only"
          multiple
          accept={AI_DOCUMENT_ACCEPT}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            handleDocumentFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="icon-button ai-composer-attach"
          aria-label="Attach documents"
          title="Attach documents"
          disabled={disabled || isStreaming}
          onClick={() => documentInputRef.current?.click()}
        >
          <FileText aria-hidden="true" size={19} strokeWidth={2} />
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
            className="icon-button ai-composer-stop"
            aria-label="Stop response"
            title="Stop response"
            onClick={onStop}
          >
            <Square aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        ) : (
          <button
            type="submit"
            className="icon-button ai-composer-send"
            disabled={!canSend}
            aria-label="Send"
            title="Send"
            data-ready={canSend ? 'true' : undefined}
          >
            <Send aria-hidden="true" size={19} strokeWidth={2} />
          </button>
        )}
      </div>
      {images.isUploading ? (
        <p className="ai-composer-hint" role="status">
          Preparing images…
        </p>
      ) : null}
      {documents.isUploading ? (
        <p className="ai-composer-hint" role="status">
          Preparing documents…
        </p>
      ) : null}
    </form>
  );
}
