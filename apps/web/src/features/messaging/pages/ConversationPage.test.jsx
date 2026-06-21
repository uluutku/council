import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationPage } from './ConversationPage.jsx';
import { renderConversationRoute } from '../test/renderWithMessaging.jsx';
import {
  CONVERSATION_ID,
  ME_ID,
  PEER_ID,
  makeConversation,
  makeMessage,
  makeReceipt,
  resetMessageCounter,
} from '../test/fixtures.js';
import { MessagingApiError } from '../api/messagingErrors.js';

vi.mock('../api/messagingApi.js', () => ({
  createOrGetDirectConversation: vi.fn(),
  listMyConversations: vi.fn(),
  listConversationMessages: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  addMessageReaction: vi.fn(),
  removeMessageReaction: vi.fn(),
  markConversationDelivered: vi.fn(),
  markConversationRead: vi.fn(),
}));

let capturedConversationEvent = null;
vi.mock('../realtime/conversationSubscription.js', () => ({
  subscribeToConversationEvents: vi.fn(({ onEvent, onStatus }) => {
    capturedConversationEvent = onEvent;
    onStatus?.('subscribed');
    return { unsubscribe: vi.fn() };
  }),
}));

import * as messagingApi from '../api/messagingApi.js';

// A small in-memory server model so that optimistic sends, realtime-triggered
// refetches, and idempotent retries all converge against one source of truth.
function installServer({ conversation = makeConversation(), messages = [] } = {}) {
  const state = { conversation, messages, cidToId: new Map() };

  messagingApi.listMyConversations.mockResolvedValue([state.conversation]);
  messagingApi.listConversationMessages.mockImplementation(async (input) => {
    const sorted = [...state.messages].sort((a, b) => b.sequence - a.sequence);
    const filtered = input.before_sequence
      ? sorted.filter((message) => message.sequence < input.before_sequence)
      : sorted;
    return filtered.slice(0, input.result_limit ?? 50);
  });
  messagingApi.sendMessage.mockImplementation(
    async ({ client_message_id, content, reply_to_message_id }) => {
      const existingId = state.cidToId.get(client_message_id);
      if (existingId) {
        return state.messages.find((message) => message.id === existingId);
      }
      const message = makeMessage({
        sender_user_id: ME_ID,
        content,
        reply_to_message_id: reply_to_message_id ?? null,
      });
      state.cidToId.set(client_message_id, message.id);
      state.messages.push(message);
      return message;
    },
  );
  messagingApi.editMessage.mockImplementation(async ({ message_id, content }) => {
    const message = state.messages.find((entry) => entry.id === message_id);
    const updated = { ...message, content, edited_at: '2026-06-22T11:00:00+00:00' };
    state.messages = state.messages.map((entry) => (entry.id === message_id ? updated : entry));
    return updated;
  });
  messagingApi.deleteMessage.mockImplementation(async (messageId) => {
    const message = state.messages.find((entry) => entry.id === messageId);
    const tombstone = {
      ...message,
      content: null,
      deleted_at: '2026-06-22T11:30:00+00:00',
      reactions: [],
    };
    state.messages = state.messages.map((entry) => (entry.id === messageId ? tombstone : entry));
    return tombstone;
  });
  messagingApi.addMessageReaction.mockImplementation(async ({ message_id, emoji }) => {
    const reaction = { message_id, user_id: ME_ID, emoji, created_at: '2026-06-22T11:00:00+00:00' };
    state.messages = state.messages.map((entry) =>
      entry.id === message_id ? { ...entry, reactions: [...entry.reactions, reaction] } : entry,
    );
    return reaction;
  });
  messagingApi.removeMessageReaction.mockImplementation(async ({ message_id, emoji }) => {
    state.messages = state.messages.map((entry) =>
      entry.id === message_id
        ? {
            ...entry,
            reactions: entry.reactions.filter(
              (reaction) => !(reaction.user_id === ME_ID && reaction.emoji === emoji),
            ),
          }
        : entry,
    );
    return { removed: true };
  });
  messagingApi.markConversationDelivered.mockResolvedValue(makeReceipt());
  messagingApi.markConversationRead.mockResolvedValue(makeReceipt());

  return state;
}

function openConversation(state) {
  return renderConversationRoute(<ConversationPage />, {
    conversationId: CONVERSATION_ID,
    ...state,
  });
}

