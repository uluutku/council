import { describe, expect, it } from 'vitest';
import { validateAiImageSelection } from './aiImages.js';

function file(name, type, size) {
  return new File([new Uint8Array(size)], name, { type });
}

describe('AI image selection', () => {
  it('accepts JPEG, PNG, and WebP with matching extensions', () => {
    const result = validateAiImageSelection(
      [file('a.jpg', 'image/jpeg', 10), file('b.webp', 'image/webp', 10)],
      [],
    );
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toEqual([]);
  });

  it('rejects unsupported, oversized, excess-count, and combined-size selections', () => {
    expect(
      validateAiImageSelection([file('x.gif', 'image/gif', 10)], []).rejected[0].category,
    ).toBe('unsupported_image');
    expect(
      validateAiImageSelection([file('x.png', 'image/png', 5 * 1024 * 1024 + 1)], []).rejected[0]
        .category,
    ).toBe('image_too_large');
    expect(
      validateAiImageSelection([file('x.png', 'image/png', 10)], [{}, {}]).rejected[0].category,
    ).toBe('too_many_images');
    expect(
      validateAiImageSelection(
        [file('x.png', 'image/png', 4 * 1024 * 1024 + 1)],
        [{ sizeBytes: 4 * 1024 * 1024 }],
      ).rejected[0].category,
    ).toBe('images_too_large');
  });
});
