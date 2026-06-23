import {
  aiArtifactCreateInputSchema,
  aiArtifactListSchema,
  aiArtifactSchema,
  aiArtifactVersionInputSchema,
} from '@council/schemas';
import { getSupabaseClient } from '../../../lib/supabase.js';
import { toAiApiError } from '../../ai/api/aiErrors.js';

export async function listMyArtifacts(client = getSupabaseClient()) {
  const { data, error } = await client.rpc('list_my_ai_artifacts', {
    p_include_archived: true,
    p_limit: 100,
  });
  if (error) throw toAiApiError(error);
  return aiArtifactListSchema.parse(data ?? []);
}

export async function getArtifact(artifactId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('get_ai_artifact', { p_artifact_id: artifactId });
  if (error) throw toAiApiError(error);
  return aiArtifactSchema.parse(data);
}

export async function createArtifact(input, client = getSupabaseClient()) {
  const parsed = aiArtifactCreateInputSchema.parse(input);
  const { data, error } = await client.rpc('create_ai_artifact', {
    p_source_ai_message_id: parsed.source_ai_message_id,
    p_type: parsed.type,
    p_title: parsed.title,
    p_content: parsed.content,
    p_client_request_id: parsed.client_request_id,
  });
  if (error) throw toAiApiError(error);
  return aiArtifactSchema.parse(data);
}

export async function createArtifactVersion(input, client = getSupabaseClient()) {
  const parsed = aiArtifactVersionInputSchema.parse(input);
  const { data, error } = await client.rpc('create_ai_artifact_version', {
    p_artifact_id: parsed.artifact_id,
    p_content: parsed.content,
    p_created_by: parsed.created_by,
    p_client_request_id: parsed.client_request_id,
    p_expected_current_version: parsed.expected_current_version,
  });
  if (error) throw toAiApiError(error);
  return aiArtifactSchema.parse(data);
}

export async function restoreArtifactVersion(
  artifactId,
  versionNumber,
  clientRequestId,
  client = getSupabaseClient(),
) {
  const { data, error } = await client.rpc('restore_ai_artifact_version', {
    p_artifact_id: artifactId,
    p_version_number: versionNumber,
    p_client_request_id: clientRequestId,
  });
  if (error) throw toAiApiError(error);
  return aiArtifactSchema.parse(data);
}

export async function saveArtifactRevision(runId, clientRequestId, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('save_ai_artifact_revision', {
    p_run_id: runId,
    p_client_request_id: clientRequestId,
  });
  if (error) throw toAiApiError(error);
  return aiArtifactSchema.parse(data);
}

export async function renameArtifact(artifactId, title, client = getSupabaseClient()) {
  const { data, error } = await client.rpc('rename_ai_artifact', {
    p_artifact_id: artifactId,
    p_title: title,
  });
  if (error) throw toAiApiError(error);
  return aiArtifactSchema.parse(data);
}

export async function setArtifactArchived(artifactId, archived, client = getSupabaseClient()) {
  const { error } = await client.rpc(archived ? 'archive_ai_artifact' : 'restore_ai_artifact', {
    p_artifact_id: artifactId,
  });
  if (error) throw toAiApiError(error);
}
