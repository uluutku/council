import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessengerShell } from './MessengerShell.jsx';

vi.mock('../providers/AuthContext.js', () => ({
  useAuth: () => ({
    profile: { username: 'tester', display_name: 'Test User' },
    signOut: vi.fn(),
  }),
}));

vi.mock('../../features/contacts/hooks/usePendingRequestCount.js', () => ({
  usePendingRequestCount: () => 2,
}));

vi.mock('../../features/messaging/hooks/useUnreadCount.js', () => ({
  useUnreadCount: () => 4,
}));

vi.mock('../../features/messaging/hooks/useInboxRealtime.js', () => ({
  useInboxRealtime: () => {},
}));

vi.mock('../../features/messaging/hooks/usePresenceHeartbeat.js', () => ({
  usePresenceHeartbeat: () => {},
}));

vi.mock('../../hooks/useRouteFocus.js', () => ({
  useRouteFocus: () => {},
}));

function renderShell(initialEntries = ['/app/messages']) {
  const router = createMemoryRouter(
    [
      {
        path: '/app',
        element: <MessengerShell />,
        children: [
          { path: 'messages', element: <div>Messages content</div> },
          { path: 'contacts', element: <div>Contacts content</div> },
          { path: 'pro', element: <div>Pro content</div> },
          { path: 'profile', element: <div>Profile content</div> },
        ],
      },
    ],
    { initialEntries },
  );
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('MessengerShell', () => {
  it('renders icon-first desktop and mobile navigation with unread badges', () => {
    renderShell();

    expect(screen.getAllByRole('link', { name: 'Messages' })[0]).toHaveClass('active');
    expect(screen.getAllByRole('link', { name: 'Settings' })[0]).toHaveAttribute(
      'href',
      '/app/settings/appearance',
    );
    expect(screen.getByLabelText('4 unread messages')).toBeInTheDocument();
    expect(screen.getByLabelText('2 pending incoming requests')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pro plan' })).toHaveAttribute('href', '/app/pro');
    expect(screen.getByRole('link', { name: 'Profile: Test User' })).toHaveAttribute(
      'href',
      '/app/profile',
    );
    expect(screen.getByText('Messages content')).toBeInTheDocument();
    expect(screen.getByLabelText('Log out')).toBeInTheDocument();
  });
});
