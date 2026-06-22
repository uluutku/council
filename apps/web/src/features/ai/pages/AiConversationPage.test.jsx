import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { AiConversationPage } from './AiConversationPage.jsx';
import { CONVERSATION_ID, makeAccess, makeAiMessage, renderWithAi } from '../test/renderWithAi.jsx';

vi.mock('../api/aiApi.js', () => ({
  listAiMessages: vi.fn(),
  getMyAiAccess: vi.fn(),
  listMyAiConversations: vi.fn(),
  listAiAgents: vi.fn(),
  getOrCreateAiConversation: vi.fn(),
}));
vi.mock('../api/aiChatStream.js', () => ({ streamAiChat: vi.fn() }));

import * as aiApi from '../api/aiApi.js';
import { streamAiChat } from '../api/aiChatStream.js';

function renderConversation() {
  return renderWithAi(
    <Routes>
      <Route path="/app/ai/:conversationId" element={<AiConversationPage />} />
    </Routes>,
    { initialEntries: [`/app/ai/${CONVERSATION_ID}`] },
  );
}

beforeEach(() => {
  aiApi.listMyAiConversations.mockResolvedValue([]);
  aiApi.getMyAiAccess.mockResolvedValue(makeAccess());
});
afterEach(() => vi.clearAllMocks());

describe('AiConversationPage', () => {
  it('loads and renders persisted history', async () => {
    aiApi.listAiMessages.mockResolvedValue([
      makeAiMessage({ id: 'm1', role: 'user', content: 'Plan my week' }),
      makeAiMessage({ id: 'm2', role: 'assistant', content: 'Here is a plan.' }),
    ]);

    renderConversation();

    expect(await screen.findByText('Plan my week')).toBeInTheDocument();
    expect(screen.getByText('Here is a plan.')).toBeInTheDocument();
  });

  it('streams a response, then persists and decrements credits', async () => {
    const server = [];
    let credits = 19;
    aiApi.listAiMessages.mockImplementation(async () => [...server]);
    aiApi.getMyAiAccess.mockImplementation(async () =>
      makeAccess({ trial_credits_remaining: credits }),
    );

    streamAiChat.mockImplementation(async ({ clientMessageId, content, onEvent }) => {
      onEvent({ type: 'start', run_id: '11111111-1111-4111-8111-111111111111' });
      onEvent({ type: 'delta', text: 'Hello ' });
      onEvent({ type: 'delta', text: 'world' });
      // The server persists the exchange and consumes a credit.
      server.push(
        makeAiMessage({ id: 'su', role: 'user', content, client_message_id: clientMessageId }),
        makeAiMessage({ id: 'sa', role: 'assistant', content: 'Hello world' }),
      );
      credits = 18;
      onEvent({
        type: 'done',
        message: {
          id: 'sa',
          role: 'assistant',
          content: 'Hello world',
          created_at: '2026-06-22T10:00:00+00:00',
        },
        credits_remaining: 18,
      });
    });

    renderConversation();

    const composer = await screen.findByLabelText('Message Council Assistant');
    await userEvent.type(composer, 'Say hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    await waitFor(() => expect(streamAiChat).toHaveBeenCalledTimes(1));
    // Credits reflect the consumed generation.
    expect(await screen.findByText('18')).toBeInTheDocument();
  });

  it('shows a retryable error when generation fails, then recovers on retry', async () => {
    const server = [];
    aiApi.listAiMessages.mockImplementation(async () => [...server]);
    let attempt = 0;
    streamAiChat.mockImplementation(async ({ onEvent }) => {
      attempt += 1;
      if (attempt === 1) {
        onEvent({ type: 'error', category: 'provider_unavailable', credits_remaining: 20 });
        return;
      }
      server.push(makeAiMessage({ id: 'sa', role: 'assistant', content: 'Recovered answer' }));
      onEvent({
        type: 'done',
        message: {
          id: 'sa',
          role: 'assistant',
          content: 'Recovered answer',
          created_at: '2026-06-22T10:00:00+00:00',
        },
        credits_remaining: 19,
      });
    });

    renderConversation();

    const composer = await screen.findByLabelText('Message Council Assistant');
    await userEvent.type(composer, 'Hi');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/AI provider is temporarily unavailable/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Recovered answer')).toBeInTheDocument();
  });
});
