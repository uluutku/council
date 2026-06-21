import { createBrowserRouter, createMemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout.jsx';
import { AppPlaceholderPage } from '../routes/AppPlaceholderPage.jsx';
import { LandingPage } from '../routes/LandingPage.jsx';
import { LoginPage } from '../routes/LoginPage.jsx';
import { NotFoundPage } from '../routes/NotFoundPage.jsx';
import { RegisterPage } from '../routes/RegisterPage.jsx';

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'app', element: <AppPlaceholderPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter(options = {}) {
  if (options.memory) {
    return createMemoryRouter(routes, {
      initialEntries: options.initialEntries ?? ['/'],
    });
  }

  return createBrowserRouter(routes);
}
