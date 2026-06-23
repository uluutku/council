import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../providers/AuthContext.js';
import { mapSupabaseError } from '../../features/auth/utils/authErrors.js';
import { useRouteFocus } from '../../hooks/useRouteFocus.js';
import { usePendingRequestCount } from '../../features/contacts/hooks/usePendingRequestCount.js';
import { useUnreadCount } from '../../features/messaging/hooks/useUnreadCount.js';
import { useInboxRealtime } from '../../features/messaging/hooks/useInboxRealtime.js';
import { usePresenceHeartbeat } from '../../features/messaging/hooks/usePresenceHeartbeat.js';

export function AuthenticatedLayout() {
  useRouteFocus();
  useInboxRealtime();
  usePresenceHeartbeat();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const pendingRequests = usePendingRequestCount();
  const unreadMessages = useUnreadCount();
  const [logoutError, setLogoutError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const name = profile?.display_name || profile?.username;

  async function handleLogout() {
    setLogoutError('');
    setIsSigningOut(true);

    try {
      await signOut('local');
      navigate('/login', { replace: true });
    } catch (error) {
      setLogoutError(mapSupabaseError(error).message);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <NavLink className="brand" to="/app">
          Council
        </NavLink>
        <nav className="app-navigation" aria-label="Application">
          <NavLink to="/app" end>
            Home
          </NavLink>
          <NavLink to="/app/messages">
            Messages
            {unreadMessages > 0 ? (
              <span className="nav-count" aria-label={`${unreadMessages} unread messages`}>
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/app/ai">AI</NavLink>
          <NavLink to="/app/artifacts">Artifacts</NavLink>
          <NavLink to="/app/contacts">
            Contacts
            {pendingRequests > 0 ? (
              <span
                className="nav-count"
                aria-label={`${pendingRequests} pending incoming requests`}
              >
                {pendingRequests}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/app/settings/profile">Settings</NavLink>
        </nav>
        <div className="account-menu">
          <span className="account-name">{name}</span>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={handleLogout}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
        {logoutError ? (
          <p className="header-error" role="alert">
            {logoutError}
          </p>
        ) : null}
      </header>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
