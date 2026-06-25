import { Bell, CircleSlash, Eye, Palette, ShieldCheck } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useCollectionPanelWidth } from './useCollectionPanelWidth.js';

const settingsSections = [
  {
    to: '/app/settings/appearance',
    icon: Palette,
    title: 'Appearance',
    description: 'Theme and chat background',
  },
  {
    to: '/app/settings/notifications',
    icon: Bell,
    title: 'Notifications',
    description: 'Message alerts and sound',
  },
  {
    to: '/app/settings/privacy',
    icon: Eye,
    title: 'Privacy',
    description: 'Presence and discovery',
  },
  {
    to: '/app/settings/security',
    icon: ShieldCheck,
    title: 'Security',
    description: 'Password and session controls',
  },
  {
    to: '/app/settings/blocked',
    icon: CircleSlash,
    title: 'Blocked users',
    description: 'People you have blocked',
  },
];

export function SettingsLayout() {
  const panel = useCollectionPanelWidth();

  return (
    <div
      className="messaging-layout settings-layout"
      data-view="conversation"
      style={{ '--collection-panel-width': `${panel.width}px` }}
    >
      <aside className="messaging-sidebar collection-panel" aria-label="Settings">
        <div className="messaging-sidebar-header">
          <div>
            <h1>Settings</h1>
            <p>Account controls</p>
          </div>
        </div>
        <nav className="contact-collection-list settings-nav" aria-label="Settings">
          {settingsSections.map(({ to, icon: Icon, title, description }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={title}
              className={({ isActive }) =>
                isActive ? 'contact-collection-link active' : 'contact-collection-link'
              }
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div
        className="collection-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize settings list"
        aria-valuemin={panel.minWidth}
        aria-valuemax={panel.maxWidth}
        aria-valuenow={panel.width}
        tabIndex={0}
        onPointerDown={panel.startResize}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            panel.adjustWidth(-16);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            panel.adjustWidth(16);
          }
        }}
      />
      <div className="messaging-main content-panel settings-content">
        <Outlet />
      </div>
    </div>
  );
}
