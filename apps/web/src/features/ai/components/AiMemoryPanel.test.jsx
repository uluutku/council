import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiMemoryPanel } from './AiMemoryPanel.jsx';
import { CONVERSATION_ID, renderWithAi } from '../test/renderWithAi.jsx';
import { aiKeys } from '../../../lib/query-keys/ai.js';

vi.mock('../api/aiApi.js', () => ({
  getAiMemorySettings: vi.fn(),
  listAiMemories: vi.fn(),
  createAiMemory: vi.fn(),
  updateAiMemory: vi.fn(),
  deleteAiMemory: vi.fn(),
  deleteAllAiMemories: vi.fn(),
  setAiMemoryMode: vi.fn(),
}));

import * as aiApi from '../api/aiApi.js';

const MEMORY = {
  id: 'e0000000-0000-4000-8000-000000000001',
  conversation_id: CONVERSATION_ID,
  category: 'project',
  content: 'Council is my current project.',
  source_message_id: null,
  created_at: '2026-06-22T10:00:00+00:00',
  updated_at: '2026-06-22T10:00:00+00:00',
};
const PREFERENCE_MEMORY = {
  ...MEMORY,
  id: 'e0000000-0000-4000-8000-000000000002',
  category: 'preference',
  content: 'Prefer concise answers.',
};

beforeEach(() => {
  vi.clearAllMocks();
  aiApi.getAiMemorySettings.mockResolvedValue({
    conversation_id: CONVERSATION_ID,
    memory_mode: 'curated',
  });
  aiApi.listAiMemories.mockResolvedValue([MEMORY, PREFERENCE_MEMORY]);
  aiApi.updateAiMemory.mockResolvedValue(MEMORY);
  aiApi.deleteAiMemory.mockResolvedValue(true);
  aiApi.deleteAllAiMemories.mockResolvedValue(1);
  aiApi.setAiMemoryMode.mockResolvedValue({
    conversation_id: CONVERSATION_ID,
    memory_mode: 'conversation_only',
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('AiMemoryPanel', () => {
  it('lists, edits, deletes, clears, and switches conversation-scoped memory', async () => {
    renderWithAi(<AiMemoryPanel conversationId={CONVERSATION_ID} onClose={() => {}} />);

    expect(await screen.findByText(MEMORY.content)).toBeInTheDocument();
    expect(screen.getByText('2 / 50')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Filter category'), 'preference');
    expect(screen.queryByText(MEMORY.content)).not.toBeInTheDocument();
    expect(screen.getByText(PREFERENCE_MEMORY.content)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Filter category'), 'all');
    await userEvent.type(screen.getByLabelText('Search memories'), 'project');
    expect(screen.getByText(MEMORY.content)).toBeInTheDocument();
    expect(screen.queryByText(PREFERENCE_MEMORY.content)).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search memories'));
    await userEvent.selectOptions(screen.getByLabelText('Memory mode'), 'conversation_only');
    await waitFor(() =>
      expect(aiApi.setAiMemoryMode).toHaveBeenCalledWith(CONVERSATION_ID, 'conversation_only'),
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const input = screen.getByLabelText('Memory text');
    await userEvent.clear(input);
    await userEvent.type(input, 'Updated project memory.');
    expect(screen.getByText('23 / 500')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save memory' }));
    await waitFor(() =>
      expect(aiApi.updateAiMemory).toHaveBeenCalledWith(
        MEMORY.id,
        expect.objectContaining({ content: 'Updated project memory.' }),
      ),
    );

    await userEvent.click((await screen.findAllByRole('button', { name: 'Delete' }))[0]);
    await waitFor(() => expect(aiApi.deleteAiMemory).toHaveBeenCalledWith(MEMORY.id));

    await userEvent.click(screen.getByRole('button', { name: 'Delete all memories' }));
    await waitFor(() => expect(aiApi.deleteAllAiMemories).toHaveBeenCalledWith(CONVERSATION_ID));
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  it('uses separate query keys for separate conversations', async () => {
    const otherConversation = 'f0000000-0000-4000-8000-000000000002';
    expect(aiKeys.memories(CONVERSATION_ID)).toEqual(['ai', 'memories', CONVERSATION_ID]);
    expect(aiKeys.memories(otherConversation)).toEqual(['ai', 'memories', otherConversation]);
    expect(aiKeys.memories(CONVERSATION_ID)).not.toEqual(aiKeys.memories(otherConversation));
  });
});
