import { Link } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthContext.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

export function AppHomePage() {
  usePageTitle('Home');
  const { profile } = useAuth();
  const name = profile.display_name || profile.username;

  return (
    <main className="app-page">
      <p className="eyebrow">Signed in</p>
      <h1>Welcome, {name}</h1>
      <p className="lede">
        Open <Link to="/app/messages">Messages</Link> to read and reply in real time, or find people
        and manage your connections from <Link to="/app/contacts">Contacts</Link>. Media sharing and
        AI contacts are not available yet.
      </p>
      <section className="panel compact-panel">
        <h2>Account status</h2>
        <dl className="detail-list">
          <div>
            <dt>Username</dt>
            <dd>@{profile.username}</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd>Onboarding complete</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
