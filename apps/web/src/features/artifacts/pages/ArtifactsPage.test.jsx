import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactsPage } from './ArtifactsPage.jsx';

vi.mock('../api/artifactsApi.js', () => ({
  listMyArtifacts: vi.fn(),
  setArtifactArchived: vi.fn(),
}));

import { listMyArtifacts, setArtifactArchived } from '../api/artifactsApi.js';

const artifacts = [
  {
    id: 'a9000000-0000-4000-8000-000000000001',
    type: 'plan',
    title: 'Weekly plan',
    ai_contact_name: 'Council Assistant',
    updated_at: '2026-06-23T10:00:00+00:00',
    archived_at: null,
  },
  {
    id: 'a9000000-0000-4000-8000-000000000002',
    type: 'checklist',
    title: 'Launch checklist',
    ai_contact_name: 'Coding Partner',
    updated_at: '2026-06-23T09:00:00+00:00',
    archived_at: '2026-06-23T09:30:00+00:00',
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ArtifactsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMyArtifacts.mockResolvedValue(artifacts);
});

describe('ArtifactsPage', () => {
  it('searches and filters the artifact list', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Weekly plan' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'checklist');
    expect(screen.queryByRole('link', { name: 'Weekly plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Launch checklist' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search artifacts'), 'missing');
    expect(screen.getByText('No artifacts match this view.')).toBeInTheDocument();
  });

  it('archives through the controlled API', async () => {
    setArtifactArchived.mockResolvedValue(artifacts[0]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(setArtifactArchived).toHaveBeenCalledWith(artifacts[0].id, true));
  });
});
