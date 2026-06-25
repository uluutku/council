import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PublicLayout } from './layouts/PublicLayout.jsx';
import { AuthLayout } from './layouts/AuthLayout.jsx';
import { AuthenticatedLayout } from './layouts/AuthenticatedLayout.jsx';
import { SettingsLayout } from './layouts/SettingsLayout.jsx';
import { ContactsLayout } from './layouts/ContactsLayout.jsx';
import { MessagingLayout } from './layouts/MessagingLayout.jsx';
import { ArtifactsLayout } from './layouts/ArtifactsLayout.jsx';
import { GuestRoute } from './router/GuestRoute.jsx';
import { ProtectedRoute } from './router/ProtectedRoute.jsx';
import { OnboardingRoute } from './router/OnboardingRoute.jsx';
import { LegacyAiCatalogueRedirect } from './router/LegacyAiCatalogueRedirect.jsx';
import { LegacyAiConversationRedirect } from './router/LegacyAiConversationRedirect.jsx';
import { LegacyContactsRedirect } from './router/LegacyContactsRedirect.jsx';
import { LandingPage } from '../routes/LandingPage.jsx';
import { NotFoundPage } from '../routes/NotFoundPage.jsx';
import { LoginPage } from '../features/auth/pages/LoginPage.jsx';
import { RegisterPage } from '../features/auth/pages/RegisterPage.jsx';
import { VerifyEmailPage } from '../features/auth/pages/VerifyEmailPage.jsx';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage.jsx';
import { OnboardingPage } from '../features/onboarding/OnboardingPage.jsx';
import { DEFAULT_APP_PATH } from '../features/auth/utils/safeRedirect.js';
import { RouteSkeleton } from '../components/RouteSkeleton.jsx';

function lazyNamed(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const ProfileSettingsPage = lazyNamed(
  () => import('../features/profile/pages/ProfileSettingsPage.jsx'),
  'ProfileSettingsPage',
);
const PreferencesSettingsPage = lazyNamed(
  () => import('../features/profile/pages/PreferencesSettingsPage.jsx'),
  'PreferencesSettingsPage',
);
const SecuritySettingsPage = lazyNamed(
  () => import('../features/profile/pages/SecuritySettingsPage.jsx'),
  'SecuritySettingsPage',
);
const AccessSettingsPage = lazyNamed(
  () => import('../features/access/pages/AccessSettingsPage.jsx'),
  'AccessSettingsPage',
);
const ContactsPage = lazyNamed(
  () => import('../features/contacts/pages/ContactsPage.jsx'),
  'ContactsPage',
);
const BlockedUsersPage = lazyNamed(
  () => import('../features/contacts/pages/BlockedUsersPage.jsx'),
  'BlockedUsersPage',
);
const InboxPage = lazyNamed(() => import('../features/messaging/pages/InboxPage.jsx'), 'InboxPage');
const ConversationPage = lazyNamed(
  () => import('../features/messaging/pages/ConversationPage.jsx'),
  'ConversationPage',
);
const MessageSearchPage = lazyNamed(
  () => import('../features/messaging/pages/MessageSearchPage.jsx'),
  'MessageSearchPage',
);
const AiCataloguePage = lazyNamed(
  () => import('../features/ai/pages/AiCataloguePage.jsx'),
  'AiCataloguePage',
);
const AiConversationPage = lazyNamed(
  () => import('../features/ai/pages/AiConversationPage.jsx'),
  'AiConversationPage',
);
const ArtifactsPage = lazyNamed(
  () => import('../features/artifacts/pages/ArtifactsPage.jsx'),
  'ArtifactsPage',
);
const ArtifactDetailPage = lazyNamed(
  () => import('../features/artifacts/pages/ArtifactDetailPage.jsx'),
  'ArtifactDetailPage',
);

function lazyRoute(element) {
  return <Suspense fallback={<RouteSkeleton />}>{element}</Suspense>;
}

export const routes = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        element: <OnboardingRoute />,
        children: [{ path: '/onboarding', element: <OnboardingPage /> }],
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
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
    ],
  },
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthenticatedLayout />,
        children: [
          { index: true, element: <Navigate to={DEFAULT_APP_PATH} replace /> },
          {
            path: 'messages',
            element: <MessagingLayout />,
            children: [
              { index: true, element: lazyRoute(<InboxPage />) },
              { path: 'search', element: lazyRoute(<MessageSearchPage />) },
              { path: 'ai/:conversationId', element: lazyRoute(<AiConversationPage />) },
              { path: ':conversationId', element: lazyRoute(<ConversationPage />) },
            ],
          },
          {
            path: 'ai',
            children: [
              { index: true, element: <LegacyAiCatalogueRedirect /> },
              { path: ':conversationId', element: <LegacyAiConversationRedirect /> },
            ],
          },
          {
            path: 'contacts',
            element: <ContactsLayout />,
            children: [
              { index: true, element: lazyRoute(<ContactsPage />) },
              { path: 'ai', element: lazyRoute(<AiCataloguePage />) },
              { path: 'discover', element: <LegacyContactsRedirect /> },
              { path: 'requests', element: <LegacyContactsRedirect /> },
            ],
          },
          {
            path: 'artifacts',
            element: <ArtifactsLayout />,
            children: [
              { index: true, element: lazyRoute(<ArtifactsPage />) },
              { path: ':artifactId', element: lazyRoute(<ArtifactDetailPage />) },
            ],
          },
          { path: 'pro', element: lazyRoute(<AccessSettingsPage />) },
          { path: 'profile', element: lazyRoute(<ProfileSettingsPage />) },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="/app/settings/appearance" replace /> },
              { path: 'profile', element: <Navigate to="/app/profile" replace /> },
              {
                path: 'appearance',
                element: lazyRoute(<PreferencesSettingsPage section="appearance" />),
              },
              {
                path: 'notifications',
                element: lazyRoute(<PreferencesSettingsPage section="notifications" />),
              },
              {
                path: 'privacy',
                element: lazyRoute(<PreferencesSettingsPage section="privacy" />),
              },
              { path: 'preferences', element: <Navigate to="/app/settings/appearance" replace /> },
              { path: 'access', element: <Navigate to="/app/pro" replace /> },
              { path: 'security', element: lazyRoute(<SecuritySettingsPage />) },
              { path: 'blocked', element: lazyRoute(<BlockedUsersPage />) },
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
