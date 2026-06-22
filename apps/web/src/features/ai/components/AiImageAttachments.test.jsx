import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiImageAttachments } from './AiImageAttachments.jsx';
import {
  clearAiImageUrlCache,
  getCachedAiImageUrl,
  setCachedAiImageUrl,
} from '../queries/aiImageUrlCache.js';

vi.mock('../api/aiImagesApi.js', () => ({
  createAiImageSignedUrl: vi.fn(),
}));
import { createAiImageSignedUrl } from '../api/aiImagesApi.js';

const attachment = {
  id: 'a0000000-0000-4000-8000-000000000001',
  storage_bucket: 'ai-chat-images',
  storage_path: 'users/a/image.png',
  original_filename: 'image.png',
  mime_type: 'image/png',
  size_bytes: 100,
  width: 20,
  height: 10,
  created_at: '2026-06-22T10:00:00+00:00',
};

beforeEach(() => {
  clearAiImageUrlCache();
  vi.clearAllMocks();
});

describe('AiImageAttachments', () => {
  it('renders persisted images through a short-lived signed URL', async () => {
    createAiImageSignedUrl.mockResolvedValue({ url: 'https://signed/image', expiresIn: 600 });
    render(<AiImageAttachments conversationId="c1" attachments={[attachment]} />);
    expect(await screen.findByAltText('image.png')).toHaveAttribute('src', 'https://signed/image');
  });

  it('shows a safe failure state and separates URL cache by conversation', async () => {
    createAiImageSignedUrl.mockRejectedValue(new Error('denied'));
    render(<AiImageAttachments conversationId="c1" attachments={[attachment]} />);
    expect(await screen.findByText('Image unavailable')).toBeInTheDocument();

    setCachedAiImageUrl('c1', attachment.id, 'https://signed/one', 600);
    expect(getCachedAiImageUrl('c1', attachment.id)).toBe('https://signed/one');
    expect(getCachedAiImageUrl('c2', attachment.id)).toBeNull();
  });
});
