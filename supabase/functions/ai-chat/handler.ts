import { bearerToken, isLocalRuntime } from './auth.ts';
import { corsHeadersForRequest } from './cors.mjs';
import { handleArtifactRevision } from './artifact-revision-handler.ts';
import { handleGeneration } from './generation-handler.ts';
import {
  validateArtifactRevisionRequest,
  validateGenerationRequest,
} from './request-validation.ts';

type ProviderConfig = {
  mode: 'openrouter' | 'mock';
  model: string;
  visionModel: string;
  pdfEngine: string;
  configured: boolean;
  textTimeoutMs: number;
  visionTimeoutMs: number;
  pdfTimeoutMs: number;
};

type HandlerDeps = {
  serviceClient: any;
  providerConfig: ProviderConfig;
  corsConfig: {
    allowedOrigins: string[];
    configured: boolean;
    allowNoOrigin: boolean;
  };
  supabaseUrl: string;
  exposeRuntimeMetadata: boolean;
  apiKey: string;
  appUrl: string;
  appName: string;
};

function jsonResponse(
  status: number,
  body: unknown,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function createAiChatHandler(deps: HandlerDeps) {
  return async function handleAiChatRequest(request: Request): Promise<Response> {
    const cors = corsHeadersForRequest(request, deps.corsConfig);
    if (!cors.ok) {
      return request.method === 'OPTIONS'
        ? new Response(null, { status: cors.status ?? 403, headers: cors.headers })
        : jsonResponse(
            cors.status ?? 403,
            { error: cors.error ?? 'origin_not_allowed' },
            cors.headers,
          );
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors.headers });
    }

    if (request.method === 'GET') {
      if (new URL(request.url).searchParams.get('details') !== '1') {
        return jsonResponse(200, { status: 'ok' }, cors.headers);
      }
      const token = bearerToken(request);
      const { data: metadataUser } = token
        ? await deps.serviceClient.auth.getUser(token)
        : { data: { user: null } };
      if (
        !metadataUser.user ||
        (!isLocalRuntime(deps.supabaseUrl) && !deps.exposeRuntimeMetadata)
      ) {
        return jsonResponse(200, { status: 'ok' }, cors.headers);
      }
      return jsonResponse(
        200,
        {
          status:
            deps.providerConfig.configured && deps.corsConfig.configured
              ? 'ok'
              : 'configuration_error',
          provider_mode: deps.providerConfig.mode,
          model: deps.providerConfig.model,
          vision_model: deps.providerConfig.visionModel,
          pdf_engine: deps.providerConfig.pdfEngine,
        },
        cors.headers,
      );
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method_not_allowed' }, cors.headers);
    }

    const token = bearerToken(request);
    if (!token) return jsonResponse(401, { error: 'authentication_required' }, cors.headers);

    const { data: userData, error: userError } = await deps.serviceClient.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(401, { error: 'authentication_required' }, cors.headers);
    }
    const userId = userData.user.id;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (_error) {
      return jsonResponse(400, { error: 'invalid_request' }, cors.headers);
    }

    if (!deps.providerConfig.configured) {
      return jsonResponse(500, { error: 'provider_not_configured' }, cors.headers);
    }

    if (body.operation === 'artifact_revision') {
      const input = validateArtifactRevisionRequest(body);
      if (!input) return jsonResponse(400, { error: 'invalid_request' }, cors.headers);
      return handleArtifactRevision({
        request,
        userId,
        input,
        serviceClient: deps.serviceClient,
        providerConfig: deps.providerConfig,
        apiKey: deps.apiKey,
        appUrl: deps.appUrl,
        appName: deps.appName,
        corsHeaders: cors.headers,
      });
    }

    const input = validateGenerationRequest(body);
    if (!input) return jsonResponse(400, { error: 'invalid_request' }, cors.headers);
    return handleGeneration({
      request,
      userId,
      input,
      serviceClient: deps.serviceClient,
      providerConfig: deps.providerConfig,
      apiKey: deps.apiKey,
      appUrl: deps.appUrl,
      appName: deps.appName,
      corsHeaders: cors.headers,
    });
  };
}
