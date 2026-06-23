const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'kong', 'host.docker.internal']);
const LOCAL_LOOPBACK_ORIGINS = ['http://127.0.0.1:4173', 'http://localhost:4173'];

function isLocalSupabase(supabaseUrl) {
  try {
    return LOCAL_HOSTS.has(new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
}

function parseOrigins(value) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function resolveCorsConfig({
  appOrigins = '',
  appOrigin = '',
  providerMode = '',
  supabaseUrl = '',
}) {
  const explicitOrigins = [...parseOrigins(appOrigins), ...parseOrigins(appOrigin)];
  const localRuntime = isLocalSupabase(supabaseUrl);
  const mockMode = (providerMode || '').toLowerCase() === 'mock';
  const allowedOrigins =
    explicitOrigins.length > 0
      ? [...new Set(explicitOrigins)]
      : mockMode && localRuntime
        ? LOCAL_LOOPBACK_ORIGINS
        : [];

  return {
    allowedOrigins,
    configured: allowedOrigins.length > 0,
    allowNoOrigin: localRuntime,
  };
}

export function corsHeadersForRequest(request, config) {
  const headers = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (!origin) {
    return { ok: config.allowNoOrigin, headers };
  }
  if (!config.configured) {
    return { ok: false, status: 500, error: 'cors_not_configured', headers };
  }
  if (!config.allowedOrigins.includes(origin)) {
    return { ok: false, status: 403, error: 'origin_not_allowed', headers };
  }
  return {
    ok: true,
    headers: {
      ...headers,
      'Access-Control-Allow-Origin': origin,
    },
  };
}
