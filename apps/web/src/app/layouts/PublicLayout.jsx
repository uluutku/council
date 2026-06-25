import { Link, NavLink, Outlet } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../providers/AuthContext.js';
import { useRouteFocus } from '../../hooks/useRouteFocus.js';
import { DEFAULT_APP_PATH } from '../../features/auth/utils/safeRedirect.js';

export function PublicLayout() {
  useRouteFocus();
  const { isAuthenticated, isOnboarded } = useAuth();

  return (
    <div className="site-shell site-shell--public">
      <header className="site-header">
        <Link className="brand" to="/">
          <ShieldCheck aria-hidden="true" size={21} strokeWidth={2.2} />
          Council
        </Link>
        <nav className="primary-navigation" aria-label="Primary">
          {isAuthenticated ? (
            <NavLink to={isOnboarded ? DEFAULT_APP_PATH : '/onboarding'}>Open Council</NavLink>
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
