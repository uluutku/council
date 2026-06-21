import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { AuthContext } from '../../../app/providers/AuthContext.js';

// Shared render helper for contacts pages. Tests mock the contactsApi module, so
// real TanStack queries/mutations run against the mock, a realistic integration
// surface without standing up Supabase.
export function renderWithContacts(element, options = {}) {
  const {
    user = { id: 'me-0000-0000-0000-000000000000', email: 'me@example.test' },
    initialEntries = ['/'],
  } = options;

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
  };

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={initialEntries}>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

  return { ...utils, queryClient, auth };
}
