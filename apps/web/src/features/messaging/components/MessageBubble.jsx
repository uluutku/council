import { useState } from 'react';
import { DeletedMessage } from './DeletedMessage.jsx';
import { EditMessageForm } from './EditMessageForm.jsx';
import { MessageActions } from './MessageActions.jsx';
import { MessageAttachments } from './MessageAttachments.jsx';
import { MessageReactionPicker } from './MessageReactionPicker.jsx';
import { MessageReactions } from './MessageReactions.jsx';
import { ReplyPreview } from './ReplyPreview.jsx';
import { tokenizeMessageContent } from '../utils/messageContent.js';
import { formatMessageTime, formatFullTimestamp } from '../utils/datetime.js';
import { RECEIPT_LABEL } from '../utils/receipts.js';

function MessageText({ content }) {
  const tokens = tokenizeMessageContent(content);
  return (
    <p className="message-text">
      {tokens.map((token, index) =>
        token.type === 'link' ? (
          <a key={index} href={token.href} target="_blank" rel="noopener noreferrer">
            {token.value}
          </a>
        ) : (
          <span key={index}>{token.value}</span>
        ),
      )}
    </p>
  );
}

export function MessageBubble({
  message,
  isOwn,
  currentUserId,
  canSend,
  senderName,
  showSender,
  groupPosition = 'single',
  replyReference,
  receiptStatus,
  isEditing,
  editState,
  onReply,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleReaction,
  onJumpToReply,
  onOpenImage,
  selectionMode = false,
  selectable = false,
  selected = false,
  onSelect,
  highlighted = false,
}) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const isDeleted = message.deleted_at !== null;
  const attachments = message.attachments ?? [];
  const activeEmojis = (message.reactions ?? [])
    .filter((reaction) => reaction.user_id === currentUserId)
    .map((reaction) => reaction.emoji);

  function handleToggleReaction(emoji, reactedByMe) {
    onToggleReaction(emoji, reactedByMe);
    setReactionsOpen(false);
  }

  return (
    <li
      className={`message-row${highlighted ? ' message-row--highlight' : ''}`}
      data-own={isOwn ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-group={groupPosition}
      id={`message-${message.id}`}
      tabIndex={-1}
    >
      {selectionMode ? (
        <label className="message-select-control">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            onChange={(event) => onSelect?.(event.target.checked)}
            aria-label={
              selectable
                ? `${selected ? 'Remove' : 'Select'} message from ${isOwn ? 'You' : senderName}`
                : 'This message cannot be forwarded'
            }
          />
          <span className="sr-only">
            {selectable ? 'Include this text message' : 'No active text to forward'}
          </span>
        </label>
      ) : null}
      {!isEditing ? (
        <p className="message-meta">
          {!isOwn && showSender ? <span>{senderName} · </span> : null}
          <time dateTime={message.created_at} title={formatFullTimestamp(message.created_at)}>
            {formatMessageTime(message.created_at)}
          </time>
          {!isDeleted && message.edited_at ? (
            <span className="message-edited"> · edited</span>
          ) : null}
          {isOwn && receiptStatus ? (
            <span className="message-receipt" data-status={receiptStatus}>
              {' · '}
              {RECEIPT_LABEL[receiptStatus]}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="message-bubble" data-own={isOwn ? 'true' : undefined}>
        {message.reply_to_message_id ? (
          <ReplyPreview reference={replyReference} variant="bubble" onJump={onJumpToReply} />
        ) : null}

        {isDeleted ? (
          <DeletedMessage />
        ) : (
          <>
            {attachments.length > 0 ? (
              <MessageAttachments attachments={attachments} onOpenImage={onOpenImage} />
            ) : null}
            {isEditing ? (
              <EditMessageForm
                initialContent={message.content ?? ''}
                isSaving={editState?.isSaving}
                errorMessage={editState?.errorMessage}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
              />
            ) : message.content ? (
              <MessageText content={message.content} />
            ) : null}
          </>
        )}

        {!isDeleted ? (
          <MessageReactions
            reactions={message.reactions}
            currentUserId={currentUserId}
            canAdd={canSend}
            onToggle={handleToggleReaction}
          />
        ) : null}

        {reactionsOpen ? (
          <MessageReactionPicker
            activeEmojis={activeEmojis}
            disabled={!canSend}
            onToggle={handleToggleReaction}
          />
        ) : null}
      </div>

      {!isEditing && !selectionMode ? (
        <MessageActions
          isOwn={isOwn}
          canSend={canSend}
          isDeleted={isDeleted}
          reactionsOpen={reactionsOpen}
          onReply={onReply}
          onToggleReactions={() => setReactionsOpen((open) => !open)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
    </li>
  );
}
