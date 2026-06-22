import {
  MAX_AI_IMAGE_BYTES,
  MAX_AI_IMAGE_COMBINED_BYTES,
  MAX_AI_IMAGES_PER_MESSAGE,
} from '@council/schemas';

const TYPES = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

export const AI_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

function extension(filename) {
  const match = typeof filename === 'string' ? /\.([^.\\/]+)$/.exec(filename) : null;
  return match?.[1]?.toLowerCase() ?? null;
}

export function validateAiImageSelection(files, existingDrafts) {
  const accepted = [];
  const rejected = [];
  let count = existingDrafts.length;
  let combined = existingDrafts.reduce((sum, draft) => sum + draft.sizeBytes, 0);

  for (const file of Array.from(files ?? [])) {
    let category = null;
    if (count >= MAX_AI_IMAGES_PER_MESSAGE) category = 'too_many_images';
    else if (!TYPES[file?.type]?.includes(extension(file?.name))) category = 'unsupported_image';
    else if (!Number.isFinite(file?.size) || file.size <= 0) category = 'invalid_image';
    else if (file.size > MAX_AI_IMAGE_BYTES) category = 'image_too_large';
    else if (combined + file.size > MAX_AI_IMAGE_COMBINED_BYTES) category = 'images_too_large';

    if (category) {
      rejected.push({ name: file?.name ?? 'image', category });
    } else {
      accepted.push(file);
      count += 1;
      combined += file.size;
    }
  }
  return { accepted, rejected };
}

const REJECTION_TEXT = {
  too_many_images: 'exceeds the limit of 2 images.',
  unsupported_image: 'must be a JPEG, PNG, or WebP image.',
  invalid_image: 'could not be read as an image.',
  image_too_large: 'is larger than 5 MB.',
  images_too_large: 'would exceed the combined 8 MB limit.',
};

export function aiImageRejectionMessage(rejection) {
  return `“${rejection.name}” ${REJECTION_TEXT[rejection.category] ?? REJECTION_TEXT.invalid_image}`;
}

export function readAiImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      } else {
        reject(new Error('invalid_image'));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('invalid_image'));
    };
    image.src = url;
  });
}

export function createAiImagePreview(file) {
  return URL.createObjectURL(file);
}

export function revokeAiImagePreview(url) {
  if (url) URL.revokeObjectURL(url);
}
