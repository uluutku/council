// A card for a private custom persona in the "My personas" section.
export function PersonaCard({ persona, onOpen, onEdit, onArchive, onRestore, isBusy }) {
  return (
    <article className="ai-agent-card" data-archived={persona.archived ? 'true' : undefined}>
      <div className="ai-agent-card-head">
        <span className="ai-agent-avatar" aria-hidden="true">
          {persona.name.slice(0, 1)}
        </span>
        <div>
          <h3 className="ai-agent-name">
            {persona.name} <span className="ai-badge ai-badge--custom">Custom</span>
            {persona.archived ? <span className="ai-archived-tag"> · Archived</span> : null}
          </h3>
          <p className="ai-agent-description">
            {persona.description || `${persona.tone}, ${persona.verbosity}`}
          </p>
        </div>
      </div>
      <div className="persona-card-actions">
        {persona.archived ? (
          <>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={onOpen}
              disabled={isBusy}
            >
              View history
            </button>
            <button
              type="button"
              className="button button--small"
              onClick={onRestore}
              disabled={isBusy}
            >
              Restore
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="button button--small"
              onClick={onOpen}
              disabled={isBusy}
            >
              Open
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={onEdit}
              disabled={isBusy}
            >
              Edit
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={onArchive}
              disabled={isBusy}
            >
              Archive
            </button>
          </>
        )}
      </div>
    </article>
  );
}
