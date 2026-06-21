import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../providers/AuthContext.js';
import { useRouteFocus } from '../../hooks/useRouteFocus.js';

export function PublicLayout() {
  useRouteFocus();
  const { isAuthenticated, isOnboarded } = useAuth();

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" to="/">
          Council
        </Link>
        <nav className="primary-navigation" aria-label="Primary">
          {isAuthenticated ? (
            <NavLink to={isOnboarded ? '/app' : '/onboarding'}>Open Council</NavLink>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <NavLink className="button button--small" to="/register">
                Register
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
