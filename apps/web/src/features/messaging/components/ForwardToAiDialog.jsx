import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MAX_FORWARD_INSTRUCTION_LENGTH, MAX_FORWARDED_TEXT_LENGTH } from '@council/schemas';
import { aiAgentsQueryOptions, aiPersonasQueryOptions } from '../../ai/queries/aiQueries.js';
import { getOrCreateAiConversation } from '../../ai/api/aiApi.js';
import { formatFullTimestamp } from '../utils/datetime.js';
import { useUiStore } from '../../../stores/uiStore.js';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function targetValue(kind, id) {
  return `${kind}:${id}`;
}

export function ForwardToAiDialog({
  open,
  sourceConversationId,
  messages,
  currentUserId,
  contactName,
  onCancel,
  onForwardingStarted,
}) {
  const navigate = useNavigate();
  const setPendingAiForward = useUiStore((state) => state.setPendingAiForward);
  const panelRef = useRef(null);
  const pendingRef = useRef(false);
  const titleId = useId();
  const [includedIds, setIncludedIds] = useState(() => new Set(messages.map((item) => item.id)));
  const [instruction, setInstruction] = useState('');
  const [destination, setDestination] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { data: agents = [], isPending: agentsPending } = useQuery(aiAgentsQueryOptions());
  const { data: personas = [], isPending: personasPending } = useQuery(aiPersonasQueryOptions());

  useEffect(() => {
    pendingRef.current = isPending;
  }, [isPending]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector('select')?.focus());

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !pendingRef.current) {
        event.preventDefault();
        onCancel();
      }
      if (event.key !== 'Tab') return;
      const controls = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      previous?.focus?.();
    };
  }, [onCancel, open]);

  const included = useMemo(
    () => messages.filter((message) => includedIds.has(message.id)),
    [includedIds, messages],
  );
  const copiedCharacters = included.reduce((total, message) => total + message.content.length, 0);
  const activePersonas = personas.filter((persona) => !persona.archived);
  const selectedLabel =
    agents.find((agent) => targetValue('agent', agent.id) === destination)?.name ??
    activePersonas.find((persona) => targetValue('persona', persona.id) === destination)?.name ??
    '';

  async function confirm() {
    if (!destination || included.length === 0 || copiedCharacters > MAX_FORWARDED_TEXT_LENGTH)
      return;
    setIsPending(true);
    setErrorMessage('');
    try {
      const [kind, id] = destination.split(':');
      const conversation = await getOrCreateAiConversation(
        kind === 'agent' ? { agentId: id } : { personaId: id },
      );
      const clientRequestId = crypto.randomUUID();
      const now = new Date().toISOString();
      const contextCard = {
        id: clientRequestId,
        message_count: included.length,
        copied_character_count: copiedCharacters,
        instruction: instruction.trim() || null,
        created_at: now,
        items: included.map((message, index) => ({
          id: message.id,
          source_sender_label:
            message.sender_user_id === currentUserId ? 'You' : contactName || 'Contact',
          copied_content: message.content,
          source_created_at: message.created_at,
          position: index + 1,
          attachments_excluded: (message.attachments ?? []).length > 0,
        })),
      };
      const forwardRequest = {
        clientRequestId,
        instruction: instruction.trim(),
        sourceConversationId,
        sourceMessageIds: included.map((message) => message.id),
        contextCard,
      };
      setPendingAiForward({
        conversationId: conversation.id,
        request: forwardRequest,
      });
      onForwardingStarted();
      navigate(`/app/messages/ai/${conversation.id}`, {
        state: { displayName: selectedLabel, forwardRequest },
      });
    } catch {
      setErrorMessage('The context could not be sent. Review the selection and try again.');
      setIsPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="dialog-overlay">
      <div
        className="dialog-panel forward-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <h2 id={titleId}>Review messages sent to AI</h2>
        <p className="forward-privacy-copy">
          Only the messages shown here will be copied to this AI conversation and processed by
          Council’s configured AI provider.
        </p>
        <p className="forward-snapshot-copy">
          This confirmed text becomes a snapshot. Later edits or deletion in the human conversation
          will not change the copied context.
        </p>

        <label className="form-field">
          <span>AI contact</span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            disabled={agentsPending || personasPending || isPending}
          >
            <option value="">Choose an AI contact</option>
            <optgroup label="Built-in AI contacts">
              {agents.map((agent) => (
                <option key={agent.id} value={targetValue('agent', agent.id)}>
                  {agent.name}
                </option>
              ))}
            </optgroup>
            {activePersonas.length > 0 ? (
              <optgroup label="Custom personas">
                {activePersonas.map((persona) => (
                  <option key={persona.id} value={targetValue('persona', persona.id)}>
                    {persona.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        <ol className="forward-preview-list" aria-label="Messages that will be copied">
          {included.map((message) => {
            const sender = message.sender_user_id === currentUserId ? 'You' : contactName;
            const excludesAttachments = (message.attachments ?? []).length > 0;
            return (
              <li key={message.id} className="forward-preview-item">
                <div>
                  <p className="forward-preview-meta">
                    <strong>{sender}</strong>
                    {' · '}
                    <time dateTime={message.created_at}>
                      {formatFullTimestamp(message.created_at)}
                    </time>
                  </p>
                  <p className="forward-preview-text">{message.content}</p>
                  {excludesAttachments ? (
                    <p className="forward-attachment-warning">
                      Attachments are excluded; only this visible text will be copied.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() =>
                    setIncludedIds((current) => {
                      const next = new Set(current);
                      next.delete(message.id);
                      return next;
                    })
                  }
                  disabled={isPending}
                  aria-label={`Remove message from ${sender}`}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>

        <p className="forward-package-size">
          {included.length} {included.length === 1 ? 'message' : 'messages'} ·{' '}
          {copiedCharacters.toLocaleString()} characters
        </p>

        <label className="form-field">
          <span>Question or instruction (optional)</span>
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            maxLength={MAX_FORWARD_INSTRUCTION_LENGTH}
            rows={4}
            disabled={isPending}
          />
          <small>
            {instruction.length}/{MAX_FORWARD_INSTRUCTION_LENGTH}
          </small>
        </label>

        {errorMessage ? (
          <p className="form-status form-status--error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="dialog-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button"
            onClick={confirm}
            disabled={
              isPending ||
              !destination ||
              included.length === 0 ||
              copiedCharacters > MAX_FORWARDED_TEXT_LENGTH
            }
          >
            {isPending ? 'Sending…' : 'Confirm and send'}
          </button>
        </div>
      </div>
    </div>
  );
}
