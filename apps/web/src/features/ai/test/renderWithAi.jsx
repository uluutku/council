import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Minimal provider wrapper for AI feature tests. The AI pages read server state
// through TanStack Query and the router only; the api/stream modules are mocked
// per test, so no Supabase client or auth context is required.
export function renderWithAi(children, { initialEntries = ['/'] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

export const AGENT_ID = 'a0000000-0000-4000-8000-000000000001';
export const CONVERSATION_ID = 'c0000000-0000-4000-8000-000000000002';

export function makeAccess(overrides = {}) {
  return {
    trial_started_at: '2026-06-22T10:00:00+00:00',
    trial_expires_at: '2026-06-29T10:00:00+00:00',
    trial_credits_remaining: 19,
    pro_enabled: false,
    access_state: 'trial_active',
    can_generate: true,
    ...overrides,
  };
}

export function makeAiMessage(overrides = {}) {
  return {
    id: 'm0000000-0000-4000-8000-000000000003',
    conversation_id: CONVERSATION_ID,
    role: 'user',
    content: 'Hello',
    client_message_id: 'cl000000-0000-4000-8000-000000000004',
    created_at: '2026-06-22T10:00:00+00:00',
    ...overrides,
  };
}
