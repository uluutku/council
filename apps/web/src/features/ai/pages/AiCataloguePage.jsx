import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { aiAgentsQueryOptions } from '../queries/aiQueries.js';
import { aiKeys } from '../../../lib/query-keys/ai.js';
import { getOrCreateAiConversation } from '../api/aiApi.js';
import { useAiAccess } from '../hooks/useAiAccess.js';
import { aiErrorMessage } from '../api/aiErrorMessages.js';
import { AiAgentCard } from '../components/AiAgentCard.jsx';
import { AiAccessSummary } from '../components/AiAccessSummary.jsx';

// The AI catalogue: the built-in assistant(s), the access state, and the
// required provider disclosure. Opening an agent creates (or reuses) the single
// per-user conversation and navigates to it.
export function AiCataloguePage() {
  usePageTitle('AI');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: agents = [],
    isPending,
    isError,
    error,
    refetch,
  } = useQuery(aiAgentsQueryOptions());
  const { data: access } = useAiAccess();
  const [openError, setOpenError] = useState('');

  const open = useMutation({
    mutationFn: (agentId) => getOrCreateAiConversation(agentId),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: aiKeys.conversations() });
      navigate(`/app/ai/${conversation.id}`, { state: { agentName: conversation.agent_name } });
    },
    onError: (mutationError) => setOpenError(aiErrorMessage(mutationError)),
  });

  return (
    <section className="ai-catalogue" aria-label="AI assistants">
      <header className="ai-catalogue-header">
        <h1>AI assistants</h1>
        <AiAccessSummary access={access} />
      </header>

      <p className="ai-disclosure" role="note">
        AI messages are processed by Council’s configured AI provider.
      </p>

      {openError ? (
        <p className="form-status form-status--error" role="alert">
          {openError}
        </p>
      ) : null}

      {isPending ? (
        <p>Loading assistants…</p>
      ) : isError ? (
        <div className="ai-feedback" role="alert">
          <p>{aiErrorMessage(error)}</p>
          <button type="button" className="button button--secondary" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <div className="ai-agent-grid">
          {agents.map((agent) => (
            <AiAgentCard
              key={agent.id}
              agent={agent}
              isOpening={open.isPending && open.variables === agent.id}
              onOpen={() => {
                setOpenError('');
                open.mutate(agent.id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
