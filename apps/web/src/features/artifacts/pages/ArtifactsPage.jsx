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

  const hasArtifacts = artifacts.length > 0;
  const isFiltering = search.trim() !== '' || type !== 'all';

  return (
    <section className="artifacts-page app-page">
      <header className="artifacts-header">
        <div className="artifacts-header-text">
          <p className="eyebrow">Workspace</p>
          <h1>Artifacts</h1>
          <p className="artifacts-header-sub">
            Documents, plans, and notes you saved from AI conversations.
          </p>
        </div>
        <Link className="button button--primary" to="/app/ai">
          Open AI contacts
        </Link>
      </header>

      <div className="artifact-toolbar" role="search">
        <span className="artifact-search-field">
          <input
            aria-label="Search artifacts"
            placeholder="Search by title"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </span>
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

      {isPending ? (
        <div className="artifacts-status" aria-live="polite">
          <p>Loading artifacts…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="artifacts-empty" role="status">
          {hasArtifacts && isFiltering ? (
            <>
              <p className="artifacts-empty-title">No artifacts match this view.</p>
              <p className="artifacts-empty-hint">
                Try a different title or clear the type filter.
              </p>
            </>
          ) : (
            <>
              <p className="artifacts-empty-title">No artifacts yet.</p>
              <p className="artifacts-empty-hint">
                Save a useful AI response as an artifact to keep and revise it here.
              </p>
              <Link className="button button--secondary button--small" to="/app/ai">
                Create one from an AI response
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="artifact-list">
          {filtered.map((artifact) => (
            <li
              key={artifact.id}
              className="artifact-row"
              data-archived={Boolean(artifact.archived_at)}
            >
              <div className="artifact-row-main">
                <div className="artifact-row-title">
                  <Link to={`/app/artifacts/${artifact.id}`}>{artifact.title}</Link>
                  {artifact.archived_at ? (
                    <span className="artifact-chip" data-tone="muted">
                      Archived
                    </span>
                  ) : null}
                </div>
                <p className="artifact-row-meta">
                  <span className="artifact-chip" data-tone="type">
                    {TYPE_LABELS[artifact.type]}
                  </span>
                  <span className="artifact-row-dot" aria-hidden="true">
                    ·
                  </span>
                  <span>{artifact.ai_contact_name}</span>
                  <span className="artifact-row-dot" aria-hidden="true">
                    ·
                  </span>
                  <time dateTime={artifact.updated_at}>
                    {new Date(artifact.updated_at).toLocaleString()}
                  </time>
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
