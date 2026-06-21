import { describe, expect, it } from 'vitest';
import { inspectBrowserEnvironment, readBrowserEnvironment } from './env.js';

const validEnvironment = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'public-anon-key',
  MODE: 'test',
};

describe('browser environment validation', () => {
  it('returns normalized public application configuration', () => {
    expect(readBrowserEnvironment(validEnvironment)).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'public-anon-key',
      mode: 'test',
    });
  });

  it('reports missing fields without including secret values', () => {
    const result = inspectBrowserEnvironment({ MODE: 'development' });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(['supabaseUrl', 'supabaseAnonKey']);
    expect(JSON.stringify(result)).not.toContain('undefined');
  });
});
