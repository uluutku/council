import { NavLink, Outlet } from 'react-router-dom';

export function SettingsLayout() {
  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        <p className="eyebrow">Settings</p>
        <nav aria-label="Settings">
          <NavLink to="/app/settings/profile">Profile</NavLink>
          <NavLink to="/app/settings/preferences">Preferences</NavLink>
          <NavLink to="/app/settings/security">Security</NavLink>
          <NavLink to="/app/settings/blocked">Blocked users</NavLink>
        </nav>
      </aside>
      <div className="settings-content">
        <Outlet />
      </div>
    </div>
  );
}
