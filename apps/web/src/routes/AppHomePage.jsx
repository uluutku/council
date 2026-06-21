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
        Your account foundation is ready. Inbox, contacts, conversations, and AI contacts are
        intentionally not part of this task.
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
