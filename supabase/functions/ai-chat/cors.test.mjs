import assert from 'node:assert/strict';
import { corsHeadersForRequest, resolveCorsConfig } from './cors.mjs';

function request(origin, method = 'POST') {
  return new Request('http://127.0.0.1:54321/functions/v1/ai-chat', {
    method,
    headers: origin ? { Origin: origin } : {},
  });
}

const explicit = resolveCorsConfig({
  appOrigins: 'http://127.0.0.1:4173,http://localhost:4173',
  providerMode: 'openrouter',
  supabaseUrl: 'https://project.supabase.co',
});

const allowed = corsHeadersForRequest(request('http://127.0.0.1:4173'), explicit);
assert.equal(allowed.ok, true);
assert.equal(allowed.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:4173');
assert.equal(allowed.headers.Vary, 'Origin');

const denied = corsHeadersForRequest(request('https://evil.example'), explicit);
assert.equal(denied.ok, false);
assert.equal(denied.status, 403);
assert.equal(denied.headers['Access-Control-Allow-Origin'], undefined);

const missingProduction = resolveCorsConfig({
  providerMode: 'openrouter',
  supabaseUrl: 'https://project.supabase.co',
});
const missing = corsHeadersForRequest(request('https://app.example.com'), missingProduction);
assert.equal(missing.ok, false);
assert.equal(missing.status, 500);

const localMock = resolveCorsConfig({
  providerMode: 'mock',
  supabaseUrl: 'http://127.0.0.1:54321',
});
const local = corsHeadersForRequest(request('http://localhost:4173'), localMock);
assert.equal(local.ok, true);
assert.equal(local.headers['Access-Control-Allow-Origin'], 'http://localhost:4173');

const preflight = corsHeadersForRequest(request('http://127.0.0.1:4173', 'OPTIONS'), explicit);
assert.equal(preflight.ok, true);
assert.match(preflight.headers['Access-Control-Allow-Methods'], /OPTIONS/);

assert.equal(allowed.headers['Access-Control-Allow-Origin'] === '*', false);
assert.equal(local.headers['Access-Control-Allow-Origin'] === '*', false);
