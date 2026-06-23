const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'kong', 'host.docker.internal']);

function isLocalSupabase(supabaseUrl) {
  try {
    return LOCAL_HOSTS.has(new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
}

export function resolveProviderConfig({
  providerMode,
  model,
  visionModel,
  pdfEngine,
  apiKey,
  supabaseUrl,
  textTimeoutMs,
  visionTimeoutMs,
  pdfTimeoutMs,
}) {
  const requestedMode = (providerMode || 'openrouter').toLowerCase();
  if (requestedMode === 'mock') {
    return {
      mode: 'mock',
      model: 'mock/council-assistant',
      visionModel: 'mock/council-vision',
      pdfEngine: 'mock/cloudflare-ai',
      configured: isLocalSupabase(supabaseUrl),
      textTimeoutMs: parseTimeout(textTimeoutMs, 90_000),
      visionTimeoutMs: parseTimeout(visionTimeoutMs, 45_000),
      pdfTimeoutMs: parseTimeout(pdfTimeoutMs, 60_000),
    };
  }

  return {
    mode: 'openrouter',
    model: model || 'deepseek/deepseek-v4-flash',
    visionModel: visionModel || 'google/gemini-2.5-flash',
    pdfEngine: pdfEngine || 'cloudflare-ai',
    configured: Boolean(apiKey),
    textTimeoutMs: parseTimeout(textTimeoutMs, 90_000),
    visionTimeoutMs: parseTimeout(visionTimeoutMs, 45_000),
    pdfTimeoutMs: parseTimeout(pdfTimeoutMs, 60_000),
  };
}
import { parseTimeout } from './request-control.mjs';
