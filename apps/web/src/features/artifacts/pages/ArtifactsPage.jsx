import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { artifactListQueryOptions, artifactKeys } from '../queries/artifactQueries.js';
import { setArtifactArchived } from '../api/artifactsApi.js';
import { ARTIFACT_TYPES } from '../utils/artifactTypes.js';

const TYPE_LABELS = Object.fromEntries(ARTIFACT_TYPES);

export function ArtifactsPage() {
  const queryClient = useQueryClient();
  const { data: artifacts = [], isPending } = useQuery(artifactListQueryOptions());
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const archive = useMutation({
    mutationFn: ({ id, archived }) => setArtifactArchived(id, archived),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: artifactKeys.list() }),
  });
  const filtered = useMemo(
    () =>
      artifacts.filter(
        (artifact) =>
          (type === 'all' || artifact.type === type) &&
          artifact.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [artifacts, search, type],
  );

  return (
    <section className="artifacts-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Artifacts</h1>
        </div>
        <Link className="button button--primary" to="/app/ai">
          Open AI contacts
        </Link>
      </header>
      <div className="artifact-toolbar">
        <input
          aria-label="Search artifacts"
          placeholder="Search by title"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter by type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="all">All types</option>
          {ARTIFACT_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {isPending ? <p>Loading artifacts…</p> : null}
      {!isPending && filtered.length === 0 ? (
        <div className="empty-card">
          <p>No artifacts match this view.</p>
          <Link to="/app/ai">Create one from an AI response</Link>
        </div>
      ) : (
        <ul className="artifact-list">
          {filtered.map((artifact) => (
            <li
              key={artifact.id}
              className="artifact-card"
              data-archived={Boolean(artifact.archived_at)}
            >
              <div>
                <Link to={`/app/artifacts/${artifact.id}`}>{artifact.title}</Link>
                <p>
                  {TYPE_LABELS[artifact.type]} · {artifact.ai_contact_name} ·{' '}
                  {new Date(artifact.updated_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => archive.mutate({ id: artifact.id, archived: !artifact.archived_at })}
              >
                {artifact.archived_at ? 'Restore' : 'Archive'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
