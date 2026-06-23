import { NavLink, Outlet } from 'react-router-dom';
import { usePendingRequestCount } from '../../features/contacts/hooks/usePendingRequestCount.js';

export function ContactsLayout() {
  const pendingCount = usePendingRequestCount();

  return (
    <div className="contacts-layout">
      <nav className="contacts-subnav" aria-label="Contacts sections">
        <NavLink to="/app/contacts" end>
          My contacts
        </NavLink>
        <NavLink to="/app/contacts/discover">Discover</NavLink>
        <NavLink to="/app/contacts/requests">
          <span>Requests</span>
          {pendingCount > 0 ? (
            <span className="nav-count" aria-label={`${pendingCount} pending incoming requests`}>
              {pendingCount}
            </span>
          ) : null}
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
