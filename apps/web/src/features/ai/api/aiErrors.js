// Maps provider/database failures and stream error categories to a stable set of
// application categories. Raw provider errors, SQL, and internal details are
// never surfaced.

const KNOWN_CATEGORIES = new Set([
  'authentication_required',
  'invalid_request',
  'ai_conversation_not_found',
  'ai_agent_unavailable',
  'ai_run_in_progress',
  'trial_expired',
  'credits_exhausted',
  'rate_limited',
  'provider_unavailable',
  'provider_error',
  'provider_not_configured',
  'cancelled',
  'persona_not_found',
  'persona_limit_reached',
  'invalid_persona',
  'memory_not_found',
  'memory_limit_reached',
  'invalid_memory',
  'invalid_memory_source',
  'invalid_memory_mode',
  'invalid_image',
  'image_too_large',
  'unsupported_image',
  'image_unavailable',
  'vision_provider_unavailable',
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

export function mapAiError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const category = typeof error?.category === 'string' ? error.category : '';

  if (KNOWN_CATEGORIES.has(category)) return category;
  if (KNOWN_CATEGORIES.has(message)) return message;

  if (error?.code === 'PGRST301' || /jwt|session|authentication required/i.test(message)) {
    return 'session_expired';
  }
  if (error?.status === 429 || /rate limit/i.test(message)) return 'rate_limited';
  if (
    error?.code === 'NETWORK_ERROR' ||
    error?.code === 'ECONNREFUSED' ||
    /failed to fetch|network|timeout/i.test(message)
  ) {
    return 'backend_unavailable';
  }
  return 'unknown_error';
}

export class AiApiError extends Error {
  constructor(category, cause) {
    super(category, { cause });
    this.name = 'AiApiError';
    this.category = category;
  }
}

export function toAiApiError(error) {
  if (error instanceof AiApiError) return error;
  return new AiApiError(mapAiError(error), error);
}
