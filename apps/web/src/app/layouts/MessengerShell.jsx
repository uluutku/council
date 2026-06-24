import {
  Archive,
  Award,
  LogOut,
  MessageCircle,
  Settings,
  Shield,
  Users,
  UserRound,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../providers/AuthContext.js';
import { mapSupabaseError } from '../../features/auth/utils/authErrors.js';
import { useRouteFocus } from '../../hooks/useRouteFocus.js';
import { usePendingRequestCount } from '../../features/contacts/hooks/usePendingRequestCount.js';
import { useUnreadCount } from '../../features/messaging/hooks/useUnreadCount.js';
import { useInboxRealtime } from '../../features/messaging/hooks/useInboxRealtime.js';
import { usePresenceHeartbeat } from '../../features/messaging/hooks/usePresenceHeartbeat.js';

function CountBadge({ count, label, accessible = true }) {
  if (!count) return null;
  return (
    <span
      className="nav-count nav-count--rail"
      aria-label={accessible ? label : undefined}
      aria-hidden={accessible ? undefined : 'true'}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavItem({ to, label, icon: Icon, end = false, count = 0, countLabel, ariaLabel = label }) {
  return (
    <NavLink className="rail-link" to={to} end={end} aria-label={ariaLabel} title={label}>
      <Icon aria-hidden="true" size={21} strokeWidth={2} />
      <span className="rail-link-label">{label}</span>
      <CountBadge count={count} label={countLabel} />
    </NavLink>
  );
}

function MobileNavItem({ to, label, icon: Icon, end = false, count = 0, countLabel }) {
  return (
    <NavLink className="mobile-nav-link" to={to} end={end}>
      <span className="mobile-nav-icon">
        <Icon aria-hidden="true" size={20} strokeWidth={2} />
        <CountBadge count={count} label={countLabel} accessible={false} />
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

export function MessengerShell() {
  useRouteFocus();
  useInboxRealtime();
  usePresenceHeartbeat();

  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const pendingRequests = usePendingRequestCount();
  const unreadMessages = useUnreadCount();
  const [logoutError, setLogoutError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const name = profile?.display_name || profile?.username || 'Account';
  const initial = name.slice(0, 1).toUpperCase();

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
    <div className="app-shell">
      <aside className="navigation-rail" aria-label="Primary">
        <div className="rail-brand">
          <NavLink className="rail-mark" to="/app" aria-label="Council home" title="Council">
            <Shield aria-hidden="true" size={24} strokeWidth={2.25} />
          </NavLink>
          <div className="rail-brand-copy" aria-hidden="true">
            <span className="rail-brand-name">Council</span>
            <span className="rail-brand-subtitle">Private Messenger</span>
          </div>
        </div>
        <nav className="rail-nav" aria-label="Application">
          <NavItem
            to="/app/messages"
            label="Messages"
            icon={MessageCircle}
            count={unreadMessages}
            countLabel={`${unreadMessages} unread messages`}
          />
          <NavItem
            to="/app/contacts"
            label="Contacts"
            icon={Users}
            count={pendingRequests}
            countLabel={`${pendingRequests} pending incoming requests`}
          />
          <NavItem to="/app/artifacts" label="Artifacts" icon={Archive} />
          <NavItem to="/app/settings/profile" label="Settings" icon={Settings} />
          <NavItem
            to="/app/settings/access"
            label="Pro Status"
            ariaLabel="Premium access"
            icon={Award}
          />
        </nav>
        <div className="rail-account">
          <span className="rail-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="rail-profile-label" aria-hidden="true">
            Profile
          </span>
          <span className="sr-only">Signed in as {name}</span>
          <button
            type="button"
            className="rail-link rail-link--button"
            onClick={handleLogout}
            disabled={isSigningOut}
            aria-label={isSigningOut ? 'Logging out' : 'Log out'}
            title={isSigningOut ? 'Logging out' : 'Log out'}
          >
            <LogOut aria-hidden="true" size={20} strokeWidth={2} />
          </button>
        </div>
      </aside>

      <main className="app-content" id="main-content">
        {logoutError ? (
          <p className="app-status app-status--error" role="alert">
            {logoutError}
          </p>
        ) : null}
        <Outlet />
      </main>

      <nav className="mobile-navigation" aria-label="Application">
        <MobileNavItem
          to="/app/messages"
          label="Messages"
          icon={MessageCircle}
          count={unreadMessages}
          countLabel={`${unreadMessages} unread messages`}
        />
        <MobileNavItem to="/app/artifacts" label="Files" icon={Archive} />
        <MobileNavItem
          to="/app/contacts"
          label="People"
          icon={Users}
          count={pendingRequests}
          countLabel={`${pendingRequests} pending incoming requests`}
        />
        <MobileNavItem to="/app/settings/profile" label="Settings" icon={UserRound} />
      </nav>
    </div>
  );
}
