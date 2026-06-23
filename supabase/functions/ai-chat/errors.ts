const KNOWN_CATEGORIES = new Set([
  'ai_conversation_not_found',
  'ai_agent_unavailable',
  'ai_run_in_progress',
  'trial_expired',
  'credits_exhausted',
  'rate_limited',
  'invalid_request',
  'invalid_image',
  'image_too_large',
  'unsupported_image',
  'image_unavailable',
  'idempotency_conflict',
  'invalid_context_import',
  'context_import_too_large',
  'context_import_unavailable',
  'source_conversation_unavailable',
  'source_message_unavailable',
  'unsupported_document',
  'document_too_large',
  'document_unavailable',
  'document_unreadable',
  'document_text_too_long',
  'pdf_parser_unavailable',
  'artifact_not_found',
  'artifact_archived',
  'artifact_limit_reached',
  'artifact_version_conflict',
]);

export function categoryFromRpcError(message: string | undefined): string {
  if (message && KNOWN_CATEGORIES.has(message)) return message;
  return 'backend_unavailable';
}
