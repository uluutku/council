import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from './providers/AuthContext.js';
import { createAppRouter } from './router.jsx';

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
});
