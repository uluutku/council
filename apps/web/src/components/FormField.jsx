export function FormField({ label, name, error, hint, children }) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      {children({ id: name, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
