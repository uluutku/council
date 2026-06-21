import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <main className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Milestone 0 foundation</p>
        <h1>Private messaging and persistent AI contacts in one application.</h1>
        <p className="lede">
          Council will bring direct human conversations and clearly labeled AI contacts into one
          private, server-readable inbox.
        </p>
        <div className="actions">
          <Link className="button" to="/login">
            Log in
          </Link>
          <Link className="button button--secondary" to="/app">
            View development status
          </Link>
        </div>
      </div>
    </main>
  );
}
