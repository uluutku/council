import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  attachmentExtension,
  isImageMimeType,
  isSupportedAttachment,
  supportedAttachmentTypes,
} from '@council/schemas';

export { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_BYTES, isImageMimeType };

// The file input `accept` attribute is advisory only — every selected file is
// re-validated against the MIME allowlist and its extension before upload.
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(supportedAttachmentTypes),
  ...Object.values(supportedAttachmentTypes)
    .flat()
    .map((extension) => `.${extension}`),
].join(',');

const UNITS = ['B', 'KB', 'MB'];

export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) return '';
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unitIndex]}`;
}

// A short human-facing label for a file type, derived from the safe extension
// rather than the raw MIME string.
export function attachmentTypeLabel(mimeType, filename) {
  const extension = attachmentExtension(filename);
  if (extension) return extension.toUpperCase();
  return typeof mimeType === 'string' ? mimeType : 'File';
}

// Validates a single file against the type allowlist and size limit. Returns a
// stable category so the UI can show consistent, non-leaky feedback.
export function validateAttachmentFile(file) {
  if (!file || typeof file.name !== 'string') {
    return { ok: false, category: 'invalid_attachment' };
  }
  if (!isSupportedAttachment(file.type, file.name)) {
    return { ok: false, category: 'unsupported_attachment_type' };
  }
  if (typeof file.size !== 'number' || file.size <= 0) {
    return { ok: false, category: 'invalid_attachment' };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, category: 'attachment_too_large' };
  }
  return { ok: true, category: null };
}

// Splits a selected file list into accepted files and rejection reasons,
// enforcing the per-message attachment cap against what is already attached.
export function validateAttachmentSelection(files, existingCount) {
  const accepted = [];
  const rejected = [];
  let remaining = MAX_ATTACHMENTS_PER_MESSAGE - existingCount;

  for (const file of files) {
    if (remaining <= 0) {
      rejected.push({ name: file?.name ?? 'file', category: 'too_many_attachments' });
      continue;
    }
    const result = validateAttachmentFile(file);
    if (result.ok) {
      accepted.push(file);
      remaining -= 1;
    } else {
      rejected.push({ name: file?.name ?? 'file', category: result.category });
    }
  }

  return { accepted, rejected };
}

const REJECTION_MESSAGES = {
  unsupported_attachment_type: 'is not a supported file type.',
  attachment_too_large: 'is larger than 10 MB.',
  too_many_attachments: 'exceeds the limit of 4 attachments per message.',
  invalid_attachment: 'could not be attached.',
};

export function attachmentRejectionMessage({ name, category }) {
  return `“${name}” ${REJECTION_MESSAGES[category] ?? REJECTION_MESSAGES.invalid_attachment}`;
}

// Reads pixel dimensions for an image file via an object URL. Resolves null when
// the dimensions cannot be determined (the metadata is optional).
export function readImageDimensions(file) {
  return new Promise((resolve) => {
    if (!isImageMimeType(file.type) || typeof URL === 'undefined' || !URL.createObjectURL) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions =
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null;
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export function createPreviewUrl(file) {
  if (!isImageMimeType(file.type) || typeof URL === 'undefined' || !URL.createObjectURL) {
    return null;
  }
  return URL.createObjectURL(file);
}

export function revokePreviewUrl(url) {
  if (url && typeof URL !== 'undefined' && URL.revokeObjectURL) {
    URL.revokeObjectURL(url);
  }
}
