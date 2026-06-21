export function FormStatus({ message, tone = 'neutral' }) {
  if (!message) return null;

  return (
    <p className="form-status" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {message}
    </p>
  );
}
