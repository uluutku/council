import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createArtifactVersion,
  renameArtifact,
  restoreArtifactVersion,
  saveArtifactRevision,
} from '../api/artifactsApi.js';
import { streamArtifactRevision } from '../api/artifactRevisionStream.js';
import { artifactDetailQueryOptions, artifactKeys } from '../queries/artifactQueries.js';
import { downloadArtifact } from '../utils/artifactExport.js';
import { SafeMarkdown } from '../../ai/components/SafeMarkdown.jsx';

export function ArtifactDetailPage() {
  const { artifactId } = useParams();
  const { data: artifact, isPending, isError } = useQuery(artifactDetailQueryOptions(artifactId));

  if (isPending)
    return (
      <div className="artifacts-status" aria-live="polite">
        <p>Loading artifact…</p>
      </div>
    );
  if (isError || !artifact)
    return (
      <div className="artifacts-empty" role="alert">
        <p className="artifacts-empty-title">This artifact is unavailable.</p>
        <p className="artifacts-empty-hint">
          It may have been removed, or you no longer have access to it.
        </p>
        <Link className="button button--secondary button--small" to="/app/artifacts">
          ← Artifacts
        </Link>
      </div>
    );
  return <ArtifactEditor key={artifact.id} artifact={artifact} />;
}

