import { describe, expect, it, vi } from 'vitest';
import { subscribeToConversationEvents } from './conversationSubscription.js';
import { subscribeToInboxEvents } from './inboxSubscription.js';
import { getRealtimeQueryImpacts } from './queryImpacts.js';
import { assessRealtimeSequence } from './reconciliation.js';
import { normalizeRealtimeStatus } from './realtimeErrors.js';
import { conversationRealtimeTopic, userInboxRealtimeTopic } from './topics.js';

const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = '11111111-1111-4111-8111-111111111111';
const MESSAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TIMESTAMP = '2026-06-22T19:00:00+00:00';

function createRealtimeMock() {
  const handlers = new Map();
  let subscribeCallback;
  const channel = {
    on: vi.fn((_type, filter, handler) => {
      handlers.set(filter.event, handler);
      return channel;
    }),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return channel;
    }),
  };
  const supabase = {
    realtime: {
      setAuth: vi.fn().mockResolvedValue(undefined),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue('ok'),
  };

  return {
    channel,
    handlers,
    supabase,
    emit(event, payload) {
      handlers.get(event)?.({ type: 'broadcast', event, payload });
    },
    status(status, error) {
      subscribeCallback?.(status, error);
    },
  };
}

function messageCreatedEvent(overrides = {}) {
  return {
    id: EVENT_ID,
    version: 1,
    event: 'message.created',
    occurred_at: TIMESTAMP,
    conversation_id: CONVERSATION,
    entity_id: MESSAGE,
    sequence: 4,
    actor_user_id: USER,
    last_sequence: 4,
    ...overrides,
  };
}

describe('Realtime topic helpers', () => {
  it('builds deterministic conversation and inbox topics', () => {
    expect(conversationRealtimeTopic(CONVERSATION)).toBe(`conversation:${CONVERSATION}`);
    expect(userInboxRealtimeTopic(USER)).toBe(`user:${USER}:inbox`);
  });

  it('rejects invalid UUIDs and arbitrary suffixes', () => {
    expect(() => conversationRealtimeTopic('not-a-uuid')).toThrow();
    expect(() => userInboxRealtimeTopic(`${USER}:other`)).toThrow();
  });
});

describe('private conversation subscription', () => {
  it('authenticates and creates a private deterministic channel', async () => {
    const mock = createRealtimeMock();
    const statuses = [];
    await subscribeToConversationEvents({
      supabase: mock.supabase,
      conversationId: CONVERSATION,
      onEvent: vi.fn(),
      onStatus: (status) => statuses.push(status),
      onError: vi.fn(),
    });

    expect(mock.supabase.realtime.setAuth).toHaveBeenCalledOnce();
    expect(mock.supabase.channel).toHaveBeenCalledWith(`conversation:${CONVERSATION}`, {
      config: { private: true },
    });
    expect(statuses).toEqual(['connecting']);
    expect(mock.handlers.has('message.created')).toBe(true);
    expect(mock.handlers.has('messaging.availability_changed')).toBe(true);
  });

  it('delivers a strictly validated event', async () => {
    const mock = createRealtimeMock();
    const onEvent = vi.fn();
    await subscribeToConversationEvents({
      supabase: mock.supabase,
      conversationId: CONVERSATION,
      onEvent,
    });

    mock.emit('message.created', messageCreatedEvent());
    expect(onEvent).toHaveBeenCalledWith(messageCreatedEvent());
  });

  it('rejects malformed or sensitive payloads without logging them', async () => {
    const mock = createRealtimeMock();
    const onEvent = vi.fn();
    const onError = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await subscribeToConversationEvents({
      supabase: mock.supabase,
      conversationId: CONVERSATION,
      onEvent,
      onError,
    });

    mock.emit(
      'message.created',
      messageCreatedEvent({ content: 'private content must not be logged' }),
    );
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].category).toBe('invalid_event');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('normalizes provider statuses and requests reconciliation after errors', async () => {
    const mock = createRealtimeMock();
    const statuses = [];
    const onError = vi.fn();
    await subscribeToConversationEvents({
      supabase: mock.supabase,
      conversationId: CONVERSATION,
      onEvent: vi.fn(),
      onStatus: (status) => statuses.push(status),
      onError,
    });

    mock.status('SUBSCRIBED');
    mock.status('CHANNEL_ERROR', new Error('socket failed'));
    mock.status('TIMED_OUT', new Error('timed out'));
    mock.status('CLOSED');

    expect(statuses).toEqual([
      'connecting',
      'subscribed',
      'channel_error',
      'reconnecting',
      'timed_out',
      'reconnecting',
      'closed',
    ]);
    expect(onError.mock.calls.map(([error]) => error.category)).toEqual([
      'channel_error',
      'timed_out',
    ]);
  });

  it('cleans up once even when called repeatedly', async () => {
    const mock = createRealtimeMock();
    const subscription = await subscribeToConversationEvents({
      supabase: mock.supabase,
      conversationId: CONVERSATION,
      onEvent: vi.fn(),
    });

    await subscription.unsubscribe();
    await subscription.unsubscribe();
    expect(mock.supabase.removeChannel).toHaveBeenCalledOnce();
    expect(mock.supabase.removeChannel).toHaveBeenCalledWith(mock.channel);
  });
});

