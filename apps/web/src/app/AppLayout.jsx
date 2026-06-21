import { Link, NavLink, Outlet } from 'react-router-dom';
import { useUiStore } from '../stores/uiStore.js';

export function AppLayout() {
  const navigationOpen = useUiStore((state) => state.navigationOpen);
  const toggleNavigation = useUiStore((state) => state.toggleNavigation);
  const closeNavigation = useUiStore((state) => state.closeNavigation);

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" to="/" onClick={closeNavigation}>
          Council
        </Link>
        <button
          className="nav-toggle"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls="primary-navigation"
          onClick={toggleNavigation}
        >
          Menu
        </button>
        <nav
          id="primary-navigation"
          className="primary-navigation"
          data-open={navigationOpen}
          aria-label="Primary"
        >
          <NavLink to="/login" onClick={closeNavigation}>
            Log in
          </NavLink>
          <NavLink to="/register" onClick={closeNavigation}>
            Register
          </NavLink>
          <NavLink to="/app" onClick={closeNavigation}>
            Development shell
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
