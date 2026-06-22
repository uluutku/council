import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { aiAgentsQueryOptions, aiPersonasQueryOptions } from '../queries/aiQueries.js';
import { aiKeys } from '../../../lib/query-keys/ai.js';
import { getOrCreateAiConversation } from '../api/aiApi.js';
import { useAiAccess } from '../hooks/useAiAccess.js';
import { usePersonaMutations } from '../hooks/usePersonaMutations.js';
import { aiErrorMessage } from '../api/aiErrorMessages.js';
import { AiAgentCard } from '../components/AiAgentCard.jsx';
import { AiAccessSummary } from '../components/AiAccessSummary.jsx';
import { PersonaCard } from '../components/PersonaCard.jsx';
import { PersonaEditor } from '../components/PersonaEditor.jsx';
import { AiProviderBadge } from '../components/AiProviderBadge.jsx';

// The AI catalogue with two sections: built-in contacts and the user's private
// custom personas. Opening any contact creates (or reuses) its single per-user
// conversation and navigates to it.
export function AiCataloguePage() {
  usePageTitle('AI');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('builtin');
  const [editor, setEditor] = useState(null); // null | { mode: 'create' } | { mode: 'edit', persona }
  const [actionError, setActionError] = useState('');

  const agentsQuery = useQuery(aiAgentsQueryOptions());
  const personasQuery = useQuery(aiPersonasQueryOptions());
  const { data: access } = useAiAccess();
  const personaMutations = usePersonaMutations();

  const open = useMutation({
    mutationFn: (target) => getOrCreateAiConversation(target),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.conversations() });
      navigate(`/app/ai/${conversation.id}`, { state: { displayName: conversation.display_name } });
    },
    onError: (error) => setActionError(aiErrorMessage(error)),
  });

  function runPersonaAction(promise) {
    setActionError('');
    promise.catch((error) => setActionError(aiErrorMessage(error)));
  }

  async function submitEditor(input) {
    setActionError('');
    try {
      if (editor.mode === 'create') {
        await personaMutations.create.mutateAsync(input);
      } else {
        await personaMutations.update.mutateAsync({ personaId: editor.persona.id, input });
      }
      setEditor(null);
    } catch (error) {
      setActionError(aiErrorMessage(error));
    }
  }

  const agents = agentsQuery.data ?? [];
  const personas = personasQuery.data ?? [];
  const editorSaving = personaMutations.create.isPending || personaMutations.update.isPending;

  return (
    <section className="ai-catalogue" aria-label="AI assistants">
      <header className="ai-catalogue-header">
        <h1>AI assistants</h1>
        <AiAccessSummary access={access} />
      </header>

      <p className="ai-disclosure" role="note">
        AI messages are processed by Council’s configured AI provider. <AiProviderBadge />
      </p>

      <div className="ai-tabs" role="tablist" aria-label="AI sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'builtin'}
          className="ai-tab"
          data-active={tab === 'builtin' ? 'true' : undefined}
          onClick={() => setTab('builtin')}
        >
          Built-in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'custom'}
          className="ai-tab"
          data-active={tab === 'custom' ? 'true' : undefined}
          onClick={() => setTab('custom')}
        >
          My personas
        </button>
      </div>

      {actionError ? (
        <p className="form-status form-status--error" role="alert">
          {actionError}
        </p>
      ) : null}

      {tab === 'builtin' ? (
        agentsQuery.isPending ? (
          <p>Loading assistants…</p>
        ) : agentsQuery.isError ? (
          <div className="ai-feedback" role="alert">
            <p>{aiErrorMessage(agentsQuery.error)}</p>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => agentsQuery.refetch()}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="ai-agent-grid">
            {agents.map((agent) => (
              <AiAgentCard
                key={agent.id}
                agent={agent}
                isOpening={open.isPending && open.variables?.agentId === agent.id}
                onOpen={() => {
                  setActionError('');
                  open.mutate({ agentId: agent.id });
                }}
              />
            ))}
          </div>
        )
      ) : (
        <div className="ai-personas-section">
          {editor ? (
            <PersonaEditor
              initial={editor.mode === 'edit' ? editor.persona : null}
              isSaving={editorSaving}
              onSubmit={submitEditor}
              onCancel={() => {
                setEditor(null);
                setActionError('');
              }}
            />
          ) : (
            <div className="ai-personas-toolbar">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setActionError('');
                  setEditor({ mode: 'create' });
                }}
              >
                Create persona
              </button>
            </div>
          )}

          {personasQuery.isPending ? (
            <p>Loading personas…</p>
          ) : personas.length === 0 && !editor ? (
            <p className="ai-personas-empty">
              You have no custom personas yet. Create one to give an assistant your own
              instructions, tone, and verbosity.
            </p>
          ) : (
            <div className="ai-agent-grid">
              {personas.map((persona) => (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  isBusy={
                    open.isPending ||
                    personaMutations.archive.isPending ||
                    personaMutations.restore.isPending
                  }
                  onOpen={() => {
                    setActionError('');
                    open.mutate({ personaId: persona.id });
                  }}
                  onEdit={() => {
                    setActionError('');
                    setEditor({ mode: 'edit', persona });
                  }}
                  onArchive={() =>
                    runPersonaAction(personaMutations.archive.mutateAsync(persona.id))
                  }
                  onRestore={() =>
                    runPersonaAction(personaMutations.restore.mutateAsync(persona.id))
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
