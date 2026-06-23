import { createDeadlineSignal } from './request-control.mjs';
import { type ChatMessage, ProviderError, type ProviderUsage, runProvider } from './provider.ts';
import type { GenerationRequest } from './request-validation.ts';
import { categoryFromRpcError } from './errors.ts';
import { sseLine, sseResponse } from './sse.ts';
import { appendVisionContext, processImageAttachments } from './image-analysis.ts';
import {
  appendDocumentContext,
  failDocumentProcessing,
  processDocumentAttachments,
} from './document-analysis.ts';
import { completeRunWithRetry, failRun } from './run-lifecycle.ts';

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

type GenerationDeps = {
  request: Request;
  userId: string;
  input: GenerationRequest;
  serviceClient: any;
  providerConfig: ProviderConfig;
  apiKey: string;
  appUrl: string;
  appName: string;
  corsHeaders: Record<string, string>;
};

export function handleGeneration({
  request,
  userId,
  input,
  serviceClient,
  providerConfig,
  apiKey,
  appUrl,
  appName,
  corsHeaders,
}: GenerationDeps): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(sseLine(event));
      let runId: string | null = null;
      let creditReserved = true;

      try {
        await serviceClient.rpc('recover_expired_ai_runs', {
          p_user_id: userId,
          p_conversation_id: input.conversationId,
        });

        const { data: started, error: startError } = await serviceClient
          .rpc('start_ai_generation', {
            p_user_id: userId,
            p_conversation_id: input.conversationId,
            p_client_message_id: input.clientMessageId,
            p_user_content: input.content,
            p_model: providerConfig.model,
            p_attachment_ids: input.attachmentIds,
            p_source_conversation_id: input.isForwarding ? input.sourceConversationId : null,
            p_source_message_ids: input.isForwarding ? input.sourceMessageIds : [],
            p_document_attachment_ids: input.documentAttachmentIds,
          })
          .single();

        if (startError || !started) {
          send({ type: 'error', category: categoryFromRpcError(startError?.message) });
          controller.close();
          return;
        }

        runId = started.run_id as string;

        if (started.is_replay && started.status === 'completed' && started.assistant_message_id) {
          const { data: existing } = await serviceClient
            .rpc('get_ai_assistant_message', { p_run_id: runId })
            .single();
          send({ type: 'start', run_id: runId });
          if (existing) {
            send({ type: 'delta', text: existing.content });
            send({
              type: 'done',
              message: {
                id: existing.id,
                role: 'assistant',
                content: existing.content,
                created_at: existing.created_at,
              },
              credits_remaining: started.credits_remaining,
            });
          } else {
            send({ type: 'error', category: 'backend_unavailable' });
          }
          controller.close();
          return;
        }

        if (started.is_replay && started.status === 'running') {
          send({ type: 'error', category: 'ai_run_in_progress' });
          controller.close();
          return;
        }

        await serviceClient.rpc('heartbeat_ai_run', { p_run_id: runId });

        const { data: context, error: contextError } = await serviceClient
          .rpc('load_ai_run_context', { p_run_id: runId, p_max_messages: 20 })
          .single();
        if (contextError || !context) {
          await serviceClient.rpc('fail_ai_generation', {
            p_run_id: runId,
            p_error_category: 'backend_unavailable',
            p_status: 'failed',
          });
          send({ type: 'error', category: 'backend_unavailable' });
          controller.close();
          return;
        }

        const { data: attachments, error: attachmentsError } = await serviceClient.rpc(
          'load_ai_run_attachments',
          { p_run_id: runId },
        );
        if (attachmentsError) {
          await serviceClient.rpc('fail_ai_generation', {
            p_run_id: runId,
            p_error_category: 'image_unavailable',
            p_status: 'failed',
          });
          send({ type: 'error', category: 'image_unavailable' });
          controller.close();
          return;
        }

        let imageResult;
        try {
          imageResult = await processImageAttachments({
            serviceClient,
            userId,
            attachments,
            providerConfig,
            apiKey,
            userText: input.content,
            requestSignal: request.signal,
            appUrl,
            appName,
          });
        } catch (visionError) {
          const category =
            visionError instanceof ProviderError
              ? visionError.category
              : 'vision_provider_unavailable';
          const { data: refund } = await serviceClient
            .rpc('fail_ai_generation', {
              p_run_id: runId,
              p_error_category: category,
              p_status: category === 'cancelled' ? 'cancelled' : 'failed',
            })
            .single();
          send({ type: 'error', category, credits_remaining: refund?.credits_remaining });
          controller.close();
          return;
        }

        const { data: documents, error: documentsError } = await serviceClient.rpc(
          'load_ai_run_documents',
          { p_run_id: runId },
        );
        if (documentsError) {
          await failRun(serviceClient, runId, 'document_unavailable');
          send({ type: 'error', category: 'document_unavailable' });
          controller.close();
          return;
        }

        let documentResult;
        try {
          documentResult = await processDocumentAttachments({
            serviceClient,
            userId,
            documents,
            providerConfig,
            apiKey,
            requestSignal: request.signal,
            appUrl,
            appName,
          });
        } catch (documentError) {
          const category =
            documentError instanceof ProviderError
              ? documentError.category
              : 'document_unavailable';
          await failDocumentProcessing(serviceClient, documents);
          const { data: refund } = await failRun(serviceClient, runId, category);
          send({ type: 'error', category, credits_remaining: refund?.credits_remaining });
          controller.close();
          return;
        }

        send({ type: 'start', run_id: runId });

        const usage: ProviderUsage = {
          inputTokens: null,
          outputTokens: null,
          cost: null,
          providerRequestId: null,
        };
        let assembled = '';
        try {
          const deadline = createDeadlineSignal(request.signal, providerConfig.textTimeoutMs);
          try {
            const generator = runProvider(
              {
                mode: providerConfig.mode,
                model: providerConfig.model,
                apiKey,
                systemPrompt: appendVisionContext(
                  (context.system_prompt as string) ?? '',
                  imageResult.analyses,
                ),
                messages: appendDocumentContext(
                  (context.messages as ChatMessage[]) ?? [],
                  documentResult.contexts,
                ),
                signal: deadline.signal,
                appUrl,
                appName,
              },
              usage,
            );
            for await (const delta of generator) {
              assembled += delta;
              send({ type: 'delta', text: delta });
            }
          } finally {
            deadline.cleanup();
          }
        } catch (providerError) {
          const category =
            providerError instanceof ProviderError
              ? providerError.category
              : 'provider_unavailable';
          const status = category === 'cancelled' ? 'cancelled' : 'failed';
          const { data: refund } = await serviceClient
            .rpc('fail_ai_generation', {
              p_run_id: runId,
              p_error_category: category,
              p_status: status,
            })
            .single();
          send({
            type: 'error',
            category: category === 'cancelled' ? 'cancelled' : category,
            credits_remaining: refund?.credits_remaining,
          });
          controller.close();
          return;
        }

        if (assembled.trim().length === 0) {
          const { data: refund } = await serviceClient
            .rpc('fail_ai_generation', {
              p_run_id: runId,
              p_error_category: 'provider_error',
              p_status: 'failed',
            })
            .single();
          send({
            type: 'error',
            category: 'provider_error',
            credits_remaining: refund?.credits_remaining,
          });
          controller.close();
          return;
        }

        const completed = await completeRunWithRetry(
          serviceClient,
          runId,
          assembled,
          usage,
          providerConfig.mode,
          input.content,
        );
        if (!completed) {
          const { data: refund } = await failRun(serviceClient, runId, 'backend_unavailable');
          send({
            type: 'error',
            category: 'backend_unavailable',
            credits_remaining: refund?.credits_remaining,
          });
          controller.close();
          return;
        }

        console.log(
          JSON.stringify({
            event: 'ai_run_completed',
            run_id: runId,
            model: providerConfig.model,
            mode: providerConfig.mode,
            vision_model: imageResult.analyses.length > 0 ? providerConfig.visionModel : null,
            vision_cache_hits: imageResult.cacheHits,
            document_cache_hits: documentResult.cacheHits,
            document_count: documentResult.contexts.length,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            credits_remaining: completed.credits_remaining,
          }),
        );

        send({
          type: 'done',
          message: {
            id: completed.assistant_message_id,
            role: 'assistant',
            content: assembled,
            created_at: new Date().toISOString(),
          },
          credits_remaining: completed.credits_remaining,
        });
        controller.close();
      } catch (_error) {
        if (runId && creditReserved) {
          await serviceClient
            .rpc('fail_ai_generation', {
              p_run_id: runId,
              p_error_category: 'backend_unavailable',
              p_status: 'failed',
            })
            .single()
            .catch(() => {});
        }
        try {
          send({ type: 'error', category: 'backend_unavailable' });
        } catch (_ignored) {
          /* stream already closed */
        }
        controller.close();
      }
    },
  });

  return sseResponse(stream, corsHeaders);
}
