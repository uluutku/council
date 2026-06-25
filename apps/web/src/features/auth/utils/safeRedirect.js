const ALLOWED_PREFIXES = ['/app', '/onboarding'];
export const DEFAULT_APP_PATH = '/app/messages';

export function getSafeReturnPath(candidate, fallback = DEFAULT_APP_PATH) {
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'https://council.invalid');
    const path = `${parsed.pathname}${parsed.search}`;

    if (
      parsed.origin !== 'https://council.invalid' ||
      !ALLOWED_PREFIXES.some(
        (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`),
      )
    ) {
      return fallback;
    }

    return path;
  } catch {
    return fallback;
  }
}
