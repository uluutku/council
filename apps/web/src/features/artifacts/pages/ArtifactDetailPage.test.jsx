import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactDetailPage } from './ArtifactDetailPage.jsx';

vi.mock('../api/artifactsApi.js', () => ({
  getArtifact: vi.fn(),
  createArtifactVersion: vi.fn(),
  restoreArtifactVersion: vi.fn(),
  saveArtifactRevision: vi.fn(),
  renameArtifact: vi.fn(),
}));
vi.mock('../api/artifactRevisionStream.js', () => ({ streamArtifactRevision: vi.fn() }));

import {
  createArtifactVersion,
  getArtifact,
  restoreArtifactVersion,
  saveArtifactRevision,
} from '../api/artifactsApi.js';
import { streamArtifactRevision } from '../api/artifactRevisionStream.js';

const ARTIFACT_ID = 'a9000000-0000-4000-8000-000000000001';
const artifact = {
  id: ARTIFACT_ID,
  ai_conversation_id: 'a9000000-0000-4000-8000-000000000002',
  agent_id: 'a9000000-0000-4000-8000-000000000003',
  persona_id: null,
  type: 'plan',
  title: 'Weekly plan',
  current_version_number: 2,
  current_content: 'Current saved plan',
  ai_contact_name: 'Council Assistant',
  ai_revision_available: true,
  created_at: '2026-06-23T10:00:00+00:00',
  updated_at: '2026-06-23T10:00:00+00:00',
  archived_at: null,
  versions: [
    {
      id: 'a9000000-0000-4000-8000-000000000004',
      version_number: 2,
      content: 'Current saved plan',
      source_ai_message_id: null,
      created_by: 'user',
      created_at: '2026-06-23T10:00:00+00:00',
    },
    {
      id: 'a9000000-0000-4000-8000-000000000005',
      version_number: 1,
      content: 'Original plan',
      source_ai_message_id: 'a9000000-0000-4000-8000-000000000006',
      created_by: 'user',
      created_at: '2026-06-23T09:00:00+00:00',
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/app/artifacts/:artifactId', element: <ArtifactDetailPage /> },
      { path: '/app/artifacts', element: <p>Artifact list</p> },
    ],
    { initialEntries: [`/app/artifacts/${ARTIFACT_ID}`] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getArtifact.mockResolvedValue(artifact);
});

describe('ArtifactDetailPage', () => {
  it('saves a manual immutable revision', async () => {
    createArtifactVersion.mockResolvedValue({
      ...artifact,
      current_version_number: 3,
      current_content: 'Edited plan',
    });
    renderPage();
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Unsaved title');
    const editor = await screen.findByLabelText('Current saved content');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Edited plan');
    await userEvent.click(screen.getByRole('button', { name: 'Save manual revision' }));
    await waitFor(() =>
      expect(createArtifactVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          artifact_id: ARTIFACT_ID,
          content: 'Edited plan',
          created_by: 'user',
          expected_current_version: 2,
        }),
      ),
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved title');
  });

  it('streams a proposal, supports discard, and saves only after confirmation', async () => {
    streamArtifactRevision.mockImplementation(async ({ onEvent }) => {
      onEvent({ type: 'start', run_id: '11111111-1111-4111-8111-111111111111' });
      onEvent({ type: 'delta', text: 'Concise ' });
      onEvent({ type: 'proposal_done', content: 'Concise plan', credits_remaining: 17 });
    });
    saveArtifactRevision.mockResolvedValue({
      ...artifact,
      current_version_number: 3,
      current_content: 'Concise plan',
    });
    renderPage();
    await userEvent.type(await screen.findByLabelText('Revision instruction'), 'Make it concise');
    await userEvent.click(screen.getByRole('button', { name: 'Propose revision' }));
    expect(await screen.findByText('Concise plan')).toBeInTheDocument();
    expect(saveArtifactRevision).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Concise plan')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Propose revision' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save revision' }));
    await waitFor(() =>
      expect(saveArtifactRevision).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        expect.any(String),
      ),
    );
  });

  it('restores an older version as a new version', async () => {
    restoreArtifactVersion.mockResolvedValue({
      ...artifact,
      current_version_number: 3,
      current_content: 'Original plan',
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(restoreArtifactVersion).toHaveBeenCalledWith(ARTIFACT_ID, 1, expect.any(String)),
    );
  });

  it('warns before route navigation with unsaved changes', async () => {
    renderPage();
    const editor = await screen.findByLabelText('Current saved content');
    await userEvent.type(editor, ' changed');
    await userEvent.click(screen.getByRole('link', { name: /Artifacts/ }));
    expect(await screen.findByText('You have unsaved changes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeInTheDocument();
  });
});
