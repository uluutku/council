import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AiComposer } from './AiComposer.jsx';
import { validateAiImageSelection } from '../utils/aiImages.js';

function Harness({ onSend }) {
  const [drafts, setDrafts] = useState([]);
  const images = {
    drafts,
    hasAny: drafts.length > 0,
    allReady: drafts.length > 0 && drafts.every((draft) => draft.status === 'ready'),
    isUploading: false,
    addFiles(files) {
      const result = validateAiImageSelection(files, drafts);
      setDrafts((current) => [
        ...current,
        ...result.accepted.map((file) => ({
          draftId: 'draft-1',
          attachmentId: 'a0000000-0000-4000-8000-000000000001',
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          width: 1,
          height: 1,
          previewUrl: 'blob:preview',
          status: 'ready',
        })),
      ]);
      return { rejected: result.rejected };
    },
    removeDraft() {
      setDrafts([]);
    },
    retryDraft() {},
    consume() {
      const selected = drafts;
      setDrafts([]);
      return selected;
    },
  };
  return (
    <AiComposer
      onSend={onSend}
      onStop={() => {}}
      isStreaming={false}
      disabled={false}
      images={images}
    />
  );
}

describe('AiComposer images', () => {
  it('previews, discloses, removes, and explicitly sends text plus image', async () => {
    const onSend = vi.fn();
    const { container } = render(<Harness onSend={onSend} />);
    const input = container.querySelector('input[type="file"]');
    const image = new File([new Uint8Array(10)], 'screen.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [image] } });

    expect(await screen.findByAltText('screen.png')).toBeInTheDocument();
    expect(
      screen.getByText(/will be sent to Council’s configured AI provider/i),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Message the assistant'), 'What is shown?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith(
      'What is shown?',
      expect.arrayContaining([expect.objectContaining({ filename: 'screen.png' })]),
    );

    fireEvent.change(input, { target: { files: [image] } });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove screen.png' }));
    expect(screen.queryByAltText('screen.png')).not.toBeInTheDocument();
  });
});
