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

  if (isPending) return <p>Loading artifact…</p>;
  if (isError || !artifact) return <p>This artifact is unavailable.</p>;
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
    <section className="artifact-detail">
      <header className="artifact-detail-header">
        <Link to="/app/artifacts">← Artifacts</Link>
        <p>{artifact.ai_contact_name}</p>
      </header>
      {blocker.state === 'blocked' ? (
        <div className="ai-error" role="alert">
          <span>You have unsaved changes.</span>
          <button type="button" onClick={() => blocker.proceed()}>
            Leave anyway
          </button>
          <button type="button" onClick={() => blocker.reset()}>
            Stay
          </button>
        </div>
      ) : null}
      <label>
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
        <button type="button" onClick={() => downloadArtifact(artifact, 'md')}>
          Export Markdown
        </button>
        <button type="button" onClick={() => downloadArtifact(artifact, 'txt')}>
          Export text
        </button>
      </div>
      <label>
        Current saved content
        <textarea
          className="artifact-content-editor"
          value={content}
          maxLength={100000}
          onChange={(event) => setContent(event.target.value)}
        />
      </label>
      <section className="artifact-revision-panel">
        <h2>Ask {artifact.ai_contact_name} to revise</h2>
        <textarea
          aria-label="Revision instruction"
          value={instruction}
          maxLength={8000}
          onChange={(event) => setInstruction(event.target.value)}
        />
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
          <p>AI revision is unavailable while this persona is archived.</p>
        ) : null}
        {revisionState !== 'idle' ? (
          <div className="artifact-proposal">
            <h3>Proposed revision</h3>
            <SafeMarkdown content={proposal} streaming={revisionState === 'streaming'} />
            {revisionState === 'ready' ? (
              <>
                <button type="button" onClick={saveProposal}>
                  Save revision
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProposal('');
                    setRevisionState('idle');
                  }}
                >
                  Discard
                </button>
              </>
            ) : null}
            {revisionState === 'error' ? (
              <button type="button" onClick={() => revise(true)}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      <section>
        <h2>Version history</h2>
        <ol className="artifact-version-list">
          {artifact.versions.map((version) => (
            <li key={version.id}>
              <span>
                Version {version.version_number} · {version.created_by === 'ai' ? 'AI' : 'You'}
              </span>
              {version.version_number === artifact.current_version_number ? (
                <strong>Current</strong>
              ) : (
                <button
                  type="button"
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
          ))}
        </ol>
      </section>
    </section>
  );
}
