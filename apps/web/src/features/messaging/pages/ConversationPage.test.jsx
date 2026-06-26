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
  makeAttachment,
  makeMessage,
  makeReceipt,
  resetMessageCounter,
} from '../test/fixtures.js';
import { MessagingApiError } from '../api/messagingErrors.js';

vi.mock('../api/messagingApi.js', () => ({
  createOrGetDirectConversation: vi.fn(),
  listMyConversations: vi.fn(),
  listConversationMessages: vi.fn(),
  getMessageWindow: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  addMessageReaction: vi.fn(),
  removeMessageReaction: vi.fn(),
  markConversationDelivered: vi.fn(),
  markConversationRead: vi.fn(),
}));

vi.mock('../../ai/api/aiApi.js', () => ({
  listAiAgents: vi.fn().mockResolvedValue([
    {
      id: '44444444-4444-4444-8444-444444444444',
      slug: 'council-assistant',
      name: 'Council Assistant',
      description: 'General assistant',
      avatar_key: null,
      enabled: true,
    },
  ]),
  listMyCustomPersonas: vi.fn().mockResolvedValue([
    {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Active Persona',
      description: '',
      instructions: 'Help.',
      tone: 'balanced',
      verbosity: 'concise',
      avatar_path: null,
      archived: false,
      created_at: '2026-06-22T10:00:00+00:00',
      updated_at: '2026-06-22T10:00:00+00:00',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Archived Persona',
      description: '',
      instructions: 'Help.',
      tone: 'balanced',
      verbosity: 'concise',
      avatar_path: null,
      archived: true,
      created_at: '2026-06-22T10:00:00+00:00',
      updated_at: '2026-06-22T10:00:00+00:00',
    },
  ]),
  getOrCreateAiConversation: vi.fn().mockResolvedValue({
    id: '77777777-7777-4777-8777-777777777777',
  }),
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

function setNavigatorOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

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
  messagingApi.getMessageWindow.mockImplementation(async (_conversationId, messageId) => {
    const target = state.messages.find((message) => message.id === messageId);
    if (!target) return [];
    return state.messages
      .filter((message) => Math.abs(message.sequence - target.sequence) <= 20)
      .sort((a, b) => a.sequence - b.sequence);
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
  localStorage.clear();
  setNavigatorOnline(true);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setNavigatorOnline(true);
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

  it('loads the original message window before jumping to an unloaded reply target', async () => {
    const user = userEvent.setup();
    const original = makeMessage({ sender_user_id: PEER_ID, content: 'older original' });
    const reply = makeMessage({
      sender_user_id: ME_ID,
      content: 'reply loaded first',
      reply_to_message_id: original.id,
    });
    installServer({ messages: [original, reply] });
    messagingApi.listConversationMessages.mockResolvedValueOnce([reply]);

    openConversation();

    expect(await screen.findByText('reply loaded first')).toBeInTheDocument();
    expect(screen.queryByText('older original')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open original message/i }));

    expect(
      await screen.findByText('older original', { selector: '.message-text span' }),
    ).toBeInTheDocument();
    expect(messagingApi.getMessageWindow).toHaveBeenCalledWith(CONVERSATION_ID, original.id);
  });

  it('shows an accessible error when a deep-linked message window cannot load', async () => {
    const reply = makeMessage({
      sender_user_id: ME_ID,
      content: 'reply loaded first',
      reply_to_message_id: '99999999-9999-4999-8999-999999999999',
    });
    installServer({ messages: [reply] });
    messagingApi.getMessageWindow.mockRejectedValueOnce(new MessagingApiError('message_not_found'));

    openConversation({
      state: { messageId: '99999999-9999-4999-8999-999999999999' },
    });

    expect(await screen.findByText('reply loaded first')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That message is no longer available.',
    );
  });

  it('shows the empty conversation prompt when there are no messages', async () => {
    installServer({ messages: [] });
    openConversation();
    expect(await screen.findByText('Start your conversation.')).toBeInTheDocument();
  });

  it('shows one timestamp for same-sender messages sent in the same minute', async () => {
    installServer({
      messages: [
        makeMessage({
          sender_user_id: PEER_ID,
          content: 'first same minute',
          created_at: '2026-06-22T10:00:05+00:00',
        }),
        makeMessage({
          sender_user_id: PEER_ID,
          content: 'second same minute',
          created_at: '2026-06-22T10:00:45+00:00',
        }),
        makeMessage({
          sender_user_id: PEER_ID,
          content: 'next minute',
          created_at: '2026-06-22T10:01:00+00:00',
        }),
      ],
    });
    const { container } = openConversation();

    expect(await screen.findByText('next minute')).toBeInTheDocument();
    expect(container.querySelectorAll('.message-meta time')).toHaveLength(2);
  });

  it('renders outgoing receipt ticks for sent, delivered, and read states', async () => {
    const message = makeMessage({ sender_user_id: ME_ID, content: 'receipt tracked' });
    installServer({ messages: [message] });
    openConversation();

    expect(await screen.findByText('receipt tracked')).toBeInTheDocument();
    expect(screen.getByLabelText('Sent')).toBeInTheDocument();

    capturedConversationEvent?.({
      id: '99999999-9999-4999-8999-999999999991',
      version: 1,
      event: 'receipt.changed',
      occurred_at: '2026-06-22T10:00:02+00:00',
      conversation_id: CONVERSATION_ID,
      entity_id: CONVERSATION_ID,
      actor_user_id: PEER_ID,
      read_sequence: 0,
      delivered_sequence: message.sequence,
    });

    expect(await screen.findByLabelText('Delivered')).toBeInTheDocument();

    capturedConversationEvent?.({
      id: '99999999-9999-4999-8999-999999999992',
      version: 1,
      event: 'receipt.changed',
      occurred_at: '2026-06-22T10:00:03+00:00',
      conversation_id: CONVERSATION_ID,
      entity_id: CONVERSATION_ID,
      actor_user_id: PEER_ID,
      read_sequence: message.sequence,
      delivered_sequence: message.sequence,
    });

    expect(await screen.findByLabelText('Read')).toBeInTheDocument();
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
    // Fail the first attempt with a non-network error, then fall back to the converging
    // implementation. Network/backend-unavailable text sends are now durable queued.
    const realImplementation = messagingApi.sendMessage.getMockImplementation();
    messagingApi.sendMessage.mockRejectedValueOnce(new MessagingApiError('unknown_error'));

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

  it('restores an unsent text draft after the conversation remounts', async () => {
    const user = userEvent.setup();
    installServer({ messages: [] });
    const firstRender = openConversation();

    await screen.findByText('Start your conversation.');
    await user.type(screen.getByLabelText('Message'), 'persist this draft');
    firstRender.unmount();

    openConversation();
    expect(await screen.findByLabelText('Message')).toHaveValue('persist this draft');
  });

  it('queues a text message while offline and drains it on reconnect', async () => {
    const user = userEvent.setup();
    installServer({ messages: [] });
    setNavigatorOnline(false);
    openConversation();

    await screen.findByText('Start your conversation.');
    await user.type(screen.getByLabelText('Message'), 'queued while offline');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Queued')).toBeInTheDocument();
    expect(messagingApi.sendMessage).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(screen.getAllByText('queued while offline')).toHaveLength(1);
    });
    expect(screen.queryByText('Queued')).not.toBeInTheDocument();
    expect(messagingApi.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationPage message forwarding', () => {
  it('selects active text, previews exact content, removes an item, and excludes attachments', async () => {
    const user = userEvent.setup();
    const own = makeMessage({ sender_user_id: ME_ID, content: 'Decision one' });
    const withAttachment = makeMessage({
      sender_user_id: PEER_ID,
      content: 'Question two',
      attachments: [makeAttachment()],
    });
    const deleted = makeMessage({
      sender_user_id: PEER_ID,
      content: null,
      deleted_at: '2026-06-22T10:30:00+00:00',
    });
    const attachmentOnly = makeMessage({
      sender_user_id: PEER_ID,
      content: null,
      attachments: [makeAttachment()],
    });
    installServer({ messages: [own, withAttachment, deleted, attachmentOnly] });
    openConversation();

    await screen.findByText('Decision one');
    await user.click(screen.getByRole('button', { name: 'Select messages' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select message from You' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select message from Bjorn' }));
    expect(screen.getByText('2 selected · maximum 20')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send to AI' }));
    const dialog = screen.getByRole('dialog', { name: 'Review messages sent to AI' });
    expect(
      within(dialog).getByText(/Only the messages shown here will be copied/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Decision one')).toBeInTheDocument();
    expect(within(dialog).getByText('Question two')).toBeInTheDocument();
    expect(within(dialog).getByText(/Attachments are excluded/i)).toBeInTheDocument();
    expect(within(dialog).getByText('2 messages · 24 characters')).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'Active Persona' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: 'Archived Persona' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Remove message from Bjorn' }));
    expect(within(dialog).queryByText('Question two')).toBeNull();
    expect(within(dialog).getByText('1 message · 12 characters')).toBeInTheDocument();
  });

  it('enforces the twenty-message selection limit and cancel clears selection mode', async () => {
    const user = userEvent.setup();
    const messages = Array.from({ length: 21 }, (_, index) =>
      makeMessage({ content: `Forwardable message ${index + 1}` }),
    );
    installServer({ messages });
    openConversation();

    await screen.findByText('Forwardable message 1');
    await user.click(screen.getByRole('button', { name: 'Select messages' }));
    const checkboxes = screen.getAllByRole('checkbox', { name: /Select message from You/ });
    for (const checkbox of checkboxes) await user.click(checkbox);

    expect(screen.getByText('20 selected · maximum 20')).toBeInTheDocument();
    expect(screen.getByText('You can send up to 20 messages at a time.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/selected · maximum 20/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select messages' })).toBeInTheDocument();
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
