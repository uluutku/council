import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { AiCataloguePage } from './AiCataloguePage.jsx';
import {
  AGENT_ID,
  CONVERSATION_ID,
  PERSONA_ID,
  makeAccess,
  makeConversation,
  makePersona,
  renderWithAi,
} from '../test/renderWithAi.jsx';

vi.mock('../api/aiApi.js', () => ({
  listAiAgents: vi.fn(),
  getMyAiAccess: vi.fn(),
  getOrCreateAiConversation: vi.fn(),
  listMyAiConversations: vi.fn(),
  listAiMessages: vi.fn(),
  listMyCustomPersonas: vi.fn(),
  createCustomPersona: vi.fn(),
  updateCustomPersona: vi.fn(),
  archiveCustomPersona: vi.fn(),
  restoreCustomPersona: vi.fn(),
  getAiProviderMetadata: vi.fn(),
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

function baseMocks() {
  aiApi.listAiAgents.mockResolvedValue([AGENT]);
  aiApi.getMyAiAccess.mockResolvedValue(makeAccess());
  aiApi.listMyCustomPersonas.mockResolvedValue([]);
  aiApi.getAiProviderMetadata.mockResolvedValue({
    status: 'ok',
    provider_mode: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    vision_model: 'deepseek/deepseek-v4-flash',
  });
}

afterEach(() => vi.clearAllMocks());

describe('AiCataloguePage built-in', () => {
  it('lists the assistant with its AI label, disclosure, and credits', async () => {
    baseMocks();
    aiApi.getMyAiAccess.mockResolvedValue(makeAccess({ trial_credits_remaining: 12 }));

    renderWithAi(<AiCataloguePage />);

    expect(await screen.findByText('Council Assistant')).toBeInTheDocument();
    expect(screen.getAllByText('AI').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/AI messages are processed by Council’s configured AI provider/i),
    ).toBeInTheDocument();
    expect(await screen.findByText('Live provider')).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
  });

  it('opens a built-in conversation and navigates to it', async () => {
    baseMocks();
    aiApi.getOrCreateAiConversation.mockResolvedValue(makeConversation({ id: CONVERSATION_ID }));

    renderWithAi(
      <Routes>
        <Route path="/app/ai" element={<AiCataloguePage />} />
        <Route path="/app/ai/:conversationId" element={<div>conversation opened</div>} />
      </Routes>,
      { initialEntries: ['/app/ai'] },
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Open conversation' }));

    await waitFor(() =>
      expect(aiApi.getOrCreateAiConversation).toHaveBeenCalledWith({ agentId: AGENT_ID }),
    );
    expect(await screen.findByText('conversation opened')).toBeInTheDocument();
  });
});

describe('AiCataloguePage personas', () => {
  async function openPersonaTab() {
    await userEvent.click(await screen.findByRole('tab', { name: 'My personas' }));
  }

  it('creates a persona with validation', async () => {
    baseMocks();
    aiApi.createCustomPersona.mockResolvedValue(makePersona());

    renderWithAi(<AiCataloguePage />);
    await openPersonaTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Create persona' }));

    const save = screen.getByRole('button', { name: 'Save persona' });
    expect(save).toBeDisabled(); // name + instructions required

    await userEvent.type(screen.getByLabelText('Name'), 'My Coach');
    expect(save).toBeDisabled(); // still needs instructions
    await userEvent.type(screen.getByLabelText('Instructions'), 'Be encouraging.');
    expect(save).toBeEnabled();

    await userEvent.click(save);
    await waitFor(() => expect(aiApi.createCustomPersona).toHaveBeenCalledTimes(1));
    expect(aiApi.createCustomPersona).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Coach', instructions: 'Be encouraging.' }),
    );
  });

  it('edits an existing persona', async () => {
    baseMocks();
    aiApi.listMyCustomPersonas.mockResolvedValue([makePersona()]);
    aiApi.updateCustomPersona.mockResolvedValue(makePersona({ name: 'Renamed' }));

    renderWithAi(<AiCataloguePage />);
    await openPersonaTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText('Name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save persona' }));

    await waitFor(() =>
      expect(aiApi.updateCustomPersona).toHaveBeenCalledWith(
        PERSONA_ID,
        expect.objectContaining({ name: 'Renamed' }),
      ),
    );
  });

  it('archives an active persona', async () => {
    baseMocks();
    aiApi.listMyCustomPersonas.mockResolvedValue([makePersona()]);
    aiApi.archiveCustomPersona.mockResolvedValue(true);

    renderWithAi(<AiCataloguePage />);
    await openPersonaTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(aiApi.archiveCustomPersona).toHaveBeenCalledWith(PERSONA_ID));
  });

  it('shows an archived persona with a restore action', async () => {
    baseMocks();
    aiApi.listMyCustomPersonas.mockResolvedValue([makePersona({ archived: true })]);
    aiApi.restoreCustomPersona.mockResolvedValue(true);

    renderWithAi(<AiCataloguePage />);
    await openPersonaTab();

    expect(
      within(screen.getByLabelText('AI assistants')).getByText(/Archived/),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(aiApi.restoreCustomPersona).toHaveBeenCalledWith(PERSONA_ID));
  });
});
