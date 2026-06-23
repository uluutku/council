import type { ProviderUsage } from './provider.ts';

export async function failRun(serviceClient: any, runId: string, category: string) {
  return await serviceClient
    .rpc('fail_ai_generation', {
      p_run_id: runId,
      p_error_category: category,
      p_status: category === 'cancelled' ? 'cancelled' : 'failed',
    })
    .single();
}

export async function completeRunWithRetry(
  serviceClient: any,
  runId: string,
  content: string,
  usage: ProviderUsage,
  mode: 'openrouter' | 'mock',
  userContent: string,
): Promise<Record<string, any> | null> {
  const simulated = mode === 'mock' ? userContent : '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (simulated.includes('[complete-fail]')) {
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      continue;
    }
    if (attempt === 0 && simulated.includes('[complete-retry]')) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    const { data, error } = await serviceClient
      .rpc('complete_ai_generation', {
        p_run_id: runId,
        p_assistant_content: content,
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
        p_provider_cost: usage.cost,
        p_provider_request_id: usage.providerRequestId,
      })
      .single();
    if (!error && data) {
      if (attempt === 0 && simulated.includes('[complete-lost]')) continue;
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }
  return null;
}

export async function completeArtifactRevisionWithRetry(
  serviceClient: any,
  runId: string,
  proposal: string,
  usage: ProviderUsage,
): Promise<Record<string, any> | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await serviceClient
      .rpc('complete_ai_artifact_revision', {
        p_run_id: runId,
        p_proposed_content: proposal,
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
        p_provider_cost: usage.cost,
        p_provider_request_id: usage.providerRequestId,
      })
      .single();
    if (!error && data) return data;
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }
  return null;
}
