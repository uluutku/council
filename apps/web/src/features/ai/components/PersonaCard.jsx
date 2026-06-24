import {
  Archive,
  Check,
  History,
  MessageCircle,
  Pencil,
  RotateCcw,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useSignedAvatarUrl } from '../../../hooks/useSignedAvatarUrl.js';
import { PERSONA_AVATAR_BUCKET } from '../../../lib/avatarStorage.js';

// A card for a private custom persona in the "My personas" section.
export function PersonaCard({
  persona,
  onOpen,
  onEdit,
  onArchive,
  onRestore,
  onOpenChat,
  isBusy,
  isAdding = false,
  isInContacts = false,
}) {
  const primaryText = isInContacts ? 'In Contacts' : isAdding ? 'Adding...' : 'Add to Contacts';
  const PrimaryIcon = isInContacts ? Check : UserPlus;
  const avatarUrl = useSignedAvatarUrl(PERSONA_AVATAR_BUCKET, persona.avatar_path);

  return (
    <article className="ai-agent-card" data-archived={persona.archived ? 'true' : undefined}>
      <div className="ai-agent-media" data-tone="custom">
        <span className="ai-agent-portrait" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : persona.name.slice(0, 1)}
        </span>
        <span className="ai-card-badge" data-tone="custom">
          <Sparkles aria-hidden="true" size={12} strokeWidth={2.4} />
          Custom
        </span>
      </div>

      <div className="ai-agent-card-body">
        <h3 className="ai-agent-name">
          {persona.name}
          {persona.archived ? <span className="ai-archived-tag">Archived</span> : null}
        </h3>
        <p className="ai-agent-description">
          {persona.description || `${persona.tone}, ${persona.verbosity}`}
        </p>
        <div className="ai-agent-tags" aria-label={`${persona.name} settings`}>
          <span className="ai-agent-tag" data-tone="custom">
            {persona.tone}
          </span>
          <span className="ai-agent-tag" data-tone="secondary">
            {persona.verbosity}
          </span>
        </div>
      </div>

      <div className="persona-card-actions ai-agent-card-actions">
        {persona.archived ? (
          <>
            <button
              type="button"
              className="button button--secondary persona-action-button"
              onClick={onOpen}
              disabled={isBusy}
            >
              <span>View history</span>
              <History aria-hidden="true" size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="button persona-action-button"
              onClick={onRestore}
              disabled={isBusy}
            >
              <span>Restore</span>
              <RotateCcw aria-hidden="true" size={16} strokeWidth={2.2} />
            </button>
          </>
        ) : (
          <>
            <div
              className="ai-agent-primary-actions"
              data-added={isInContacts ? 'true' : undefined}
            >
              <button
                type="button"
                className="button ai-agent-open"
                data-state={isInContacts ? 'added' : undefined}
                onClick={onOpen}
                disabled={isBusy || isAdding || isInContacts}
              >
                <span>{primaryText}</span>
                <PrimaryIcon aria-hidden="true" size={18} strokeWidth={2.2} />
              </button>
              {isInContacts ? (
                <button
                  type="button"
                  className="button ai-agent-chat"
                  onClick={onOpenChat}
                  aria-label={`Open chat with ${persona.name}`}
                  title={`Open chat with ${persona.name}`}
                >
                  <span className="sr-only">Open chat</span>
                  <MessageCircle aria-hidden="true" size={18} strokeWidth={2.2} />
                </button>
              ) : null}
            </div>
            <div className="persona-management-actions">
              <button
                type="button"
                className="button button--secondary persona-action-button"
                onClick={onEdit}
                disabled={isBusy}
              >
                <span>Edit</span>
                <Pencil aria-hidden="true" size={16} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="button button--secondary persona-action-button"
                onClick={onArchive}
                disabled={isBusy}
              >
                <span>Archive</span>
                <Archive aria-hidden="true" size={16} strokeWidth={2.2} />
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