beforeEach(() => {
  resetMessageCounter();
  capturedConversationEvent = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConversationPage rendering', () => {
  it('renders own and peer messages, edited state, deleted tombstone, and a reply reference', async () => {
    const original = makeMessage({ sender_user_id: PEER_ID, content: 'how are you?' });
    const edited = makeMessage({
      sender_user_id: ME_ID,
      content: 'doing well',
      edited_at: '2026-06-22T10:30:00+00:00',
    });
    const deleted = makeMessage({
      sender_user_id: PEER_ID,
      content: null,
      deleted_at: '2026-06-22T10:40:00+00:00',
    });
    const reply = makeMessage({
      sender_user_id: ME_ID,
      content: 'replying now',
      reply_to_message_id: original.id,
    });
    installServer({ messages: [original, edited, deleted, reply] });

    openConversation();

    expect(await screen.findByText('doing well')).toBeInTheDocument();
    expect(screen.getByText('edited', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Message deleted')).toBeInTheDocument();
    expect(screen.getByText('replying now')).toBeInTheDocument();
    // "how are you?" appears both as the message body and as the reply excerpt.
    expect(screen.getAllByText('how are you?')).toHaveLength(2);
    expect(
      screen.getByText('how are you?', { selector: '.reply-preview-excerpt' }),
    ).toBeInTheDocument();
  });

  it('shows a generic unavailable screen for an inaccessible conversation', async () => {
    installServer();
    messagingApi.listConversationMessages.mockRejectedValue(
      new MessagingApiError('conversation_not_found'),
    );
    messagingApi.listMyConversations.mockResolvedValue([]);

    openConversation();

    expect(await screen.findByText('This conversation is unavailable.')).toBeInTheDocument();
  });

  it('shows the empty conversation prompt when there are no messages', async () => {
    installServer({ messages: [] });
    openConversation();
    expect(await screen.findByText('Start your conversation.')).toBeInTheDocument();
  });
});

describe('ConversationPage optimistic send', () => {
  it('shows an optimistic message, confirms it, and never duplicates', async () => {
    const user = userEvent.setup();
    installServer({ messages: [] });
    openConversation();

    await screen.findByText('Start your conversation.');
    await user.type(screen.getByLabelText('Message'), 'Hello there');
    await user.keyboard('{Enter}');

    // Converges to exactly one rendered message.
    await waitFor(() => {
      expect(screen.getAllByText('Hello there')).toHaveLength(1);
    });
    expect(messagingApi.sendMessage).toHaveBeenCalledTimes(1);

    // A realtime echo for the same message triggers a refetch but no duplicate.
    capturedConversationEvent?.({
      id: '99999999-9999-4999-8999-999999999999',
      version: 1,
      event: 'message.created',
      occurred_at: '2026-06-22T10:00:01+00:00',
      conversation_id: CONVERSATION_ID,
      entity_id: 'aaaaaaaa-0000-4000-8000-000000000001',
      sequence: 1,
      actor_user_id: ME_ID,
      last_sequence: 1,
    });

    await waitFor(() => {
      expect(screen.getAllByText('Hello there')).toHaveLength(1);
    });
  });

  it('keeps a failed send visible and converges to one message after retry with the same client id', async () => {
    const user = userEvent.setup();
    installServer({ messages: [] });
    // Fail the first attempt, then fall back to the converging implementation.
    const realImplementation = messagingApi.sendMessage.getMockImplementation();
    messagingApi.sendMessage.mockRejectedValueOnce(new MessagingApiError('backend_unavailable'));

    openConversation();
    await screen.findByText('Start your conversation.');
    await user.type(screen.getByLabelText('Message'), 'Retry me');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Not sent')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    // Restore converging behaviour for the retry.
    messagingApi.sendMessage.mockImplementation(realImplementation);

    await waitFor(() => {
      expect(screen.getAllByText('Retry me')).toHaveLength(1);
    });

    const [firstCall, secondCall] = messagingApi.sendMessage.mock.calls;
    expect(firstCall[0].client_message_id).toBe(secondCall[0].client_message_id);
  });
});

describe('ConversationPage edit, delete, reactions', () => {
  it('edits the sender’s own message', async () => {
    const user = userEvent.setup();
    const message = makeMessage({ sender_user_id: ME_ID, content: 'first draft' });
    installServer({ messages: [message] });
    openConversation();

    await screen.findByText('first draft');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByLabelText('Edit message');
    await user.clear(editor);
    await user.type(editor, 'final version');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('final version')).toBeInTheDocument();
    expect(messagingApi.editMessage).toHaveBeenCalledWith({
      message_id: message.id,
      content: 'final version',
    });
  });

  it('does not offer edit/delete on another user’s message', async () => {
    const message = makeMessage({ sender_user_id: PEER_ID, content: 'their message' });
    installServer({ messages: [message] });
    openConversation();

    await screen.findByText('their message');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('deletes a message after confirmation and shows a tombstone', async () => {
    const user = userEvent.setup();
    const message = makeMessage({ sender_user_id: ME_ID, content: 'delete me' });
    installServer({ messages: [message] });
    openConversation();

    await screen.findByText('delete me');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete message' }));

    expect(await screen.findByText('Message deleted')).toBeInTheDocument();
    expect(screen.queryByText('delete me')).not.toBeInTheDocument();
  });

  it('adds a reaction that reconciles through a refetch', async () => {
    const user = userEvent.setup();
    const message = makeMessage({ sender_user_id: PEER_ID, content: 'react to me' });
    installServer({ messages: [message] });
    openConversation();

    await screen.findByText('react to me');
    await user.click(screen.getByRole('button', { name: 'React' }));
    await user.click(screen.getByRole('button', { name: /Thumbs up/ }));

    expect(
      await screen.findByRole('button', { name: /Thumbs up, 1, you reacted/ }),
    ).toBeInTheDocument();
  });
});

describe('ConversationPage messaging unavailable', () => {
  it('hides the composer, shows a generic banner, and still allows deletion', async () => {
    const message = makeMessage({ sender_user_id: ME_ID, content: 'old message' });
    installServer({ conversation: makeConversation({ can_send: false }), messages: [message] });
    openConversation();

    expect(
      await screen.findByText('Messaging is currently unavailable for this conversation.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    // Deletion remains available even when messaging is unavailable.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    // Editing and reacting are not offered.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'React' })).not.toBeInTheDocument();
  });
});
