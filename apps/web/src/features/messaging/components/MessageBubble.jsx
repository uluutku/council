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
      className="message-row"
      data-own={isOwn ? 'true' : undefined}
      id={`message-${message.id}`}
      tabIndex={-1}
    >
      <div className="message-bubble" data-own={isOwn ? 'true' : undefined}>
        {showSender && !isOwn ? <p className="message-sender">{senderName}</p> : null}

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

        {!isEditing ? (
          <p className="message-meta">
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

      {!isEditing ? (
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
