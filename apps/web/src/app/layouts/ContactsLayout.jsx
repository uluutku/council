import { Bot, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { usePendingRequestCount } from '../../features/contacts/hooks/usePendingRequestCount.js';
import { useCollectionPanelWidth } from './useCollectionPanelWidth.js';

export function ContactsLayout() {
  const pendingCount = usePendingRequestCount();
  const panel = useCollectionPanelWidth();

  return (
    <div
      className="messaging-layout contacts-layout"
      data-view="conversation"
      style={{ '--collection-panel-width': `${panel.width}px` }}
    >
      <aside className="messaging-sidebar collection-panel" aria-label="Contacts">
        <div className="messaging-sidebar-header">
          <div>
            <h1>Contacts</h1>
            <p>People and AI contacts</p>
          </div>
        </div>
        <nav className="contact-collection-list" aria-label="Contact sections">
          <NavLink
            to="/app/contacts"
            end
            className={({ isActive }) =>
              isActive ? 'contact-collection-link active' : 'contact-collection-link'
            }
          >
            <UserRound aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>Human contacts</strong>
              <small>People you are connected with</small>
            </span>
          </NavLink>
          <NavLink
            to="/app/contacts/ai"
            className={({ isActive }) =>
              isActive ? 'contact-collection-link active' : 'contact-collection-link'
            }
          >
            <Bot aria-hidden="true" size={20} strokeWidth={2} />
            <span>
              <strong>AI contacts</strong>
              <small>Built-in agents and personas</small>
            </span>
          </NavLink>
          {pendingCount > 0 ? (
            <span className="contact-collection-note" role="status">
              {pendingCount} pending contact {pendingCount === 1 ? 'request' : 'requests'}
            </span>
          ) : null}
        </nav>
      </aside>
      <div
        className="collection-panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize contacts list"
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
      <div className="messaging-main content-panel contacts-main">
        <Outlet />
      </div>
    </div>
  );
}
