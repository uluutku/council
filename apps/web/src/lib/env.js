import { applicationConfigSchema } from '@council/schemas';

/**
 * @param {Record<string, unknown>} rawEnvironment
 */
function toApplicationConfig(rawEnvironment) {
  return {
    supabaseUrl: rawEnvironment.VITE_SUPABASE_URL,
    supabaseAnonKey: rawEnvironment.VITE_SUPABASE_ANON_KEY,
    mode: rawEnvironment.MODE ?? 'development',
  };
}

/**
 * Parse browser-safe settings. Validation errors intentionally contain field names, never values.
 * @param {Record<string, unknown>} rawEnvironment
 */
export function readBrowserEnvironment(rawEnvironment = import.meta.env) {
  return applicationConfigSchema.parse(toApplicationConfig(rawEnvironment));
}

/**
 * @param {Record<string, unknown>} rawEnvironment
 */
export function inspectBrowserEnvironment(rawEnvironment = import.meta.env) {
  const result = applicationConfigSchema.safeParse(toApplicationConfig(rawEnvironment));

  if (result.success) {
    return {
      valid: true,
      config: result.data,
      issues: [],
    };
  }

  return {
    valid: false,
    config: null,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'environment',
      message: 'Required browser setting is missing or invalid.',
    })),
  };
}
