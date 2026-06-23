import { Link, NavLink, Outlet } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '../providers/AuthContext.js';
import { useRouteFocus } from '../../hooks/useRouteFocus.js';

// Full-screen chrome for the public authentication experience: a top brand bar,
// the split marketing + auth-card content (the routed page), and a site footer.
// Landing keeps its own PublicLayout; this layout is dedicated to auth pages so
// they can own the whole viewport without a competing header.
export function AuthLayout() {
  useRouteFocus();
  const { isAuthenticated, isOnboarded } = useAuth();

  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <Link className="auth-topbar-brand" to="/">
          <span className="auth-brand-mark" aria-hidden="true">
            <MessagesSquare size={18} strokeWidth={2.5} />
          </span>
          <span className="auth-brand-name">Council</span>
        </Link>
        <nav className="auth-topbar-nav" aria-label="Account">
          {isAuthenticated ? (
            <NavLink to={isOnboarded ? '/app' : '/onboarding'}>Open Council</NavLink>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink className="button button--small" to="/register">
                Create account
              </NavLink>
            </>
          )}
        </nav>
      </header>

      <Outlet />

      <footer className="auth-footer-bar">
        <p className="auth-footer-copy">© Council · Private messaging for humans and AI.</p>
        <nav className="auth-footer-links" aria-label="Site">
          <Link to="/">Home</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create account</Link>
        </nav>
      </footer>
    </div>
  );
}
