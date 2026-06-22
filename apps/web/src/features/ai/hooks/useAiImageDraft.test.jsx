import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAiImageDraft } from './useAiImageDraft.js';

vi.mock('../api/aiImagesApi.js', () => ({
  createAiImageUpload: vi.fn(),
  uploadAiImageObject: vi.fn(),
  finalizeAiImageUpload: vi.fn(),
  removeAiImageUpload: vi.fn(),
}));
vi.mock('../utils/aiImages.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    createAiImagePreview: vi.fn(() => 'blob:preview'),
    revokeAiImagePreview: vi.fn(),
    readAiImageDimensions: vi.fn(async () => ({ width: 20, height: 10 })),
  };
});

import * as api from '../api/aiImagesApi.js';

afterEach(() => vi.clearAllMocks());

describe('useAiImageDraft', () => {
  it('exposes upload failure and retries with a fresh reservation', async () => {
    api.createAiImageUpload
      .mockResolvedValueOnce({
        attachment_id: 'a0000000-0000-4000-8000-000000000001',
        storage_bucket: 'ai-chat-images',
        storage_path: 'users/a/image.png',
      })
      .mockResolvedValueOnce({
        attachment_id: 'a0000000-0000-4000-8000-000000000002',
        storage_bucket: 'ai-chat-images',
        storage_path: 'users/a/image-2.png',
      });
    api.uploadAiImageObject.mockRejectedValueOnce({ category: 'image_unavailable' });
    api.uploadAiImageObject.mockResolvedValueOnce(true);
    api.finalizeAiImageUpload.mockResolvedValue({
      attachment_id: 'a0000000-0000-4000-8000-000000000002',
      status: 'ready',
      mime_type: 'image/png',
      size_bytes: 10,
      original_filename: 'image.png',
      width: 20,
      height: 10,
    });
    api.removeAiImageUpload.mockResolvedValue(true);

    const { result } = renderHook(() => useAiImageDraft('c0000000-0000-4000-8000-000000000001'));
    const image = new File([new Uint8Array(10)], 'image.png', { type: 'image/png' });
    act(() => result.current.addFiles([image]));
    await waitFor(() => expect(result.current.drafts[0]?.status).toBe('failed'));

    await act(async () => result.current.retryDraft(result.current.drafts[0].draftId));
    await waitFor(() => expect(result.current.drafts[0]?.status).toBe('ready'));
    expect(api.removeAiImageUpload).toHaveBeenCalledTimes(1);
    expect(api.createAiImageUpload).toHaveBeenCalledTimes(2);
  });
});
