# Task 012: Private AI Image Understanding

Council AI conversations accept up to two directly attached JPEG, PNG, or WebP images (5 MB each,
8 MB combined). Uploads use a reserved owner/conversation path in the private `ai-chat-images`
bucket; history returns metadata only and the browser resolves short-lived signed URLs on demand.

The `ai-chat` function downloads authorized bytes server-side, validates signatures, computes
SHA-256, and sends base64 to the configured vision model. A bounded structured analysis is cached
per user/hash/model/prompt-version and passed to the existing DeepSeek prompt pipeline, preserving
platform rules, persona instructions, curated memory, streaming, idempotency, and one-credit
reservation/refund behavior.

The UI provides selection, drag/drop, validation, preview/removal, upload retry, provider-sharing
disclosure, persisted thumbnails, and an accessible larger viewer. Images never create memory.
PDFs, general files, forwarding, tools, web search, OCR UI, image generation, billing, voice, video,
and background agents remain out of scope.
