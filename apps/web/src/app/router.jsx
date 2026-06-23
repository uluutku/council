import { createBrowserRouter, createMemoryRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PublicLayout } from './layouts/PublicLayout.jsx';
import { AuthLayout } from './layouts/AuthLayout.jsx';
import { AuthenticatedLayout } from './layouts/AuthenticatedLayout.jsx';
import { SettingsLayout } from './layouts/SettingsLayout.jsx';
import { ContactsLayout } from './layouts/ContactsLayout.jsx';
import { MessagingLayout } from './layouts/MessagingLayout.jsx';
import { AiLayout } from './layouts/AiLayout.jsx';
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
const DiscoverContactsPage = lazyNamed(
  () => import('../features/contacts/pages/DiscoverContactsPage.jsx'),
  'DiscoverContactsPage',
);
const ContactRequestsPage = lazyNamed(
  () => import('../features/contacts/pages/ContactRequestsPage.jsx'),
  'ContactRequestsPage',
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
          { index: true, element: <AppHomePage /> },
          {
            path: 'messages',
            element: <MessagingLayout />,
            children: [
              { index: true, element: lazyRoute(<InboxPage />) },
              { path: 'search', element: lazyRoute(<MessageSearchPage />) },
              { path: ':conversationId', element: lazyRoute(<ConversationPage />) },
            ],
          },
          {
            path: 'ai',
            element: <AiLayout />,
            children: [
              { index: true, element: lazyRoute(<AiCataloguePage />) },
              { path: ':conversationId', element: lazyRoute(<AiConversationPage />) },
            ],
          },
          {
            path: 'contacts',
            element: <ContactsLayout />,
            children: [
              { index: true, element: lazyRoute(<ContactsPage />) },
              { path: 'discover', element: lazyRoute(<DiscoverContactsPage />) },
              { path: 'requests', element: lazyRoute(<ContactRequestsPage />) },
            ],
          },
          { path: 'artifacts', element: lazyRoute(<ArtifactsPage />) },
          { path: 'artifacts/:artifactId', element: lazyRoute(<ArtifactDetailPage />) },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: lazyRoute(<ProfileSettingsPage />) },
              { path: 'profile', element: lazyRoute(<ProfileSettingsPage />) },
              { path: 'preferences', element: lazyRoute(<PreferencesSettingsPage />) },
              { path: 'access', element: lazyRoute(<AccessSettingsPage />) },
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
