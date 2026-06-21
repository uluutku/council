import { Link } from 'react-router-dom';

export function AuthLoading() {
  return (
    <main className="centered-page" aria-busy="true">
      <section className="panel auth-state">
        <p className="eyebrow">Council</p>
        <h1>Restoring your session…</h1>
      </section>
    </main>
  );
}

export function AccountDataError() {
  return (
    <main className="centered-page" role="alert">
      <section className="panel auth-state">
        <p className="eyebrow">Account unavailable</p>
        <h1>Council could not load your account.</h1>
        <p>Retry the page. If the problem continues, sign out and sign in again.</p>
        <Link to="/login">Go to login</Link>
      </section>
    </main>
  );
}
