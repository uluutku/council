import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="centered-page">
      <section className="status-card">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The requested Council route does not exist.</p>
        <Link to="/">Return home</Link>
      </section>
    </main>
  );
}
