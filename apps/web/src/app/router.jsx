import { createBrowserRouter, createMemoryRouter } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout.jsx';
import { AuthenticatedLayout } from './layouts/AuthenticatedLayout.jsx';
import { SettingsLayout } from './layouts/SettingsLayout.jsx';
import { ContactsLayout } from './layouts/ContactsLayout.jsx';
import { GuestRoute } from './router/GuestRoute.jsx';
import { ProtectedRoute } from './router/ProtectedRoute.jsx';
import { OnboardingRoute } from './router/OnboardingRoute.jsx';
import { LandingPage } from '../routes/LandingPage.jsx';
import { AppHomePage } from '../routes/AppHomePage.jsx';
import { NotFoundPage } from '../routes/NotFoundPage.jsx';
import { LoginPage } from '../features/auth/pages/LoginPage.jsx';
import { RegisterPage } from '../features/auth/pages/RegisterPage.jsx';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage.jsx';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage.jsx';
import { OnboardingPage } from '../features/onboarding/OnboardingPage.jsx';
import { ProfileSettingsPage } from '../features/profile/pages/ProfileSettingsPage.jsx';
import { PreferencesSettingsPage } from '../features/profile/pages/PreferencesSettingsPage.jsx';
import { SecuritySettingsPage } from '../features/profile/pages/SecuritySettingsPage.jsx';
import { ContactsPage } from '../features/contacts/pages/ContactsPage.jsx';
import { DiscoverContactsPage } from '../features/contacts/pages/DiscoverContactsPage.jsx';
import { ContactRequestsPage } from '../features/contacts/pages/ContactRequestsPage.jsx';
import { BlockedUsersPage } from '../features/contacts/pages/BlockedUsersPage.jsx';

export const routes = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        element: <GuestRoute />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <OnboardingRoute />,
        children: [{ path: '/onboarding', element: <OnboardingPage /> }],
      },
    ],
  },
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthenticatedLayout />,
        children: [
          { index: true, element: <AppHomePage /> },
          {
            path: 'contacts',
            element: <ContactsLayout />,
            children: [
              { index: true, element: <ContactsPage /> },
              { path: 'discover', element: <DiscoverContactsPage /> },
              { path: 'requests', element: <ContactRequestsPage /> },
            ],
          },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <ProfileSettingsPage /> },
              { path: 'profile', element: <ProfileSettingsPage /> },
              { path: 'preferences', element: <PreferencesSettingsPage /> },
              { path: 'security', element: <SecuritySettingsPage /> },
              { path: 'blocked', element: <BlockedUsersPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export function createAppRouter(options = {}) {
  if (options.memory) {
    return createMemoryRouter(routes, {
      initialEntries: options.initialEntries ?? ['/'],
    });
  }

  return createBrowserRouter(routes);
}