function ArtifactEditor({ artifact }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(artifact.title);
  const [content, setContent] = useState(artifact.current_content);
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState('');
  const [revisionState, setRevisionState] = useState('idle');
  const revisionRequest = useRef(null);
  const revisionRun = useRef(null);
  const revisionSaveRequest = useRef(null);

  const artifactId = artifact.id;
  const dirty = title !== artifact.title || content !== artifact.current_content;
  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const blocker = useBlocker(dirty);

  const refresh = (next) => {
    queryClient.setQueryData(artifactKeys.detail(artifactId), next);
    queryClient.invalidateQueries({ queryKey: artifactKeys.list() });
  };
  const manualSave = useMutation({
    mutationFn: () =>
      createArtifactVersion({
        artifact_id: artifact.id,
        content,
        created_by: 'user',
        client_request_id: crypto.randomUUID(),
        expected_current_version: artifact.current_version_number,
      }),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: () => renameArtifact(artifact.id, title),
    onSuccess: refresh,
  });

  async function revise(retry = false) {
    const requestId =
      retry && revisionRequest.current ? revisionRequest.current : crypto.randomUUID();
    revisionRequest.current = requestId;
    setProposal('');
    setRevisionState('streaming');
    try {
      await streamArtifactRevision({
        artifactId: artifact.id,
        instruction,
        clientRequestId: requestId,
        onEvent: (event) => {
          if (event.type === 'start') revisionRun.current = event.run_id;
          if (event.type === 'delta') setProposal((value) => value + event.text);
          if (event.type === 'proposal_done') {
            setProposal(event.content);
            setRevisionState('ready');
          }
          if (event.type === 'error') setRevisionState('error');
        },
      });
    } catch {
      setRevisionState('error');
    }
  }

  async function saveProposal() {
    revisionSaveRequest.current ??= crypto.randomUUID();
    const next = await saveArtifactRevision(revisionRun.current, revisionSaveRequest.current);
    setTitle(next.title);
    setContent(next.current_content);
    refresh(next);
    setProposal('');
    setRevisionState('idle');
  }

  return (
    <section className="artifact-detail app-page">
      <header className="artifact-detail-header">
        <Link className="artifact-back-link" to="/app/artifacts">
          ← Artifacts
        </Link>
        <p className="artifact-detail-byline">
          <span className="artifact-chip" data-tone="ai">
            {artifact.ai_contact_name}
          </span>
          {dirty ? <span className="artifact-dirty-flag">Unsaved changes</span> : null}
        </p>
      </header>

      {blocker.state === 'blocked' ? (
        <div className="ai-error" role="alert">
          <span>You have unsaved changes.</span>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => blocker.proceed()}
          >
            Leave anyway
          </button>
          <button
            type="button"
            className="button button--primary button--small"
            onClick={() => blocker.reset()}
          >
            Stay
          </button>
        </div>
      ) : null}

      <div className="artifact-workspace">
        <label className="artifact-title-field">
          Title
          <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="artifact-actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={!title.trim() || title === artifact.title}
            onClick={() => rename.mutate()}
          >
            Save title
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!content || content === artifact.current_content || artifact.archived_at}
            onClick={() => manualSave.mutate()}
          >
            Save manual revision
          </button>
          <span className="artifact-actions-spacer" aria-hidden="true" />
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => downloadArtifact(artifact, 'md')}
          >
            Export Markdown
          </button>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => downloadArtifact(artifact, 'txt')}
          >
            Export text
          </button>
        </div>

        <label className="artifact-content-field">
          Current saved content
          <textarea
            className="artifact-content-editor"
            value={content}
            maxLength={100000}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
      </div>

      <section className="artifact-revision-panel">
        <h2>Ask {artifact.ai_contact_name} to revise</h2>
        <textarea
          aria-label="Revision instruction"
          placeholder="Describe the change you want, e.g. make it more concise."
          value={instruction}
          maxLength={8000}
          onChange={(event) => setInstruction(event.target.value)}
        />
        <div className="artifact-revision-actions">
          <button
            type="button"
            className="button button--primary"
            disabled={
              !instruction.trim() ||
              !artifact.ai_revision_available ||
              artifact.archived_at ||
              revisionState === 'streaming'
            }
            onClick={() => revise(false)}
          >
            {revisionState === 'streaming' ? 'Revising…' : 'Propose revision'}
          </button>
          {!artifact.ai_revision_available ? (
            <p className="artifact-revision-note">
              AI revision is unavailable while this persona is archived.
            </p>
          ) : null}
        </div>
        {revisionState !== 'idle' ? (
          <div className="artifact-proposal" data-state={revisionState}>
            <div className="artifact-proposal-head">
              <h3>Proposed revision</h3>
              {revisionState === 'streaming' ? (
                <span className="artifact-chip" data-tone="ai">
                  Streaming…
                </span>
              ) : null}
            </div>
            <div className="artifact-proposal-body">
              <SafeMarkdown content={proposal} streaming={revisionState === 'streaming'} />
            </div>
            {revisionState === 'ready' ? (
              <div className="artifact-proposal-actions">
                <button
                  type="button"
                  className="button button--primary button--small"
                  onClick={saveProposal}
                >
                  Save revision
                </button>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => {
                    setProposal('');
                    setRevisionState('idle');
                  }}
                >
                  Discard
                </button>
              </div>
            ) : null}
            {revisionState === 'error' ? (
              <div className="artifact-proposal-actions">
                <p className="artifact-revision-note" data-tone="error">
                  The revision could not be generated.
                </p>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => revise(true)}
                >
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="artifact-history">
        <h2>Version history</h2>
        <ol className="artifact-version-list">
          {artifact.versions.map((version) => {
            const isCurrent = version.version_number === artifact.current_version_number;
            return (
              <li key={version.id} data-current={isCurrent}>
                <span className="artifact-version-label">
                  <span className="artifact-version-number">Version {version.version_number}</span>
                  <span
                    className="artifact-chip"
                    data-tone={version.created_by === 'ai' ? 'ai' : 'type'}
                  >
                    {version.created_by === 'ai' ? 'AI' : 'You'}
                  </span>
                </span>
                {isCurrent ? (
                  <strong className="artifact-version-current">Current</strong>
                ) : (
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={async () => {
                      const next = await restoreArtifactVersion(
                        artifact.id,
                        version.version_number,
                        crypto.randomUUID(),
                      );
                      setTitle(next.title);
                      setContent(next.current_content);
                      refresh(next);
                    }}
                  >
                    Restore
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}
