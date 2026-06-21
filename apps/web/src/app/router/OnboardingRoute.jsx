import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../providers/AuthContext.js';
import { AccountDataError, AuthLoading } from './AuthStateView.jsx';

export function OnboardingRoute() {
  const { isHydrating, isAuthenticated, isOnboarded, accountError } = useAuth();

  if (isHydrating) return <AuthLoading />;
  if (accountError) return <AccountDataError />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isOnboarded) return <Navigate to="/app" replace />;
  return <Outlet />;
}
