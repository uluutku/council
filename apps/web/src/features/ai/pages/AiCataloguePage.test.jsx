import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { AiCataloguePage } from './AiCataloguePage.jsx';
import { AGENT_ID, CONVERSATION_ID, makeAccess, renderWithAi } from '../test/renderWithAi.jsx';

vi.mock('../api/aiApi.js', () => ({
  listAiAgents: vi.fn(),
  getMyAiAccess: vi.fn(),
  getOrCreateAiConversation: vi.fn(),
  listMyAiConversations: vi.fn(),
  listAiMessages: vi.fn(),
}));

import * as aiApi from '../api/aiApi.js';

const AGENT = {
  id: AGENT_ID,
  slug: 'council-assistant',
  name: 'Council Assistant',
  description: 'A thoughtful general-purpose assistant.',
  avatar_key: null,
  enabled: true,
};

afterEach(() => vi.clearAllMocks());

describe('AiCataloguePage', () => {
  it('lists the assistant with its AI label, disclosure, and credits', async () => {
    aiApi.listAiAgents.mockResolvedValue([AGENT]);
    aiApi.getMyAiAccess.mockResolvedValue(makeAccess({ trial_credits_remaining: 12 }));

    renderWithAi(<AiCataloguePage />);

    expect(await screen.findByText('Council Assistant')).toBeInTheDocument();
    expect(screen.getAllByText('AI').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/AI messages are processed by Council’s configured AI provider/i),
    ).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
  });

  it('opens a conversation and navigates to it', async () => {
    aiApi.listAiAgents.mockResolvedValue([AGENT]);
    aiApi.getMyAiAccess.mockResolvedValue(makeAccess());
    aiApi.getOrCreateAiConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      agent_id: AGENT_ID,
      agent_slug: 'council-assistant',
      agent_name: 'Council Assistant',
      created_at: '2026-06-22T10:00:00+00:00',
      updated_at: '2026-06-22T10:00:00+00:00',
      last_message_at: null,
    });

    renderWithAi(
      <Routes>
        <Route path="/app/ai" element={<AiCataloguePage />} />
        <Route path="/app/ai/:conversationId" element={<div>conversation opened</div>} />
      </Routes>,
      { initialEntries: ['/app/ai'] },
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Open conversation' }));

    await waitFor(() => expect(aiApi.getOrCreateAiConversation).toHaveBeenCalledWith(AGENT_ID));
    expect(await screen.findByText('conversation opened')).toBeInTheDocument();
  });
});
