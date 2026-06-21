import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from './providers/AuthContext.js';
import { createAppRouter } from './router.jsx';
import * as contactsApi from '../features/contacts/api/contactsApi.js';

// The authenticated shell and contacts pages read through this module. Mock it
// so routing assertions never reach the network.
vi.mock('../features/contacts/api/contactsApi.js', () => ({
  listMyContacts: vi.fn().mockResolvedValue([]),
  listMyContactRequests: vi.fn().mockResolvedValue([]),
  listMyBlockedUsers: vi.fn().mockResolvedValue([]),
  searchProfiles: vi.fn().mockResolvedValue([]),
  sendContactRequest: vi.fn(),
  respondContactRequest: vi.fn(),
  removeContact: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));

const onboardedAuth = {
  session: { user: { id: 'user-1' } },
  user: { id: 'user-1', email: 'user@example.com' },
  profile: { id: 'user-1', username: 'council_user', display_name: 'Council User' },
  settings: {},
  isHydrating: false,
  isAuthenticated: true,
  isOnboarded: true,
  accountError: null,
  isPasswordRecovery: false,
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
  completePasswordRecovery: vi.fn(),
};

const signedOutAuth = {
  session: null,
  user: null,
  profile: null,
  settings: null,
  isHydrating: false,
  isAuthenticated: false,
  isOnboarded: false,
  accountError: null,
  isPasswordRecovery: false,
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
  completePasswordRecovery: vi.fn(),
};

function renderRoute(path, auth = signedOutAuth) {
  const router = createAppRouter({ memory: true, initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return router;
}

describe('application routes', () => {
  it('renders the login route for guests', async () => {
    renderRoute('/login');

    expect(await screen.findByRole('heading', { name: 'Log in to Council' })).toBeInTheDocument();
  });

  it('redirects a guest from protected content to login', async () => {
    const router = renderRoute('/app/settings/profile');

    expect(await screen.findByRole('heading', { name: 'Log in to Council' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state.returnTo).toBe('/app/settings/profile');
  });

  it('redirects an authenticated user without a username to onboarding', async () => {
    const router = renderRoute('/app', {
      ...signedOutAuth,
      user: { id: 'user-1', email: 'user@example.com' },
      profile: { id: 'user-1', username: null, display_name: null },
      settings: {},
      isAuthenticated: true,
    });

    expect(
      await screen.findByRole('heading', { name: 'Choose your Council username' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/onboarding');
  });

  it('redirects an onboarded user away from guest routes', async () => {
    const router = renderRoute('/login', {
      ...signedOutAuth,
      user: { id: 'user-1', email: 'user@example.com' },
      profile: { id: 'user-1', username: 'council_user', display_name: 'Council User' },
      settings: {},
      isAuthenticated: true,
      isOnboarded: true,
    });

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Council User' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('renders the not-found route', async () => {
    renderRoute('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('protects the contacts routes from guests', async () => {
    const router = renderRoute('/app/contacts');

    expect(await screen.findByRole('heading', { name: 'Log in to Council' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state.returnTo).toBe('/app/contacts');
  });

  it('keeps an unonboarded user out of the contacts routes', async () => {
    const router = renderRoute('/app/contacts/discover', {
      ...onboardedAuth,
      profile: { id: 'user-1', username: null, display_name: null },
      isOnboarded: false,
    });

    expect(
      await screen.findByRole('heading', { name: 'Choose your Council username' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/onboarding');
  });

  it('renders the incoming-request count in the navigation', async () => {
    contactsApi.listMyContactRequests.mockResolvedValueOnce([
      {
        relationship_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        id: '22222222-2222-4222-8222-222222222222',
        username: 'bjorn',
        display_name: 'Bjorn',
        avatar_path: null,
        status_text: null,
        direction: 'incoming',
        created_at: '2026-06-21T22:00:00+00:00',
      },
    ]);
    renderRoute('/app', onboardedAuth);

    expect(await screen.findByLabelText('1 pending incoming requests')).toBeInTheDocument();
  });

  it('sends an authenticated user from a guest route to a safe return path', async () => {
    const router = renderRoute(
      { pathname: '/login', state: { returnTo: '/app/settings/security' } },
      onboardedAuth,
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/settings/security'));
  });

  it('exposes a blocked-users link in settings navigation', async () => {
    renderRoute('/app/settings/profile', onboardedAuth);

    expect(await screen.findByRole('link', { name: 'Blocked users' })).toHaveAttribute(
      'href',
      '/app/settings/blocked',
    );
  });
});
