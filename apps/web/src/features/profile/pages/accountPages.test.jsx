import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthContext.js';
import { AuthenticatedLayout } from '../../../app/layouts/AuthenticatedLayout.jsx';
import { OnboardingPage } from '../../onboarding/OnboardingPage.jsx';
import { ProfileSettingsPage } from './ProfileSettingsPage.jsx';
import { PreferencesSettingsPage } from './PreferencesSettingsPage.jsx';
import { setMyProfile, updateMySettings } from '../api/profileApi.js';

vi.mock('../api/profileApi.js', () => ({
  setMyProfile: vi.fn(),
  updateMySettings: vi.fn(),
}));

// The authenticated shell now renders a pending-request count badge. Keep that
// background query out of these account-focused tests with a stable empty list.
vi.mock('../../contacts/api/contactsApi.js', () => ({
  listMyContactRequests: vi.fn().mockResolvedValue([]),
}));

const profile = {
  id: 'user-1',
  username: 'council_user',
  display_name: 'Council User',
  bio: 'Original biography',
  avatar_path: null,
  status_text: 'Original status',
};

const settings = {
  user_id: 'user-1',
  theme: 'system',
  notification_preferences: {
    message_notifications: true,
    message_previews: false,
    sound: true,
  },
  privacy_preferences: {
    show_online_status: true,
    show_last_seen: true,
    allow_contact_requests: true,
  },
};

function renderWithAuth(element, authOverrides = {}) {
  const auth = {
    user: { id: 'user-1', email: 'user@example.com' },
    profile,
    settings,
    refreshProfile: vi.fn().mockResolvedValue(),
    signOut: vi.fn().mockResolvedValue(),
    ...authOverrides,
  };

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return auth;
}

describe('onboarding and account settings pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows an authoritative username conflict during onboarding', async () => {
    const user = userEvent.setup();
    setMyProfile.mockRejectedValue({ code: '23505', message: 'username is already taken' });
    renderWithAuth(
      <Routes>
        <Route path="/" element={<OnboardingPage />} />
        <Route path="/app" element={<p>Application destination</p>} />
      </Routes>,
      { profile: { ...profile, username: null, display_name: null } },
    );

    await user.type(screen.getByLabelText('Username'), 'council_user');
    await user.click(screen.getByRole('button', { name: 'Continue to Council' }));

    expect(await screen.findByText('That username is already in use.')).toBeInTheDocument();
    expect(screen.queryByText('Application destination')).not.toBeInTheDocument();
  });

  it('updates profile fields and reports success', async () => {
    const user = userEvent.setup();
    setMyProfile.mockResolvedValue({
      ...profile,
      display_name: 'Updated User',
      status_text: 'Updated status',
    });
    const auth = renderWithAuth(<ProfileSettingsPage />);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Updated User');
    await user.clear(screen.getByLabelText('Status'));
    await user.type(screen.getByLabelText('Status'), 'Updated status');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(setMyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'council_user',
        display_name: 'Updated User',
        status_text: 'Updated status',
      }),
    );
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(auth.refreshProfile).toHaveBeenCalled();
  });

  it('keeps edited profile data when an update fails', async () => {
    const user = userEvent.setup();
    setMyProfile.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWithAuth(<ProfileSettingsPage />);

    await user.clear(screen.getByLabelText('Biography'));
    await user.type(screen.getByLabelText('Biography'), 'Unsaved biography');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Council cannot reach the server.')).toBeInTheDocument();
    expect(screen.getByLabelText('Biography')).toHaveValue('Unsaved biography');
  });

  it('persists privacy preferences through the settings wrapper with light appearance', async () => {
    const user = userEvent.setup();
    updateMySettings.mockResolvedValue({
      ...settings,
      theme: 'light',
      privacy_preferences: { ...settings.privacy_preferences, allow_contact_requests: false },
    });
    const auth = renderWithAuth(<PreferencesSettingsPage />);

    expect(screen.queryByRole('button', { name: 'Dark' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Allow contact requests/));
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(updateMySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'light',
        privacy_preferences: expect.objectContaining({ allow_contact_requests: false }),
      }),
    );
    expect(await screen.findByText('Preferences saved.')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).not.toBe('dark');
    expect(auth.refreshProfile).toHaveBeenCalled();
  });

  it('logs out from the authenticated shell and navigates to login', async () => {
    const user = userEvent.setup();
    const auth = renderWithAuth(
      <Routes>
        <Route element={<AuthenticatedLayout />}>
          <Route index element={<p>Private application</p>} />
        </Route>
        <Route path="/login" element={<p>Login destination</p>} />
      </Routes>,
    );

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(auth.signOut).toHaveBeenCalledWith('local');
    expect(await screen.findByText('Login destination')).toBeInTheDocument();
  });
});
