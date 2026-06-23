// ai-chat Edge Function: the only path that creates AI messages and runs.
//
// This entrypoint owns runtime configuration and Deno.serve registration only.
// Request routing, CORS, orchestration, media processing, provider calls, and
// run lifecycle transitions live in focused internal modules.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createAiChatHandler } from './handler.ts';
import { resolveCorsConfig } from './cors.mjs';
import { resolveProviderConfig } from './runtime-config.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
const OPENROUTER_TEXT_MODEL = Deno.env.get('OPENROUTER_TEXT_MODEL') ?? '';
const OPENROUTER_VISION_MODEL = Deno.env.get('OPENROUTER_VISION_MODEL') ?? '';
const OPENROUTER_PDF_ENGINE = Deno.env.get('OPENROUTER_PDF_ENGINE') ?? '';
const PROVIDER_MODE = Deno.env.get('AI_PROVIDER_MODE') ?? '';
const APP_ORIGINS = Deno.env.get('APP_ORIGINS') ?? '';
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '';
const EXPOSE_RUNTIME_METADATA = Deno.env.get('AI_EXPOSE_RUNTIME_METADATA') === 'true';
const OPENROUTER_APP_URL = Deno.env.get('OPENROUTER_APP_URL') ?? '';
const OPENROUTER_APP_NAME = Deno.env.get('OPENROUTER_APP_NAME') ?? '';
const AI_TEXT_TIMEOUT_MS = Deno.env.get('AI_TEXT_TIMEOUT_MS') ?? '';
const AI_VISION_TIMEOUT_MS = Deno.env.get('AI_VISION_TIMEOUT_MS') ?? '';
const AI_PDF_TIMEOUT_MS = Deno.env.get('AI_PDF_TIMEOUT_MS') ?? '';

const providerConfig = resolveProviderConfig({
  providerMode: PROVIDER_MODE,
  model: OPENROUTER_TEXT_MODEL,
  visionModel: OPENROUTER_VISION_MODEL,
  pdfEngine: OPENROUTER_PDF_ENGINE,
  apiKey: OPENROUTER_API_KEY,
  supabaseUrl: SUPABASE_URL,
  textTimeoutMs: AI_TEXT_TIMEOUT_MS,
  visionTimeoutMs: AI_VISION_TIMEOUT_MS,
  pdfTimeoutMs: AI_PDF_TIMEOUT_MS,
}) as {
  mode: 'openrouter' | 'mock';
  model: string;
  visionModel: string;
  pdfEngine: string;
  configured: boolean;
  textTimeoutMs: number;
  visionTimeoutMs: number;
  pdfTimeoutMs: number;
};

const corsConfig = resolveCorsConfig({
  appOrigins: APP_ORIGINS,
  appOrigin: APP_ORIGIN,
  providerMode: PROVIDER_MODE,
  supabaseUrl: SUPABASE_URL,
});

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createAiChatHandler({
    serviceClient,
    providerConfig,
    corsConfig,
    supabaseUrl: SUPABASE_URL,
    exposeRuntimeMetadata: EXPOSE_RUNTIME_METADATA,
    apiKey: OPENROUTER_API_KEY,
    appUrl: OPENROUTER_APP_URL,
    appName: OPENROUTER_APP_NAME,
  }),
);
