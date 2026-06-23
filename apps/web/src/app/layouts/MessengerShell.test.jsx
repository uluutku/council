import { RouterProvider, createMemoryRouter } from 'react-router-dom';
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
        ],
      },
    ],
    { initialEntries },
  );

  return render(<RouterProvider router={router} />);
}

describe('MessengerShell', () => {
  it('renders icon-first desktop and mobile navigation with unread badges', () => {
    renderShell();

    expect(screen.getAllByRole('link', { name: 'Messages' })[0]).toHaveClass('active');
    expect(screen.getByLabelText('4 unread messages')).toBeInTheDocument();
    expect(screen.getByLabelText('2 pending incoming requests')).toBeInTheDocument();
    expect(screen.getByText('Messages content')).toBeInTheDocument();
    expect(screen.getByLabelText('Log out')).toBeInTheDocument();
  });
});
