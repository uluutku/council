import { useId, useState } from 'react';

const TONES = ['warm', 'balanced', 'direct', 'playful', 'formal'];
const VERBOSITIES = ['concise', 'balanced', 'detailed'];

const TONE_SUMMARY = {
  warm: 'warm and encouraging',
  balanced: 'balanced and professional',
  direct: 'direct and to the point',
  playful: 'light and playful',
  formal: 'formal and precise',
};
const VERBOSITY_SUMMARY = {
  concise: 'brief replies',
  balanced: 'moderate detail',
  detailed: 'thorough, detailed replies',
};

// Focused editor for a private custom persona. It exposes the persona's name,
// description, instructions, tone, and verbosity — never the assembled system
// prompt — and shows a plain-language summary of the resulting style.
export function PersonaEditor({ initial, onSubmit, onCancel, isSaving, errorMessage }) {
  const ids = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [tone, setTone] = useState(initial?.tone ?? 'balanced');
  const [verbosity, setVerbosity] = useState(initial?.verbosity ?? 'balanced');

  const trimmedName = name.trim();
  const canSave =
    !isSaving &&
    trimmedName.length >= 2 &&
    trimmedName.length <= 50 &&
    instructions.trim().length >= 1;

  return (
    <form
      className="persona-editor"
      aria-label={initial ? 'Edit persona' : 'Create persona'}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSubmit({ name: trimmedName, description, instructions, tone, verbosity });
      }}
    >
      <h2 className="persona-editor-title">{initial ? 'Edit persona' : 'New persona'}</h2>
      <p className="persona-editor-note">
        Personas are private to your account. No one else can see, open, or chat with them.
      </p>

      <div className="form-field">
        <label htmlFor={`${ids}-name`}>Name</label>
        <input
          id={`${ids}-name`}
          value={name}
          maxLength={50}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Patient Tutor"
        />
      </div>

      <div className="form-field">
        <label htmlFor={`${ids}-description`}>Description (optional)</label>
        <input
          id={`${ids}-description`}
          value={description}
          maxLength={160}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short note for yourself"
        />
      </div>

      <div className="form-field">
        <label htmlFor={`${ids}-instructions`}>Instructions</label>
        <textarea
          id={`${ids}-instructions`}
          className="persona-instructions"
          value={instructions}
          maxLength={4000}
          rows={5}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Describe how this persona should behave and respond."
        />
        <span className="field-hint persona-editor-count">{instructions.length} / 4000</span>
      </div>

      <div className="persona-editor-selects">
        <div className="form-field">
          <label htmlFor={`${ids}-tone`}>Tone</label>
          <select id={`${ids}-tone`} value={tone} onChange={(event) => setTone(event.target.value)}>
            {TONES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`${ids}-verbosity`}>Verbosity</label>
          <select
            id={`${ids}-verbosity`}
            value={verbosity}
            onChange={(event) => setVerbosity(event.target.value)}
          >
            {VERBOSITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="persona-summary" aria-live="polite">
        Summary: {trimmedName || 'This persona'} will reply in a {TONE_SUMMARY[tone]} tone with{' '}
        {VERBOSITY_SUMMARY[verbosity]}.
      </p>

      {errorMessage ? (
        <p className="form-status form-status--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="persona-editor-actions">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={!canSave}>
          {isSaving ? 'Saving…' : 'Save persona'}
        </button>
      </div>
    </form>
  );
}
