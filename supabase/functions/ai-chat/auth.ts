const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'kong', 'host.docker.internal']);

export function bearerToken(request: Request): string {
  const authHeader = request.headers.get('Authorization') ?? '';
  return authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
}

export function isLocalRuntime(supabaseUrl: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
}
