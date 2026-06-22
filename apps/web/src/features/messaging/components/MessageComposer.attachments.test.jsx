import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer.jsx';

function attachmentsApi(overrides = {}) {
  return {
    drafts: [],
    addFiles: vi.fn().mockReturnValue({ rejected: [] }),
    removeDraft: vi.fn(),
    retryDraft: vi.fn(),
    hasAny: false,
    allReady: false,
    isUploading: false,
    hasFailed: false,
    ...overrides,
  };
}

function readyImageDraft() {
  return {
    draftId: 'd1',
    file: {},
    filename: 'cat.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    isImage: true,
    previewUrl: 'blob:preview',
    status: 'ready',
    attachmentId: 'att-1',
  };
}

describe('MessageComposer attachments', () => {
  it('routes selected files to the draft uploader', async () => {
    const attachments = attachmentsApi();
    const { container } = render(<MessageComposer onSend={vi.fn()} attachments={attachments} />);

    const input = container.querySelector('input[type="file"]');
    await userEvent.upload(input, new File(['x'], 'cat.png', { type: 'image/png' }));

    expect(attachments.addFiles).toHaveBeenCalled();
  });

  it('shows rejection feedback for unsupported files', async () => {
    const attachments = attachmentsApi({
      addFiles: vi.fn().mockReturnValue({
        rejected: [{ name: 'virus.exe', category: 'unsupported_attachment_type' }],
      }),
    });
    const { container } = render(<MessageComposer onSend={vi.fn()} attachments={attachments} />);

    // fireEvent bypasses the input's `accept` filter so the component's own
    // validation path is exercised.
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('not a supported file type');
  });

  it('renders pending drafts with a remove control', async () => {
    const attachments = attachmentsApi({
      drafts: [readyImageDraft()],
      hasAny: true,
      allReady: true,
    });
    render(<MessageComposer onSend={vi.fn()} attachments={attachments} />);

    expect(screen.getByText('cat.png')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove cat.png' }));
    expect(attachments.removeDraft).toHaveBeenCalledWith('d1');
  });

  it('blocks sending while an upload is still in progress', () => {
    const attachments = attachmentsApi({
      drafts: [{ ...readyImageDraft(), status: 'uploading' }],
      hasAny: true,
      allReady: false,
      isUploading: true,
    });
    render(<MessageComposer onSend={vi.fn()} attachments={attachments} />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/Waiting for attachments/)).toBeInTheDocument();
  });

  it('allows an attachment-only send once uploads are ready', async () => {
    const onSend = vi.fn().mockReturnValue('client-id');
    const attachments = attachmentsApi({
      drafts: [readyImageDraft()],
      hasAny: true,
      allReady: true,
    });
    render(<MessageComposer onSend={onSend} attachments={attachments} />);

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(onSend).toHaveBeenCalledWith('');
  });
});
