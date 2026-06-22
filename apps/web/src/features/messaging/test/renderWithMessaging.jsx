import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { AuthContext } from '../../../app/providers/AuthContext.js';
import { ME_ID } from './fixtures.js';

// Render helper for messaging surfaces. Tests mock the messagingApi module and
// the realtime subscription modules, so real TanStack queries/mutations run
// against the mocks — a realistic integration surface without Supabase.
export function renderWithMessaging(children, options = {}) {
  const { user = { id: ME_ID, email: 'me@example.test' }, initialEntries = ['/'] } = options;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const auth = {
    session: { user },
    user,
    profile: { id: user.id, username: 'me', display_name: 'Me' },
    settings: {},
    isAuthenticated: true,
    isOnboarded: true,
    isHydrating: false,
    accountError: null,
    refreshProfile: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    // A placeholder client; realtime modules are mocked so it is never used.
    client: {},
  };

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

  return { ...utils, queryClient, auth };
}

// Convenience for rendering a single conversation route with params + state.
export function renderConversationRoute(element, { conversationId, state, user } = {}) {
  return renderWithMessaging(
    <Routes>
      <Route path="/app/messages/:conversationId" element={element} />
    </Routes>,
    {
      user,
      initialEntries: [{ pathname: `/app/messages/${conversationId}`, state }],
    },
  );
}
