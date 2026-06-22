import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthContext.js';
import { messagingKeys } from '../../../lib/query-keys/messaging.js';
import { useConversationRealtime } from './useConversationRealtime.js';
import { CONVERSATION_ID, ME_ID, PEER_ID } from '../test/fixtures.js';

const subscriptions = [];
let lastHandlers = null;

vi.mock('../realtime/conversationSubscription.js', () => ({
  subscribeToConversationEvents: vi.fn((args) => {
    lastHandlers = args;
    const unsubscribe = vi.fn();
    subscriptions.push({ args, unsubscribe });
    args.onStatus?.('subscribed');
    return { unsubscribe };
  }),
}));

import { subscribeToConversationEvents } from '../realtime/conversationSubscription.js';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  function wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ client: {} }}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  }
  return { wrapper, invalidateSpy, queryClient };
}

beforeEach(() => {
  subscriptions.length = 0;
  lastHandlers = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useConversationRealtime', () => {
  it('subscribes to the conversation topic and reconciles on subscribe', async () => {
    const { wrapper, invalidateSpy } = createWrapper();
    renderHook(
      () => useConversationRealtime({ conversationId: CONVERSATION_ID, currentUserId: ME_ID }),
      {
        wrapper,
      },
    );

    await waitFor(() => expect(subscribeToConversationEvents).toHaveBeenCalledTimes(1));
    expect(subscribeToConversationEvents.mock.calls[0][0].conversationId).toBe(CONVERSATION_ID);
    // On subscribe confirmation the message window is reconciled.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: messagingKeys.messages(CONVERSATION_ID),
    });
  });

  it('reconciles messages on a message.created event', async () => {
    const { wrapper, invalidateSpy } = createWrapper();
    renderHook(
      () => useConversationRealtime({ conversationId: CONVERSATION_ID, currentUserId: ME_ID }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(lastHandlers).not.toBeNull());
    invalidateSpy.mockClear();

    act(() => {
      lastHandlers.onEvent({
        id: '99999999-9999-4999-8999-999999999999',
        version: 1,
        event: 'message.created',
        occurred_at: '2026-06-22T10:00:00+00:00',
        conversation_id: CONVERSATION_ID,
        entity_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        sequence: 1,
        actor_user_id: PEER_ID,
        last_sequence: 1,
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: messagingKeys.messages(CONVERSATION_ID),
    });
  });

  it('reports the peer’s receipt but ignores the current user’s own receipt event', async () => {
    const { wrapper } = createWrapper();
    const onPeerReceipt = vi.fn();
    renderHook(
      () =>
        useConversationRealtime({
          conversationId: CONVERSATION_ID,
          currentUserId: ME_ID,
          onPeerReceipt,
        }),
      { wrapper },
    );
    await waitFor(() => expect(lastHandlers).not.toBeNull());

    const receiptEvent = (actor) => ({
      id: '99999999-9999-4999-8999-999999999999',
      version: 1,
      event: 'receipt.changed',
      occurred_at: '2026-06-22T10:00:00+00:00',
      conversation_id: CONVERSATION_ID,
      entity_id: actor,
      actor_user_id: actor,
      read_sequence: 3,
      delivered_sequence: 3,
    });

    act(() => lastHandlers.onEvent(receiptEvent(ME_ID)));
    expect(onPeerReceipt).not.toHaveBeenCalled();

    act(() => lastHandlers.onEvent(receiptEvent(PEER_ID)));
    expect(onPeerReceipt).toHaveBeenCalledWith({ readSequence: 3, deliveredSequence: 3 });
  });

  it('ignores events for a different conversation', async () => {
    const { wrapper, invalidateSpy } = createWrapper();
    renderHook(
      () => useConversationRealtime({ conversationId: CONVERSATION_ID, currentUserId: ME_ID }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(lastHandlers).not.toBeNull());
    invalidateSpy.mockClear();

    act(() => {
      lastHandlers.onEvent({
        id: '99999999-9999-4999-8999-999999999999',
        version: 1,
        event: 'message.created',
        occurred_at: '2026-06-22T10:00:00+00:00',
        conversation_id: '44444444-4444-4444-8444-444444444444',
        entity_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        sequence: 1,
        actor_user_id: PEER_ID,
        last_sequence: 1,
      });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('cleans up the channel on unmount', async () => {
    const { wrapper } = createWrapper();
    const { unmount } = renderHook(
      () => useConversationRealtime({ conversationId: CONVERSATION_ID, currentUserId: ME_ID }),
      { wrapper },
    );
    await waitFor(() => expect(subscriptions).toHaveLength(1));
    unmount();
    await waitFor(() => expect(subscriptions[0].unsubscribe).toHaveBeenCalled());
  });

  it('resubscribes and cleans the previous channel when the conversation changes', async () => {
    const { wrapper } = createWrapper();
    const { rerender } = renderHook(
      ({ id }) => useConversationRealtime({ conversationId: id, currentUserId: ME_ID }),
      { wrapper, initialProps: { id: CONVERSATION_ID } },
    );
    await waitFor(() => expect(subscriptions).toHaveLength(1));

    rerender({ id: '44444444-4444-4444-8444-444444444444' });
    await waitFor(() => expect(subscriptions).toHaveLength(2));
    expect(subscriptions[0].unsubscribe).toHaveBeenCalled();
    expect(subscriptions[1].args.conversationId).toBe('44444444-4444-4444-8444-444444444444');
  });
});
