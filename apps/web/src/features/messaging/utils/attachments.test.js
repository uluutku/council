import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_ACCEPT,
  attachmentTypeLabel,
  formatFileSize,
  validateAttachmentFile,
  validateAttachmentSelection,
} from './attachments.js';

function fakeFile(name, type, size) {
  return { name, type, size };
}

describe('attachment validation', () => {
  it('accepts supported types within the size limit', () => {
    expect(validateAttachmentFile(fakeFile('photo.png', 'image/png', 1024))).toEqual({
      ok: true,
      category: null,
    });
    expect(validateAttachmentFile(fakeFile('notes.md', 'text/markdown', 1024)).ok).toBe(true);
  });

  it('rejects an extension that disagrees with the MIME type', () => {
    expect(validateAttachmentFile(fakeFile('photo.exe', 'image/png', 1024))).toEqual({
      ok: false,
      category: 'unsupported_attachment_type',
    });
  });

  it('rejects unsupported MIME types', () => {
    expect(validateAttachmentFile(fakeFile('a.svg', 'image/svg+xml', 100)).category).toBe(
      'unsupported_attachment_type',
    );
    expect(validateAttachmentFile(fakeFile('a.zip', 'application/zip', 100)).category).toBe(
      'unsupported_attachment_type',
    );
  });

  it('rejects oversized files', () => {
    expect(validateAttachmentFile(fakeFile('big.png', 'image/png', 10 * 1024 * 1024 + 1))).toEqual({
      ok: false,
      category: 'attachment_too_large',
    });
  });

  it('enforces the four-attachment cap across a selection', () => {
    const files = Array.from({ length: 3 }, (_, index) =>
      fakeFile(`f${index}.png`, 'image/png', 1024),
    );
    const { accepted, rejected } = validateAttachmentSelection(files, 2);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].category).toBe('too_many_attachments');
  });

  it('formats human-readable sizes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('labels a file type from its extension', () => {
    expect(attachmentTypeLabel('application/pdf', 'report.pdf')).toBe('PDF');
  });

  it('builds an accept attribute covering MIME types and extensions', () => {
    expect(ATTACHMENT_ACCEPT).toContain('image/png');
    expect(ATTACHMENT_ACCEPT).toContain('.pdf');
  });
});
