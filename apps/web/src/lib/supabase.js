import { createClient } from '@supabase/supabase-js';
import { readBrowserEnvironment } from './env.js';

let supabaseClient;

export function getSupabaseClient() {
  if (!supabaseClient) {
    const environment = readBrowserEnvironment();
    supabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}
