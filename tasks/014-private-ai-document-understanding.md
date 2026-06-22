# Task 014 — Private AI document understanding

Status: complete.

Users can attach up to two private PDF, TXT, or Markdown files directly to a built-in AI contact or
active custom persona, review safe file cards and the provider disclosure, enter a required
question, and explicitly send. Documents and streamed responses persist after reload.

Uploads use an owner-derived private Storage path and owner-only metadata. The existing `ai-chat`
pipeline revalidates the files, extracts bounded UTF-8 text locally or parses text-based PDFs from
base64 with the configured server-side engine, caches completed extraction per user, and includes
delimited untrusted document context before the current question. Signed URLs, extracted text, and
parser annotations are excluded from prompts returned to the browser, logs, and Realtime events.

Generation remains one-credit and idempotent across text, image IDs, document IDs, and forwarded
context. Scanned-document OCR, Office/HTML analysis, human-chat attachment forwarding, automatic
memory extraction, semantic search, and document knowledge bases remain out of scope.
