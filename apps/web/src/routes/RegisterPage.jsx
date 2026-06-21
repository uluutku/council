import { Link } from 'react-router-dom';

export function RegisterPage() {
  return (
    <main className="centered-page">
      <section className="status-card">
        <p className="eyebrow">Placeholder route</p>
        <h1>Register</h1>
        <p>Account creation is intentionally not implemented in this foundation task.</p>
        <Link to="/">Return home</Link>
      </section>
    </main>
  );
}
