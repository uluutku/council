// A catalogue card for a built-in AI contact. The AI label is unmistakable and
// no private model configuration or prompt is shown.
export function AiAgentCard({ agent, onOpen, isOpening }) {
  return (
    <article className="ai-agent-card">
      <div className="ai-agent-card-head">
        <span className="ai-agent-avatar" aria-hidden="true">
          {agent.name.slice(0, 1)}
        </span>
        <div>
          <h2 className="ai-agent-name">
            {agent.name} <span className="ai-badge">AI</span>
          </h2>
          <p className="ai-agent-description">{agent.description}</p>
        </div>
      </div>
      <button type="button" className="button ai-agent-open" onClick={onOpen} disabled={isOpening}>
        {isOpening ? 'Opening…' : 'Open conversation'}
      </button>
    </article>
  );
}
