import {
  ArrowRight,
  Archive,
  Bot,
  ContactRound,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthContext.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

export function AppHomePage() {
  usePageTitle('Home');
  const { profile } = useAuth();
  const name = profile?.display_name || profile?.username || 'there';

  return (
    <main className="app-page app-home-modern">
      <section className="app-home-hero" aria-labelledby="app-home-title">
        <div className="app-home-copy">
          <p className="app-home-kicker">
            <span />
            Signed in
          </p>
          <h1 id="app-home-title">Welcome, {name}</h1>
          <p>
            Your private Council workspace brings direct human conversations, clearly labeled AI
            contacts, artifacts, and account controls into one focused inbox.
          </p>
          <div className="app-home-actions">
            <Link className="app-home-button app-home-button--primary" to="/app/messages">
              Open Messages
              <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} />
            </Link>
            <Link className="app-home-button" to="/app/contacts/ai">
              Browse AI contacts
            </Link>
          </div>
        </div>

        <div className="app-home-console" aria-label="Council workspace preview">
          <div className="app-home-console-top">
            <span />
            <span />
            <span />
            <strong>Today in Council</strong>
          </div>
          <div className="app-home-search">
            <Search aria-hidden="true" size={15} />
            Search people, AI contacts, and artifacts
          </div>
          <div className="app-home-thread-list">
            {[
              ['Human', 'Avery Stone', 'Contract notes are ready for review.'],
              ['AI contact', 'Writing Editor', 'Draft polished and saved as an artifact.'],
              ['Human', 'Mina Vale', 'Can we move the planning call to Friday?'],
            ].map(([type, title, preview]) => (
              <article key={title}>
                <span className="app-home-avatar" data-ai={type === 'AI contact'}>
                  {type === 'AI contact' ? <Bot aria-hidden="true" size={16} /> : title[0]}
                </span>
                <div>
                  <div>
                    <strong>{title}</strong>
                    <em>{type}</em>
                  </div>
                  <p>{preview}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="app-home-quick-grid" aria-label="Primary destinations">
        <Link to="/app/messages">
          <MessageCircle aria-hidden="true" size={22} />
          <strong>Messages</strong>
          <span>Read, reply, search, and manage direct conversations.</span>
        </Link>
        <Link to="/app/contacts">
          <ContactRound aria-hidden="true" size={22} />
          <strong>Human contacts</strong>
          <span>Find people, answer requests, and manage blocks.</span>
        </Link>
        <Link to="/app/contacts/ai">
          <Bot aria-hidden="true" size={22} />
          <strong>AI contacts</strong>
          <span>Open expert contacts, personas, memory, and tools.</span>
        </Link>
        <Link to="/app/artifacts">
          <Archive aria-hidden="true" size={22} />
          <strong>Artifacts</strong>
          <span>Continue saved AI work and export plain text versions.</span>
        </Link>
      </section>

      <section className="app-home-lower-grid">
        <article className="app-home-panel">
          <div className="app-home-panel-head">
            <Sparkles aria-hidden="true" size={19} />
            <div>
              <h2>What Council keeps clear</h2>
              <p>
                Human and AI conversations share the workspace without hiding what is synthetic.
              </p>
            </div>
          </div>
          <ul className="app-home-checklist">
            <li>
              <ShieldCheck aria-hidden="true" size={16} />
              AI contacts are labeled in conversation lists and chat surfaces.
            </li>
            <li>
              <UserRound aria-hidden="true" size={16} />
              Human messaging continues even when AI credits are exhausted.
            </li>
            <li>
              <Archive aria-hidden="true" size={16} />
              Artifacts remain private to your account unless you export them.
            </li>
          </ul>
        </article>

        <article className="app-home-account-card">
          <p>Account</p>
          <h2>@{profile?.username || 'username'}</h2>
          <dl>
            <div>
              <dt>Profile</dt>
              <dd>Onboarding complete</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                <Link to="/app/pro">View Pro status</Link>
              </dd>
            </div>
            <div>
              <dt>Preferences</dt>
              <dd>
                <Link to="/app/settings/appearance">Open appearance settings</Link>
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
