import { useCallback, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { aiConversationsQueryOptions, aiMessagesQueryOptions } from '../queries/aiQueries.js';
import { useAiChat } from '../hooks/useAiChat.js';
import { useAiAccess } from '../hooks/useAiAccess.js';
import { aiErrorMessage, isAiAccessError } from '../api/aiErrorMessages.js';
import { AiMessageList } from '../components/AiMessageList.jsx';
import { AiComposer } from '../components/AiComposer.jsx';
import { AiAccessSummary } from '../components/AiAccessSummary.jsx';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function UnavailableConversation() {
  return (
    <section className="ai-conversation ai-conversation--blocked">
      <header className="ai-conversation-header">
        <h1>Council Assistant</h1>
      </header>
      <div className="ai-empty-state">
        <p className="ai-empty-title">This AI conversation is unavailable.</p>
      </div>
    </section>
  );
}

export function AiConversationPage() {
  const { conversationId } = useParams();
  const location = useLocation();
  const isValidId = typeof conversationId === 'string' && UUID_PATTERN.test(conversationId);

  const messagesQuery = useQuery({
    ...aiMessagesQueryOptions(isValidId ? conversationId : null),
    enabled: isValidId,
  });
  const { data: conversations = [] } = useQuery(aiConversationsQueryOptions());
  const { data: access } = useAiAccess();
  const chat = useAiChat(conversationId);
  const [draft, setDraft] = useState('');
  const [draftKey, setDraftKey] = useState(0);

  const conversation = conversations.find((entry) => entry.id === conversationId);
  const displayName =
    conversation?.display_name ?? location.state?.displayName ?? 'Council Assistant';
  const kind = conversation?.kind ?? null;
  const isArchived = conversation?.archived ?? false;
  usePageTitle(displayName);

  const canGenerate = (access ? access.can_generate : true) && !isArchived;
  const composerDisabled = !canGenerate;
  const messages = messagesQuery.data ?? [];

  const handleSelectStarter = useCallback((prompt) => {
    setDraft(prompt);
    setDraftKey((key) => key + 1);
  }, []);

  const accessError = chat.errorCategory && isAiAccessError({ category: chat.errorCategory });

  if (!isValidId) return <UnavailableConversation />;
  if (messagesQuery.isError && messagesQuery.error?.category === 'ai_conversation_not_found') {
    return <UnavailableConversation />;
  }

  return (
    <section className="ai-conversation" aria-label={`Conversation with ${displayName}`}>
      <header className="ai-conversation-header">
        <div>
          <h1>
            {displayName}{' '}
            <span className="ai-badge" data-kind={kind ?? undefined}>
              {kind === 'custom' ? 'Custom' : 'AI'}
            </span>
            {isArchived ? <span className="ai-archived-tag"> · Archived</span> : null}
          </h1>
          <p className="ai-disclosure-inline">
            AI messages are processed by Council’s configured AI provider.
          </p>
        </div>
        <AiAccessSummary access={access} variant="compact" />
      </header>

      <AiMessageList
        messages={messages}
        pendingUserMessage={chat.pendingUserMessage}
        assistantText={chat.assistantText}
        isStreaming={chat.isStreaming}
        isLoading={messagesQuery.isPending}
        onSelectStarter={handleSelectStarter}
        composerDisabled={composerDisabled}
      />

      {chat.errorCategory ? (
        <div className="ai-error" role="alert">
          <span>{aiErrorMessage({ category: chat.errorCategory })}</span>
          {accessError ? null : (
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={chat.retry}
            >
              Retry
            </button>
          )}
        </div>
      ) : null}

      {composerDisabled ? (
        <div className="ai-composer ai-composer--disabled">
          {isArchived ? (
            <p className="ai-archived-note" role="status">
              This persona is archived, so new messages are paused. Its history stays readable, and
              restoring it from “My personas” re-enables chatting.
            </p>
          ) : (
            <AiAccessSummary access={access} />
          )}
        </div>
      ) : (
        <AiComposer
          key={draftKey}
          onSend={chat.send}
          onStop={chat.stop}
          isStreaming={chat.isStreaming}
          disabled={composerDisabled}
          initialValue={draft}
          contactName={displayName}
        />
      )}
    </section>
  );
}
