import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../../app/providers/AuthContext.js';

// Minimal provider wrapper for AI feature tests. The AI pages read server state
// through TanStack Query and the router only; the api/stream modules are mocked
// per test, so no Supabase client or auth context is required.
export function renderWithAi(children, { initialEntries = ['/'] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const auth = {
    session: { user: { id: USER_ID, email: 'ai-user@example.test' } },
    user: { id: USER_ID, email: 'ai-user@example.test' },
    profile: { id: USER_ID, username: 'ai-user', display_name: 'AI User' },
    settings: {},
    isAuthenticated: true,
    isOnboarded: true,
    isHydrating: false,
    accountError: null,
    refreshProfile: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    client: {},
  };
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

export const AGENT_ID = 'a0000000-0000-4000-8000-000000000001';
export const USER_ID = 'b0000000-0000-4000-8000-000000000001';
export const CONVERSATION_ID = 'c0000000-0000-4000-8000-000000000002';

export function makeAccess(overrides = {}) {
  return {
    trial_started_at: '2026-06-22T10:00:00+00:00',
    trial_expires_at: '2026-06-29T10:00:00+00:00',
    trial_credits_remaining: 19,
    is_pro: false,
    pro_expires_at: null,
    pro_credits_remaining: 0,
    active_credit_source: 'trial',
    access_state: 'trial_active',
    can_generate: true,
    ...overrides,
  };
}

export const PERSONA_ID = 'p0000000-0000-4000-8000-000000000005';

export function makePersona(overrides = {}) {
  return {
    id: PERSONA_ID,
    name: 'My Coach',
    description: 'A personal coach',
    instructions: 'Be encouraging and ask one guiding question.',
    tone: 'warm',
    verbosity: 'concise',
    avatar_path: null,
    archived: false,
    created_at: '2026-06-22T10:00:00+00:00',
    updated_at: '2026-06-22T10:00:00+00:00',
    ...overrides,
  };
}

export function makeConversation(overrides = {}) {
  return {
    id: CONVERSATION_ID,
    kind: 'builtin',
    agent_id: AGENT_ID,
    persona_id: null,
    display_name: 'Council Assistant',
    description: 'A thoughtful general-purpose assistant.',
    avatar_key: null,
    archived: false,
    created_at: '2026-06-22T10:00:00+00:00',
    updated_at: '2026-06-22T10:00:00+00:00',
    last_message_at: null,
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
    attachments: [],
    ...overrides,
  };
}
