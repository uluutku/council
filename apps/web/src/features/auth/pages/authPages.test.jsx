import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthContext.js';
import { RegisterPage } from './RegisterPage.jsx';
import { LoginPage } from './LoginPage.jsx';
import { ForgotPasswordPage } from './ForgotPasswordPage.jsx';
import { ResetPasswordPage } from './ResetPasswordPage.jsx';
import { requestPasswordReset, signInWithEmail, signUpWithEmail } from '../api/authApi.js';
import { getMyProfileWithRetry } from '../../profile/api/profileApi.js';

vi.mock('../api/authApi.js', () => ({
  requestPasswordReset: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('../../profile/api/profileApi.js', () => ({
  getMyProfileWithRetry: vi.fn(),
}));

function renderRoutes(initialEntry, routeElements, auth = null) {
  const content = (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>{routeElements}</Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return render(
    auth ? <AuthContext.Provider value={auth}>{content}</AuthContext.Provider> : content,
  );
}

describe('authentication pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits registration and moves verification-required users to verify email', async () => {
    const user = userEvent.setup();
    signUpWithEmail.mockResolvedValue({ session: null, user: { id: 'user-1' } });
    renderRoutes(
      '/register',
      <>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<p>Email verification destination</p>} />
      </>,
    );

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'long-password');
    await user.type(screen.getByLabelText('Confirm password'), 'long-password');
    await user.click(screen.getByLabelText(/acknowledge Council/));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signUpWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', password: 'long-password' }),
    );
    expect(await screen.findByText('Email verification destination')).toBeInTheDocument();
  });

  it('shows generic credential feedback and clears the password after login failure', async () => {
    const user = userEvent.setup();
    signInWithEmail.mockRejectedValue({ code: 'invalid_credentials' });
    renderRoutes('/login', <Route path="/login" element={<LoginPage />} />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('user@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('returns an onboarded login to a safe protected destination', async () => {
    const user = userEvent.setup();
    signInWithEmail.mockResolvedValue({ user: { id: 'user-1' } });
    getMyProfileWithRetry.mockResolvedValue({ username: 'council_user' });
    renderRoutes(
      { pathname: '/login', state: { returnTo: '/app/profile' } },
      <>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app/profile" element={<p>Protected destination</p>} />
      </>,
    );

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'long-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Protected destination')).toBeInTheDocument();
  });

  it('uses a generic forgot-password confirmation for unknown backend errors', async () => {
    const user = userEvent.setup();
    requestPasswordReset.mockRejectedValue(new Error('provider detail'));
    renderRoutes(
      '/forgot-password',
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />,
    );

    await user.type(screen.getByLabelText('Email'), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: 'Send recovery instructions' }));

    expect(
      await screen.findByText(
        'If an account can receive password recovery email, Council has sent instructions.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('provider detail')).not.toBeInTheDocument();
  });

  it('rejects a reset page without recovery state or explicit password-change intent', () => {
    const auth = {
      isHydrating: false,
      isAuthenticated: false,
      isPasswordRecovery: false,
      completePasswordRecovery: vi.fn(),
    };
    renderRoutes(
      '/reset-password',
      <Route path="/reset-password" element={<ResetPasswordPage />} />,
      auth,
    );

    expect(
      screen.getByRole('heading', { name: 'This password link cannot be used' }),
    ).toBeInTheDocument();
  });
});
