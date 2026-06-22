import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageAttachments } from './MessageAttachments.jsx';
import { makeAttachment } from '../test/fixtures.js';
import { clearAttachmentUrlCache } from '../queries/attachmentUrlCache.js';

const createAttachmentSignedUrl = vi.fn();
vi.mock('../api/attachmentsApi.js', () => ({
  createAttachmentSignedUrl: (...args) => createAttachmentSignedUrl(...args),
}));

describe('MessageAttachments', () => {
  beforeEach(() => {
    clearAttachmentUrlCache();
    createAttachmentSignedUrl.mockReset();
  });

  afterEach(() => {
    clearAttachmentUrlCache();
  });

  it('renders an image thumbnail through a signed URL and opens the viewer', async () => {
    createAttachmentSignedUrl.mockResolvedValue({ url: 'https://signed/image', expiresIn: 600 });
    const onOpenImage = vi.fn();
    const attachment = makeAttachment({ original_filename: 'cat.png', mime_type: 'image/png' });

    render(<MessageAttachments attachments={[attachment]} onOpenImage={onOpenImage} />);

    const image = await screen.findByAltText('cat.png');
    expect(image).toHaveAttribute('src', 'https://signed/image');

    await userEvent.click(screen.getByRole('button', { name: 'Open image cat.png' }));
    expect(onOpenImage).toHaveBeenCalledWith(attachment);
  });

  it('shows a fallback when a signed URL cannot be created', async () => {
    createAttachmentSignedUrl.mockRejectedValue(new Error('denied'));
    const attachment = makeAttachment({ original_filename: 'cat.png', mime_type: 'image/png' });

    render(<MessageAttachments attachments={[attachment]} onOpenImage={() => {}} />);

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument();
  });

  it('renders a document as a file card with Open and Download actions', async () => {
    const attachment = makeAttachment({
      original_filename: 'report.pdf',
      mime_type: 'application/pdf',
      width: null,
      height: null,
    });

    render(<MessageAttachments attachments={[attachment]} onOpenImage={() => {}} />);

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    // A document does not auto-resolve a signed URL until acted upon.
    await waitFor(() => expect(createAttachmentSignedUrl).not.toHaveBeenCalled());
  });
});
