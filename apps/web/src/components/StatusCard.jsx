export function StatusCard({ label, value, detail }) {
  return (
    <article className="status-card status-card--compact">
      <p className="eyebrow">{label}</p>
      <p className="status-value">{value}</p>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}
