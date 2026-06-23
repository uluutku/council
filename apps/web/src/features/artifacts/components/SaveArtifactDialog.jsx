import { useState } from 'react';
import { ARTIFACT_TYPES } from '../utils/artifactTypes.js';

export function SaveArtifactDialog({ message, onSave, onClose, saving }) {
  const [type, setType] = useState('document');
  const [title, setTitle] = useState('Untitled artifact');
  const [content, setContent] = useState(message.content);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card artifact-create-dialog" role="dialog" aria-modal="true">
        <h2>Save as artifact</h2>
        <label>
          Artifact type
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {ARTIFACT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Content preview
          <textarea
            className="artifact-content-editor"
            value={content}
            maxLength={100000}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={saving || !title.trim() || !content}
            onClick={() => onSave({ type, title: title.trim(), content })}
          >
            {saving ? 'Saving…' : 'Save artifact'}
          </button>
        </div>
      </section>
    </div>
  );
}
