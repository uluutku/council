const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'kong', 'host.docker.internal']);

function isLocalSupabase(supabaseUrl) {
  try {
    return LOCAL_HOSTS.has(new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
}

export function resolveProviderConfig({ providerMode, model, visionModel, apiKey, supabaseUrl }) {
  const requestedMode = (providerMode || 'openrouter').toLowerCase();
  if (requestedMode === 'mock') {
    return {
      mode: 'mock',
      model: 'mock/council-assistant',
      visionModel: 'mock/council-vision',
      configured: isLocalSupabase(supabaseUrl),
    };
  }

  return {
    mode: 'openrouter',
    model: model || 'deepseek/deepseek-v4-flash',
    visionModel: visionModel || 'deepseek/deepseek-v4-flash',
    configured: Boolean(apiKey),
  };
}
