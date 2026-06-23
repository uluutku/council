export const MAX_CONTENT_LENGTH = 8000;
const MAX_FORWARD_INSTRUCTION_LENGTH = 2000;
const MAX_FORWARDED_MESSAGES = 20;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GenerationRequest = {
  conversationId: string;
  clientMessageId: string;
  content: string;
  attachmentIds: string[];
  documentAttachmentIds: string[];
  isForwarding: boolean;
  sourceConversationId: string | null;
  sourceMessageIds: string[];
};

export type ArtifactRevisionRequest = {
  artifactId: string;
  instruction: string;
  clientRequestId: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function validateGenerationRequest(body: Record<string, unknown>): GenerationRequest | null {
  const conversationId = body.conversation_id;
  const clientMessageId = body.client_message_id;
  const content = typeof body.content === 'string' ? body.content : '';
  const attachmentIds = Array.isArray(body.attachment_ids) ? body.attachment_ids : [];
  const documentAttachmentIds = Array.isArray(body.document_attachment_ids)
    ? body.document_attachment_ids
    : [];
  const contextImport =
    body.context_import && typeof body.context_import === 'object'
      ? (body.context_import as Record<string, unknown>)
      : null;
  const sourceConversationId = contextImport?.source_conversation_id;
  const sourceMessageIds = Array.isArray(contextImport?.source_message_ids)
    ? contextImport.source_message_ids
    : [];
  const isForwarding = contextImport !== null;

  if (
    !isUuid(conversationId) ||
    !isUuid(clientMessageId) ||
    (!isForwarding && content.trim().length === 0) ||
    content.length > (isForwarding ? MAX_FORWARD_INSTRUCTION_LENGTH : MAX_CONTENT_LENGTH) ||
    attachmentIds.length > 2 ||
    attachmentIds.some((id) => !isUuid(id)) ||
    documentAttachmentIds.length > 2 ||
    documentAttachmentIds.some((id) => !isUuid(id)) ||
    (documentAttachmentIds.length > 0 && content.trim().length === 0) ||
    (isForwarding &&
      (attachmentIds.length > 0 ||
        documentAttachmentIds.length > 0 ||
        !isUuid(sourceConversationId) ||
        sourceMessageIds.length < 1 ||
        sourceMessageIds.length > MAX_FORWARDED_MESSAGES ||
        sourceMessageIds.some((id) => !isUuid(id))))
  ) {
    return null;
  }

  return {
    conversationId,
    clientMessageId,
    content,
    attachmentIds: attachmentIds as string[],
    documentAttachmentIds: documentAttachmentIds as string[],
    isForwarding,
    sourceConversationId: isForwarding ? (sourceConversationId as string) : null,
    sourceMessageIds: isForwarding ? (sourceMessageIds as string[]) : [],
  };
}

export function validateArtifactRevisionRequest(
  body: Record<string, unknown>,
): ArtifactRevisionRequest | null {
  const artifactId = body.artifact_id;
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  const clientRequestId = body.client_request_id;
  if (
    !isUuid(artifactId) ||
    !isUuid(clientRequestId) ||
    instruction.length < 1 ||
    instruction.length > MAX_CONTENT_LENGTH
  ) {
    return null;
  }
  return { artifactId, instruction, clientRequestId };
}
