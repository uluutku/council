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
}) {
  const requestedMode = (providerMode || 'openrouter').toLowerCase();
  if (requestedMode === 'mock') {
    return {
      mode: 'mock',
      model: 'mock/council-assistant',
      visionModel: 'mock/council-vision',
      pdfEngine: 'mock/cloudflare-ai',
      configured: isLocalSupabase(supabaseUrl),
    };
  }

  return {
    mode: 'openrouter',
    model: model || 'deepseek/deepseek-v4-flash',
    visionModel: visionModel || 'google/gemini-2.5-flash',
    pdfEngine: pdfEngine || 'cloudflare-ai',
    configured: Boolean(apiKey),
  };
}
