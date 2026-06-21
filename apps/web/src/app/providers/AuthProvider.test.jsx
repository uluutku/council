import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountKeys } from '../../lib/query-keys/account.js';
import { AuthProvider } from './AuthProvider.jsx';
import { useAuth } from './AuthContext.js';
import { getMyProfile, getMySettings } from '../../features/profile/api/profileApi.js';
import { signOutSession } from '../../features/auth/api/authApi.js';

vi.mock('../../features/profile/api/profileApi.js', () => ({
  getMyProfile: vi.fn(),
  getMySettings: vi.fn(),
}));

vi.mock('../../features/auth/api/authApi.js', () => ({
  signOutSession: vi.fn(),
}));

function createAuthClient(initialSession = null) {
  let listener = () => {};

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: initialSession },
        error: null,
      }),
      onAuthStateChange: vi.fn((callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    emit(event, session) {
      listener(event, session);
    },
  };
}

function StateProbe() {
  const auth = useAuth();
  const [, rerender] = useState(0);

  return (
    <div>
      <span>{auth.isHydrating ? 'hydrating' : 'ready'}</span>
      <span>{auth.isAuthenticated ? 'authenticated' : 'signed-out'}</span>
      <span>{auth.isOnboarded ? 'onboarded' : 'not-onboarded'}</span>
      <span>{auth.isPasswordRecovery ? 'recovering' : 'not-recovering'}</span>
      <button type="button" onClick={() => auth.signOut()}>
        Sign out
      </button>
      <button type="button" onClick={() => rerender((value) => value + 1)}>
        Rerender
      </button>
    </div>
  );
}

function renderProvider(client, queryClient = new QueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={client}>
        <StateProbe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    getMyProfile.mockResolvedValue({
      id: 'user-1',
      username: 'council_user',
      display_name: 'Council User',
    });
    getMySettings.mockResolvedValue({
      user_id: 'user-1',
      theme: 'system',
      notification_preferences: {},
      privacy_preferences: {},
    });
    signOutSession.mockResolvedValue();
  });

  it('hydrates a signed-out session before exposing guest state', async () => {
    renderProvider(createAuthClient());

    expect(screen.getByText('hydrating')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
    expect(screen.getByText('signed-out')).toBeInTheDocument();
  });

  it('loads profile and settings for an authenticated session', async () => {
    const session = { user: { id: 'user-1', email: 'user@example.com' } };
    renderProvider(createAuthClient(session));

    await waitFor(() => expect(screen.getByText('onboarded')).toBeInTheDocument());
    expect(screen.getByText('authenticated')).toBeInTheDocument();
    expect(getMyProfile).toHaveBeenCalledTimes(1);
    expect(getMySettings).toHaveBeenCalledTimes(1);
  });

  it('responds to sign-in and password-recovery auth events', async () => {
    const client = createAuthClient();
    renderProvider(client);
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());

    await act(async () => {
      client.emit('PASSWORD_RECOVERY', {
        user: { id: 'user-1', email: 'user@example.com' },
      });
    });

    await waitFor(() => expect(screen.getByText('onboarded')).toBeInTheDocument());
    expect(screen.getByText('recovering')).toBeInTheDocument();
    expect(sessionStorage.getItem('council.password-recovery')).toBe('true');
  });

  it('clears user-scoped query data when signing out', async () => {
    const user = userEvent.setup();
    const session = { user: { id: 'user-1', email: 'user@example.com' } };
    const queryClient = new QueryClient();
    queryClient.setQueryData([...accountKeys.all, 'private'], { value: true });
    renderProvider(createAuthClient(session), queryClient);

    await waitFor(() => expect(screen.getByText('onboarded')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOutSession).toHaveBeenCalledWith('local', expect.any(Object));
    expect(queryClient.getQueriesData({ queryKey: accountKeys.all })).toHaveLength(0);
  });
});
