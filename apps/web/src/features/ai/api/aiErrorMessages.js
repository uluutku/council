import { AiApiError } from './aiErrors.js';

const MESSAGES = {
  authentication_required: 'Your session has expired. Sign in again.',
  session_expired: 'Your session has expired. Sign in again.',
  invalid_request: 'That request could not be sent. Try again.',
  ai_conversation_not_found: 'This AI conversation is unavailable.',
  ai_agent_unavailable: 'This assistant is currently unavailable.',
  ai_run_in_progress: 'A response is already being generated. Wait for it to finish.',
  trial_expired: 'Your AI trial has ended. Pro billing is not available in this build yet.',
  credits_exhausted:
    'Your AI trial credits are used up. Pro billing is not available in this build yet.',
  rate_limited: 'Too many requests. Wait briefly and try again.',
  provider_unavailable: 'The AI provider is temporarily unavailable. Try again.',
  provider_error: 'The AI provider returned an unexpected response. Try again.',
  provider_not_configured: 'The AI provider is not configured. Try again later.',
  cancelled: 'Generation was stopped.',
  persona_not_found: 'That persona is no longer available.',
  persona_limit_reached: 'You can have up to 10 active personas. Archive one to add another.',
  invalid_persona: 'Check the persona details and try again.',
  memory_not_found: 'That saved memory is no longer available.',
  memory_limit_reached: 'This AI contact can remember up to 50 saved memories.',
  invalid_memory: 'Check the memory details and try again.',
  invalid_memory_source: 'That message cannot be used as a memory source.',
  invalid_memory_mode: 'That memory mode is not available.',
  invalid_image: 'That image could not be read. Choose a valid JPEG, PNG, or WebP image.',
  image_too_large: 'The selected images exceed Council’s size limit.',
  unsupported_image: 'Only JPEG, PNG, and WebP images are supported.',
  image_unavailable: 'That private image is no longer available.',
  vision_provider_unavailable: 'Image analysis is temporarily unavailable. Try again.',
  idempotency_conflict: 'This retry no longer matches the original request.',
  invalid_context_import: 'The forwarded message package is invalid. Review it and try again.',
  context_import_too_large: 'The forwarded message package is too large.',
  context_import_unavailable: 'That forwarded context is no longer available.',
  source_conversation_unavailable: 'The source conversation is unavailable.',
  source_message_unavailable: 'One or more selected messages can no longer be forwarded.',
  unsupported_document: 'Only PDF, TXT, and Markdown documents are supported.',
  document_too_large: 'The selected documents exceed Council’s size limit.',
  document_unavailable: 'That private document is no longer available.',
  document_unreadable:
    'This PDF does not contain enough readable text. Scanned-document OCR is not enabled in this build.',
  document_text_too_long: 'The readable document text exceeds Council’s processing limit.',
  pdf_parser_unavailable: 'PDF processing is temporarily unavailable. Try again.',
  backend_unavailable: 'Council is temporarily unavailable. Try again.',
  unknown_error: 'Something went wrong. Try again.',
};

export function aiErrorMessage(error) {
  const category =
    error instanceof AiApiError ? error.category : (error?.category ?? 'unknown_error');
  return MESSAGES[category] ?? MESSAGES.unknown_error;
}

export function isAiAccessError(error) {
  const category = error instanceof AiApiError ? error.category : error?.category;
  return category === 'trial_expired' || category === 'credits_exhausted';
}
