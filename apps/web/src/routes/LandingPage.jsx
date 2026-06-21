import { useAuth } from '../app/providers/AuthContext.js';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle.js';

export function LandingPage() {
  usePageTitle('');
  const { isAuthenticated, isOnboarded } = useAuth();

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
          {isAuthenticated ? (
            <Link className="button" to={isOnboarded ? '/app' : '/onboarding'}>
              Open Council
            </Link>
          ) : (
            <>
              <Link className="button" to="/register">
                Create account
              </Link>
              <Link className="button button--secondary" to="/login">
                Log in
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
