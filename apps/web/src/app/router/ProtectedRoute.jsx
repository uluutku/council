import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthContext.js';
import { AccountDataError, AuthLoading } from './AuthStateView.jsx';

export function ProtectedRoute() {
  const location = useLocation();
  const { isHydrating, isAuthenticated, isOnboarded, accountError } = useAuth();

  if (isHydrating) return <AuthLoading />;
  if (accountError) return <AccountDataError />;
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (!isOnboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
