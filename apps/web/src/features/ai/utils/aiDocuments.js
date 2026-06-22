import {
  MAX_AI_DOCUMENTS_PER_MESSAGE,
  MAX_AI_DOCUMENT_COMBINED_BYTES,
  MAX_AI_PDF_BYTES,
  MAX_AI_TEXT_DOCUMENT_BYTES,
} from '@council/schemas';

const TYPES = {
  'application/pdf': ['pdf'],
  'text/plain': ['txt'],
  'text/markdown': ['md'],
};

export const AI_DOCUMENT_ACCEPT = 'application/pdf,text/plain,text/markdown,.pdf,.txt,.md';

function extension(filename) {
  return /\.([^.\\/]+)$/.exec(filename)?.[1]?.toLowerCase() ?? null;
}

export function validateAiDocumentSelection(files, existingDrafts) {
  const accepted = [];
  const rejected = [];
  let count = existingDrafts.length;
  let combined = existingDrafts.reduce((sum, draft) => sum + draft.sizeBytes, 0);
  for (const file of Array.from(files ?? [])) {
    let category = null;
    const perFileLimit =
      file?.type === 'application/pdf' ? MAX_AI_PDF_BYTES : MAX_AI_TEXT_DOCUMENT_BYTES;
    if (count >= MAX_AI_DOCUMENTS_PER_MESSAGE) category = 'too_many_documents';
    else if (!TYPES[file?.type]?.includes(extension(file?.name))) category = 'unsupported_document';
    else if (!Number.isFinite(file?.size) || file.size <= 0) category = 'document_unreadable';
    else if (file.size > perFileLimit) category = 'document_too_large';
    else if (combined + file.size > MAX_AI_DOCUMENT_COMBINED_BYTES) {
      category = 'documents_too_large';
    }
    if (category) rejected.push({ name: file?.name ?? 'document', category });
    else {
      accepted.push(file);
      count += 1;
      combined += file.size;
    }
  }
  return { accepted, rejected };
}

const TEXT = {
  too_many_documents: 'exceeds the limit of 2 documents.',
  unsupported_document: 'must be a PDF, TXT, or Markdown file.',
  document_unreadable: 'could not be read as a document.',
  document_too_large: 'exceeds the size limit for its file type.',
  documents_too_large: 'would exceed the combined 15 MB limit.',
};

export function aiDocumentRejectionMessage(rejection) {
  return `“${rejection.name}” ${TEXT[rejection.category] ?? TEXT.document_unreadable}`;
}

export function documentTypeLabel(mimeType) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'text/markdown') return 'Markdown';
  return 'Text';
}

export function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
