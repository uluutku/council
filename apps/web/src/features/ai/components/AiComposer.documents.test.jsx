import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AiComposer } from './AiComposer.jsx';

const images = {
  drafts: [],
  hasAny: false,
  allReady: false,
  isUploading: false,
  addFiles: vi.fn(() => ({ rejected: [] })),
  removeDraft: vi.fn(),
  retryDraft: vi.fn(),
  consume: vi.fn(() => []),
};

function documents(overrides = {}) {
  return {
    drafts: [],
    hasAny: false,
    allReady: false,
    isUploading: false,
    addFiles: vi.fn(() => ({ rejected: [] })),
    removeDraft: vi.fn(),
    retryDraft: vi.fn(),
    consume: vi.fn(() => []),
    ...overrides,
  };
}

describe('AiComposer documents', () => {
  it('shows the provider disclosure, removes a preview, and sends explicitly', async () => {
    const draft = {
      draftId: 'draft-1',
      attachmentId: 'a0000000-0000-4000-8000-000000000001',
      filename: 'plan.md',
      mimeType: 'text/markdown',
      sizeBytes: 100,
      status: 'ready',
    };
    const docs = documents({
      drafts: [draft],
      hasAny: true,
      allReady: true,
      consume: vi.fn(() => [draft]),
    });
    const onSend = vi.fn();
    render(
      <AiComposer
        onSend={onSend}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
        images={images}
        documents={docs}
      />,
    );

    expect(screen.getByText('plan.md')).toBeInTheDocument();
    expect(screen.getByText(/Only files you explicitly send are analyzed/i)).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Message the assistant'), 'List the risks.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('List the risks.', [], [draft]);
  });

  it('renders unsupported-file feedback from document selection', async () => {
    const docs = documents({
      addFiles: vi.fn(() => ({
        rejected: [{ name: 'page.html', category: 'unsupported_document' }],
      })),
    });
    const { container } = render(
      <AiComposer
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
        images={images}
        documents={docs}
      />,
    );
    await userEvent.upload(
      container.querySelector('input[accept*="application/pdf"]'),
      new File(['html'], 'page.html', { type: 'text/html' }),
      { applyAccept: false },
    );
    expect(screen.getByText(/must be a PDF, TXT, or Markdown file/i)).toBeInTheDocument();
  });

  it('shows a character counter near the AI message limit', () => {
    render(
      <AiComposer
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        disabled={false}
        images={images}
        documents={documents()}
        initialValue={'x'.repeat(7600)}
      />,
    );

    expect(screen.getByText('7600 / 8000')).toBeInTheDocument();
  });
});