describe('private inbox subscription', () => {
  it('uses the private owner topic and expected event set', async () => {
    const mock = createRealtimeMock();
    await subscribeToInboxEvents({
      supabase: mock.supabase,
      userId: USER,
      onEvent: vi.fn(),
    });

    expect(mock.supabase.channel).toHaveBeenCalledWith(`user:${USER}:inbox`, {
      config: { private: true },
    });
    expect([...mock.handlers.keys()].sort()).toEqual(
      ['conversation.changed', 'conversation.created', 'messaging.availability_changed'].sort(),
    );
  });

  it('delivers a valid inbox event and rejects an availability cause', async () => {
    const mock = createRealtimeMock();
    const onEvent = vi.fn();
    const onError = vi.fn();
    await subscribeToInboxEvents({
      supabase: mock.supabase,
      userId: USER,
      onEvent,
      onError,
    });

    const valid = {
      id: EVENT_ID,
      version: 1,
      event: 'conversation.created',
      occurred_at: TIMESTAMP,
      conversation_id: CONVERSATION,
    };
    mock.emit('conversation.created', valid);
    mock.emit('messaging.availability_changed', {
      ...valid,
      event: 'messaging.availability_changed',
      cause: 'blocked',
    });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith(valid);
    expect(onError.mock.calls[0][0].category).toBe('invalid_event');
  });
});

describe('status and reconciliation helpers', () => {
  it('normalizes every provider status without exposing provider strings', () => {
    expect(normalizeRealtimeStatus('SUBSCRIBED')).toBe('subscribed');
    expect(normalizeRealtimeStatus('CHANNEL_ERROR')).toBe('channel_error');
    expect(normalizeRealtimeStatus('TIMED_OUT')).toBe('timed_out');
    expect(normalizeRealtimeStatus('CLOSED')).toBe('closed');
    expect(normalizeRealtimeStatus('unexpected')).toBe('connecting');
  });

  it.each([
    [{ knownLastSequence: null, eventSequence: 1 }, 'no_gap'],
    [{ knownLastSequence: 40, eventSequence: 41 }, 'no_gap'],
    [{ knownLastSequence: 40, eventSequence: 40 }, 'no_gap'],
    [{ knownLastSequence: 40, eventSequence: 39 }, 'no_gap'],
    [{ knownLastSequence: 40, eventSequence: 43 }, 'possible_gap'],
    [{ knownLastSequence: 40, eventSequence: null }, 'full_refresh'],
    [{ knownLastSequence: 40, eventSequence: 41, reconciliationRequired: true }, 'full_refresh'],
  ])('assesses sequence state %#', (input, expected) => {
    expect(assessRealtimeSequence(input)).toBe(expected);
  });
});

describe('event-to-query impact mapping', () => {
  it('maps message creation to messages and conversation list only', () => {
    expect(getRealtimeQueryImpacts('message.created')).toEqual([
      'conversation_messages',
      'conversation_list',
    ]);
  });

  it('maps reaction changes only to message state', () => {
    expect(getRealtimeQueryImpacts('reaction.changed')).toEqual(['conversation_messages']);
  });

  it('maps availability changes to conversation and contact reconciliation', () => {
    expect(getRealtimeQueryImpacts('messaging.availability_changed')).toEqual([
      'conversation_list',
      'conversation_details',
      'contacts',
    ]);
  });

  it('does not invalidate unrelated state for unknown events', () => {
    expect(getRealtimeQueryImpacts('unknown.event')).toEqual([]);
  });
});
