import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble.jsx';
import { OptimisticMessage } from './OptimisticMessage.jsx';
import { DateSeparator } from './DateSeparator.jsx';
import { MessageListSkeleton } from './MessagingFeedback.jsx';
import { isSameCalendarDay, isSameMinute } from '../utils/datetime.js';
import { previewExcerpt } from '../utils/messageContent.js';
import { deriveOutgoingReceipt } from '../utils/receipts.js';
import { peerName } from '../utils/peer.js';

const NEAR_BOTTOM_PX = 120;
const NEAR_TOP_PX = 60;

function buildReplyReference(message, messageById, currentUserId, peer) {
  const target = messageById.get(message.reply_to_message_id);
  if (!target) {
    return {
      authorLabel: 'Replying to',
      excerpt: 'Open original message',
      muted: true,
      canJump: true,
    };
  }

  const authorLabel = target.sender_user_id === currentUserId ? 'You' : peerName(peer);
  if (target.deleted_at !== null) {
    return { authorLabel, excerpt: 'Message deleted', muted: true, canJump: true };
  }
  return {
    authorLabel,
    excerpt: previewExcerpt(target.content ?? '', 80),
    muted: false,
    canJump: true,
  };
}

export function MessageList({
  messages,
  outgoing,
  currentUserId,
  peer,
  canSend,
  peerReceipt,
  isInitialLoading,
  hasOlder,
  isFetchingOlder,
  onLoadOlder,
  editingMessageId,
  editState,
  onReply,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleReaction,
  onRetry,
  onRemoveFailed,
  onOpenImage,
  selectionMode = false,
  selectedMessageIds = new Set(),
  onSelectMessage,
  highlightMessageId = null,
  onLoadMessageWindow,
}) {
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const prevBottomKeyRef = useRef(null);
  const prevFirstSeqRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const prevOutgoingCountRef = useRef(0);
  const olderFetchHeightRef = useRef(null);
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  const messageById = new Map(messages.map((message) => [message.id, message]));
  const newestOwn = [...messages]
    .reverse()
    .find((message) => message.sender_user_id === currentUserId && message.deleted_at === null);

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    setShowNewIndicator(false);
  }, []);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    nearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_PX;
    if (nearBottomRef.current) setShowNewIndicator(false);

    if (node.scrollTop < NEAR_TOP_PX && hasOlder && !isFetchingOlder) {
      olderFetchHeightRef.current = node.scrollHeight;
      onLoadOlder();
    }
  }, [hasOlder, isFetchingOlder, onLoadOlder]);

  // Manage scroll position across message changes: keep the viewport stable when
  // older messages are prepended, scroll to the newest on initial load and own
  // sends, and otherwise surface a "new messages" indicator unless already near
  // the bottom.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const firstSeq = messages.length > 0 ? messages[0].sequence : null;
    const lastMessage = messages[messages.length - 1];
    const lastOutgoing = outgoing[outgoing.length - 1];
    const bottomKey = lastOutgoing
      ? `o:${lastOutgoing.clientMessageId}:${lastOutgoing.status}`
      : lastMessage
        ? `m:${lastMessage.id}`
        : null;

    const isFirstRender = prevBottomKeyRef.current === null;
    const prependedOlder =
      prevFirstSeqRef.current !== null && firstSeq !== null && firstSeq < prevFirstSeqRef.current;
    const ownSend = outgoing.length > prevOutgoingCountRef.current;
    const bottomChanged = bottomKey !== prevBottomKeyRef.current;

    if (isFirstRender) {
      node.scrollTop = node.scrollHeight;
    } else if (prependedOlder) {
      // Preserve the reading position: grow upward by the height delta.
      const baseHeight = olderFetchHeightRef.current ?? prevScrollHeightRef.current;
      node.scrollTop += node.scrollHeight - baseHeight;
      olderFetchHeightRef.current = null;
    } else if (bottomChanged) {
      if (ownSend || nearBottomRef.current) {
        node.scrollTop = node.scrollHeight;
        setShowNewIndicator(false);
      } else {
        setShowNewIndicator(true);
      }
    }

    prevBottomKeyRef.current = bottomKey;
    prevFirstSeqRef.current = firstSeq;
    prevScrollHeightRef.current = node.scrollHeight;
    prevOutgoingCountRef.current = outgoing.length;
  }, [messages, outgoing]);

  const jumpToMessage = useCallback(
    async (messageId) => {
      let element = document.getElementById(`message-${messageId}`);
      if (!element && onLoadMessageWindow) {
        try {
          await onLoadMessageWindow(messageId);
        } catch {
          return;
        }
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        element = document.getElementById(`message-${messageId}`);
      }
      if (!element) return;
      element.scrollIntoView?.({ block: 'center' });
      setHighlightedMessageId(messageId);
      element.focus({ preventScroll: true });
      window.setTimeout(
        () => setHighlightedMessageId((current) => (current === messageId ? null : current)),
        4_000,
      );
    },
    [onLoadMessageWindow],
  );

  useEffect(() => {
    if (highlightMessageId && messages.some((message) => message.id === highlightMessageId)) {
      window.requestAnimationFrame(() => jumpToMessage(highlightMessageId));
    }
  }, [highlightMessageId, jumpToMessage, messages]);

  // Announce arriving messages without stealing focus.
  useEffect(() => {
    if (nearBottomRef.current) setShowNewIndicator(false);
  }, [messages.length]);

  if (isInitialLoading) {
    return (
      <div className="message-list-region">
        <MessageListSkeleton />
      </div>
    );
  }

  if (messages.length === 0 && outgoing.length === 0) {
    return (
      <div className="message-list-region">
        <div className="empty-state empty-state--conversation">
          <p className="empty-state-title">Start your conversation.</p>
        </div>
      </div>
    );
  }

  let lastSenderId = null;
  let lastTimestamp = null;
  const rows = [];

  for (const [index, message] of messages.entries()) {
    if (!lastTimestamp || !isSameCalendarDay(lastTimestamp, message.created_at)) {
      rows.push(<DateSeparator key={`sep-${message.id}`} timestamp={message.created_at} />);
      lastSenderId = null;
    }
    const previousTimestamp = lastTimestamp;
    const sameDayAsPrevious = previousTimestamp
      ? isSameCalendarDay(previousTimestamp, message.created_at)
      : false;
    lastTimestamp = message.created_at;

    const isOwn = message.sender_user_id === currentUserId;
    const previousSenderId = lastSenderId;
    lastSenderId = message.sender_user_id;
    const nextMessage = messages[index + 1];
    const joinsPrevious =
      sameDayAsPrevious &&
      previousSenderId === message.sender_user_id &&
      isSameMinute(previousTimestamp, message.created_at);
    const joinsNext =
      Boolean(nextMessage) &&
      isSameCalendarDay(message.created_at, nextMessage.created_at) &&
      nextMessage.sender_user_id === message.sender_user_id &&
      isSameMinute(message.created_at, nextMessage.created_at);
    const groupPosition =
      joinsPrevious && joinsNext
        ? 'middle'
        : joinsPrevious
          ? 'end'
          : joinsNext
            ? 'start'
            : 'single';
    const showSender = !isOwn && !joinsPrevious;

    rows.push(
      <MessageBubble
        key={message.id}
        message={message}
        isOwn={isOwn}
        currentUserId={currentUserId}
        canSend={canSend}
        senderName={peerName(peer)}
        showSender={showSender}
        showTimestamp={!joinsPrevious}
        groupPosition={groupPosition}
        replyReference={
          message.reply_to_message_id
            ? buildReplyReference(message, messageById, currentUserId, peer)
            : null
        }
        receiptStatus={
          newestOwn && message.id === newestOwn.id
            ? deriveOutgoingReceipt(message.sequence, peerReceipt)
            : null
        }
        isEditing={editingMessageId === message.id}
        editState={editState}
        onReply={() => onReply(message)}
        onEdit={() => onEdit(message)}
        onCancelEdit={onCancelEdit}
        onSaveEdit={(content) => onSaveEdit(message, content)}
        onDelete={() => onDelete(message)}
        onToggleReaction={(emoji, reactedByMe) => onToggleReaction(message, emoji, reactedByMe)}
        onJumpToReply={() => jumpToMessage(message.reply_to_message_id)}
        onOpenImage={onOpenImage}
        selectionMode={selectionMode}
        selectable={message.deleted_at === null && Boolean(message.content?.trim())}
        selected={selectedMessageIds.has(message.id)}
        onSelect={(selected) => onSelectMessage?.(message, selected)}
        highlighted={message.id === highlightedMessageId}
      />,
    );
  }

  for (const item of outgoing) {
    rows.push(
      <OptimisticMessage
        key={item.clientMessageId}
        item={item}
        onRetry={onRetry}
        onRemove={onRemoveFailed}
      />,
    );
  }

  return (
    <div className="message-list-region">
      <div className="message-list-scroll" ref={scrollRef} onScroll={handleScroll}>
        {hasOlder ? (
          <div className="message-load-older">
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => {
                if (scrollRef.current) olderFetchHeightRef.current = scrollRef.current.scrollHeight;
                onLoadOlder();
              }}
              disabled={isFetchingOlder}
            >
              {isFetchingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        ) : null}
        <ol
          className="message-list"
          aria-label="Messages"
          aria-live="polite"
          aria-relevant="additions"
        >
          {rows}
        </ol>
      </div>
      {showNewIndicator ? (
        <button type="button" className="new-messages-indicator" onClick={scrollToBottom}>
          New messages ↓
        </button>
      ) : null}
    </div>
  );
}
