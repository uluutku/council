import { useAiDocumentUrl } from '../hooks/useAiDocumentUrl.js';
import { documentTypeLabel, humanFileSize } from '../utils/aiDocuments.js';

function DocumentCard({ conversationId, document }) {
  const { status, resolve } = useAiDocumentUrl(conversationId, document);
  async function open() {
    const url = await resolve();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
  return (
    <li className="ai-document-card">
      <div>
        <strong>{document.original_filename}</strong>
        <span>
          {documentTypeLabel(document.mime_type)} · {humanFileSize(document.size_bytes)}
          {document.page_count ? ` · ${document.page_count} pages` : ''}
        </span>
        {document.status === 'failed' ? <span>Processing failed</span> : null}
        {status === 'error' ? <span role="alert">Document unavailable</span> : null}
      </div>
      <button
        type="button"
        className="button button--secondary button--small"
        onClick={open}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Opening…' : 'Open or download'}
      </button>
    </li>
  );
}

export function AiDocumentAttachments({ conversationId, documents = [] }) {
  if (!documents.length) return null;
  return (
    <ul className="ai-document-list" aria-label="Attached documents">
      {documents.map((document) => (
        <DocumentCard key={document.id} conversationId={conversationId} document={document} />
      ))}
    </ul>
  );
}
