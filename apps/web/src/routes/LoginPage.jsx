import { Link } from 'react-router-dom';

export function LoginPage() {
  return (
    <main className="centered-page">
      <section className="status-card">
        <p className="eyebrow">Placeholder route</p>
        <h1>Log in</h1>
        <p>Authentication is intentionally deferred to the accounts and contacts milestone.</p>
        <Link to="/">Return home</Link>
      </section>
    </main>
  );
}
