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

vi.mock('../features/ai/api/aiApi.js', () => ({
  getMyAiAccess: vi.fn().mockResolvedValue({
    access_state: 'trial_available',
    trial_credits_remaining: 10,
    trial_expires_at: null,
    pro_expires_at: null,
    pro_credits_remaining: 0,
  }),
}));

vi.mock('../features/access/api/accessApi.js', () => ({
  listMyPremiumGrants: vi.fn().mockResolvedValue([]),
  redeemPremiumCode: vi.fn(),
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

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('redirects a guest from protected content to login', async () => {
    const router = renderRoute('/app/profile');

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state.returnTo).toBe('/app/profile');
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

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/messages'));
  });

  it('redirects the app index to messages for onboarded users', async () => {
    const router = renderRoute('/app', onboardedAuth);

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/messages'));
  });

  it('renders the not-found route', async () => {
    renderRoute('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('protects the contacts routes from guests', async () => {
    const router = renderRoute('/app/contacts');

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
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
    renderRoute('/app/messages', onboardedAuth);

    expect(await screen.findByLabelText('1 pending incoming requests')).toBeInTheDocument();
  });

  it('sends an authenticated user from a guest route to a safe return path', async () => {
    const router = renderRoute(
      { pathname: '/login', state: { returnTo: '/app/settings/security' } },
      onboardedAuth,
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/settings/security'));
  });

  it('exposes settings links without standalone account pages in settings navigation', async () => {
    renderRoute('/app/settings/appearance', onboardedAuth);

    expect(await screen.findByRole('link', { name: 'Appearance' })).toHaveAttribute(
      'href',
      '/app/settings/appearance',
    );
    expect(await screen.findByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'href',
      '/app/settings/notifications',
    );
    expect(await screen.findByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/app/settings/privacy',
    );
    expect(screen.queryByRole('link', { name: 'Preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pro Status' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Blocked users' })).toHaveAttribute(
      'href',
      '/app/settings/blocked',
    );
  });

  it('renders profile as a standalone app page and redirects the old settings profile path', async () => {
    const profileRouter = renderRoute('/app/profile', onboardedAuth);

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(profileRouter.state.location.pathname).toBe('/app/profile');

    const legacyRouter = renderRoute('/app/settings/profile', onboardedAuth);
    await waitFor(() => expect(legacyRouter.state.location.pathname).toBe('/app/profile'));
  });

  it('renders Pro as a standalone app page and redirects the old settings access path', async () => {
    const proRouter = renderRoute('/app/pro', onboardedAuth);

    expect(await screen.findByRole('heading', { name: 'Access' })).toBeInTheDocument();
    expect(proRouter.state.location.pathname).toBe('/app/pro');

    const legacyRouter = renderRoute('/app/settings/access', onboardedAuth);
    await waitFor(() => expect(legacyRouter.state.location.pathname).toBe('/app/pro'));
  });

  it('redirects legacy settings preferences to appearance', async () => {
    const router = renderRoute('/app/settings/preferences', onboardedAuth);

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/settings/appearance'));
  });
});
