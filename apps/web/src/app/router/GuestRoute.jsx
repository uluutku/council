import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthContext.js';
import { getSafeReturnPath } from '../../features/auth/utils/safeRedirect.js';
import { AccountDataError, AuthLoading } from './AuthStateView.jsx';

export function GuestRoute() {
  const location = useLocation();
  const { isHydrating, isAuthenticated, isOnboarded, accountError } = useAuth();

  if (isHydrating) return <AuthLoading />;
  if (accountError) return <AccountDataError />;
  if (isAuthenticated) {
    // Honor any safe return path carried by a protected-route redirect so this
    // guard and the login page agree on the destination. Without this, an
    // auth-state-change re-render here can race the login navigation and drop
    // the requested path.
    const destination = isOnboarded
      ? getSafeReturnPath(location.state?.returnTo, '/app')
      : '/onboarding';
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
