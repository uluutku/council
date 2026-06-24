import { Check, MessageCircle, Sparkles, UserPlus } from 'lucide-react';

function agentTone(agent) {
  const text = `${agent.slug ?? ''} ${agent.name} ${agent.description}`.toLowerCase();

  if (text.includes('writing') || text.includes('editor')) return 'creative';
  if (text.includes('study') || text.includes('coach') || text.includes('learn')) return 'study';
  if (text.includes('code') || text.includes('coding') || text.includes('developer')) return 'code';
  if (text.includes('research') || text.includes('fact')) return 'research';

  return 'general';
}

function agentTags(agent) {
  const tone = agentTone(agent);

  if (tone === 'creative') return ['Creative', 'Precise'];
  if (tone === 'study') return ['Educational', 'Patient'];
  if (tone === 'code') return ['Technical', 'Logic'];
  if (tone === 'research') return ['Research', 'Verified'];

  return ['Generalist', 'Fast'];
}

// A catalogue card for a built-in AI contact. It exposes only public agent
// identity and never renders private model configuration or prompt details.
export function AiAgentCard({ agent, onOpen, onOpenChat, isOpening, isInContacts = false }) {
  const tone = agentTone(agent);
  const actionText = isInContacts ? 'In Contacts' : isOpening ? 'Adding...' : 'Add to Contacts';
  const ActionIcon = isInContacts ? Check : UserPlus;

  return (
    <article className="ai-agent-card">
      <div className="ai-agent-media" data-tone={tone}>
        <span className="ai-agent-portrait" aria-hidden="true">
          {agent.name.slice(0, 1)}
        </span>
        <span className="ai-card-badge" data-tone={tone}>
          <Sparkles aria-hidden="true" size={12} strokeWidth={2.4} />
          AI
        </span>
      </div>

      <div className="ai-agent-card-body">
        <h2 className="ai-agent-name">{agent.name}</h2>
        <p className="ai-agent-description">{agent.description}</p>
        <div className="ai-agent-tags" aria-label={`${agent.name} categories`}>
          {agentTags(agent).map((tag, index) => (
            <span key={tag} className="ai-agent-tag" data-tone={index === 0 ? tone : 'secondary'}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="ai-agent-card-actions">
        <div className="ai-agent-primary-actions" data-added={isInContacts ? 'true' : undefined}>
          <button
            type="button"
            className="button ai-agent-open"
            data-state={isInContacts ? 'added' : undefined}
            onClick={onOpen}
            disabled={isOpening || isInContacts}
          >
            <span>{actionText}</span>
            <ActionIcon aria-hidden="true" size={18} strokeWidth={2.2} />
          </button>
          {isInContacts ? (
            <button
              type="button"
              className="button ai-agent-chat"
              onClick={onOpenChat}
              aria-label={`Open chat with ${agent.name}`}
              title={`Open chat with ${agent.name}`}
            >
              <span className="sr-only">Open chat</span>
              <MessageCircle aria-hidden="true" size={18} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
