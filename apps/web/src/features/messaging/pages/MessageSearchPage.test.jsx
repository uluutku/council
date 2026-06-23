import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageSearchPage } from './MessageSearchPage.jsx';

vi.mock('../api/messagingApi.js', () => ({
  searchMyConversations: vi.fn(),
  searchMyMessages: vi.fn(),
}));
import { searchMyConversations, searchMyMessages } from '../api/messagingApi.js';

function Destination() {
  const location = useLocation();
  return <p>Target {location.state?.messageId}</p>;
}

describe('MessageSearchPage', () => {
  beforeEach(() => {
    searchMyConversations.mockResolvedValue([]);
    searchMyMessages.mockResolvedValue([
      {
        conversation_id: '33333333-3333-4333-8333-333333333333',
        message_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        sequence: 4,
        snippet: 'An older matching message',
        sender_id: '22222222-2222-4222-8222-222222222222',
        created_at: '2026-06-20T10:00:00+00:00',
        peer_id: '22222222-2222-4222-8222-222222222222',
        peer_username: 'bjorn',
        peer_display_name: 'Bjorn',
        peer_avatar_path: null,
      },
    ]);
  });

  it('navigates to the bounded message target', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/app/messages/search']}>
          <Routes>
            <Route path="/app/messages/search" element={<MessageSearchPage />} />
            <Route path="/app/messages/:conversationId" element={<Destination />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByRole('searchbox'), 'older');
    await waitFor(() => expect(searchMyMessages).toHaveBeenCalled());
    await userEvent.click(await screen.findByText('An older matching message'));
    expect(
      await screen.findByText('Target aaaaaaaa-0000-4000-8000-000000000001'),
    ).toBeInTheDocument();
  });
});
