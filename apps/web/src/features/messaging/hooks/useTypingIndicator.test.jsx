import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthContext.js';
import { useTypingIndicator } from './useTypingIndicator.js';

function Harness() {
  const typing = useTypingIndicator('33333333-3333-4333-8333-333333333333');
  return (
    <>
      <button type="button" onClick={() => typing.update(true)}>
        Type
      </button>
      <span>{typing.peerTyping ? 'Peer typing' : 'Idle'}</span>
    </>
  );
}

describe('useTypingIndicator', () => {
  afterEach(() => vi.useRealTimers());

  it('throttles cleanup signals and expires peer typing', () => {
    vi.useFakeTimers();
    const handlers = new Map();
    const send = vi.fn().mockResolvedValue('ok');
    const channel = {
      on: vi.fn((_type, config, handler) => {
        handlers.set(config.event, handler);
        return channel;
      }),
      subscribe: vi.fn((callback) => callback('SUBSCRIBED')),
      send,
    };
    const client = {
      channel: vi.fn(() => channel),
      realtime: { setAuth: vi.fn().mockResolvedValue() },
      removeChannel: vi.fn().mockResolvedValue(),
    };
    const view = render(
      <AuthContext.Provider value={{ client }}>
        <Harness />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'typing.start' }));
    act(() => vi.advanceTimersByTime(1_500));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'typing.stop' }));

    act(() =>
      handlers.get('typing.start')({
        payload: { version: 1, event: 'typing.start', sent_at: new Date().toISOString() },
      }),
    );
    expect(screen.getByText('Peer typing')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('Idle')).toBeInTheDocument();

    view.unmount();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'typing.stop' }));
  });
});
