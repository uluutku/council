import { useAuth } from '../app/providers/AuthContext.js';
import { DEFAULT_APP_PATH } from '../features/auth/utils/safeRedirect.js';
import {
  ArrowRight,
  Bot,
  FileText,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle.js';

export function LandingPage() {
  usePageTitle('');
  const { isAuthenticated, isOnboarded } = useAuth();
  const primaryDestination = isAuthenticated
    ? isOnboarded
      ? DEFAULT_APP_PATH
      : '/onboarding'
    : '/register';
  const primaryLabel = isAuthenticated ? 'Open Council' : 'Create account';

  return (
    <main className="council-landing">
      <section className="council-hero" aria-labelledby="landing-title">
        <div className="council-hero-copy">
          <p className="council-kicker">
            <span />
            Private messenger for people and AI contacts
          </p>
          <h1 id="landing-title">One inbox for direct conversations and persistent AI contacts.</h1>
          <p className="council-hero-lede">
            Council brings private messaging and persistent AI contacts into one application. Human
            conversations stay direct, AI contacts stay clearly labeled, and the inbox remains
            private while trusted infrastructure can process requested features.
          </p>
          <div className="council-hero-actions">
            <Link className="council-button council-button--primary" to={primaryDestination}>
              {primaryLabel}
              <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
            </Link>
            {!isAuthenticated ? (
              <Link className="council-button council-button--ghost" to="/login">
                Log in
              </Link>
            ) : null}
          </div>
        </div>

        <div className="council-hero-visual" aria-label="Council inbox preview">
          <div className="council-product-frame">
            <div className="council-product-sidebar" aria-label="Council sections preview">
              <div className="council-product-brand">
                <ShieldCheck aria-hidden="true" size={18} />
                <span>Council</span>
              </div>
              {[
                ['Messages', MessageCircle, true],
                ['Contacts', Users],
                ['AI contacts', Bot],
                ['Artifacts', FileText],
              ].map(([label, Icon, active]) => (
                <span key={label} data-active={active ? 'true' : undefined}>
                  <Icon aria-hidden="true" size={16} />
                  {label}
                </span>
              ))}
            </div>

            <div className="council-product-list" aria-label="Conversation list preview">
              <header>
                <p>Inbox</p>
                <strong>Today</strong>
              </header>
              <div>
                {[
                  {
                    name: 'Mara Ellis',
                    meta: 'Human',
                    text: 'Can you review the launch notes before noon?',
                    time: '9:41',
                    active: true,
                  },
                  {
                    name: 'Researcher',
                    meta: 'AI contact',
                    text: 'Supplier comparison saved as an artifact.',
                    time: '9:12',
                  },
                  {
                    name: 'Nolan Park',
                    meta: 'Human',
                    text: 'The contract redlines are ready in the thread.',
                    time: '8:44',
                  },
                ].map((message) => (
                  <article key={message.name} data-selected={message.active ? 'true' : undefined}>
                    <span className="council-avatar" data-ai={message.meta === 'AI contact'}>
                      {message.meta === 'AI contact' ? (
                        <Bot aria-hidden="true" size={17} />
                      ) : (
                        message.name[0]
                      )}
                    </span>
                    <div>
                      <div className="council-row-title">
                        <strong>{message.name}</strong>
                        <em>{message.time}</em>
                      </div>
                      <span>{message.meta}</span>
                      <p>{message.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <section className="council-product-thread" aria-label="Selected conversation preview">
              <header>
                <span className="council-avatar">M</span>
                <div>
                  <strong>Mara Ellis</strong>
                  <p>Direct human conversation</p>
                </div>
              </header>
              <div className="council-thread-body">
                <p className="council-message-bubble council-message-bubble--in">
                  Can you pull the decisions from yesterday and send them to Researcher?
                </p>
                <p className="council-message-bubble council-message-bubble--out">
                  Yes. I will forward only the selected notes after review.
                </p>
                <div className="council-context-card">
                  <div>
                    <strong>Forwarding review</strong>
                    <p>3 selected messages · AI contact: Researcher</p>
                  </div>
                  <span>Explicit</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="council-proof-strip" aria-label="Council privacy characteristics">
        <span>
          <MessageCircle aria-hidden="true" size={18} />
          Human direct messages
        </span>
        <span>
          <Bot aria-hidden="true" size={18} />
          Labeled AI contacts
        </span>
        <span>
          <LockKeyhole aria-hidden="true" size={18} />
          Private storage
        </span>
        <span>
          <ShieldCheck aria-hidden="true" size={18} />
          Server-readable when needed
        </span>
      </section>

      <section
        className="council-section council-section--split"
        aria-labelledby="landing-workflow"
      >
        <div>
          <p className="council-section-label">Workflow</p>
          <h2 id="landing-workflow">The chat app becomes the workspace.</h2>
        </div>
        <div className="council-workflow-list">
          <article>
            <span>01</span>
            <div>
              <h3>Talk to people directly</h3>
              <p>Keep ordinary private conversations in a realtime messenger built for focus.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Open an AI contact when it helps</h3>
              <p>Researcher, Planner, Writing Editor, and personas remain separate from humans.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Save the useful output</h3>
              <p>
                Artifacts and memory controls keep ongoing work durable without making it public.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="council-feature-band" aria-label="Council product pillars">
        <article>
          <MessageCircle aria-hidden="true" size={22} />
          <h2>Direct by default</h2>
          <p>Human conversations stay direct. AI does not silently enter the room.</p>
        </article>
        <article>
          <Bot aria-hidden="true" size={22} />
          <h2>Durable AI contacts</h2>
          <p>Expert and persona contacts persist as named destinations with visible labels.</p>
        </article>
        <article>
          <FileText aria-hidden="true" size={22} />
          <h2>Artifacts built in</h2>
          <p>Keep AI-assisted drafts and notes as private work objects tied to your account.</p>
        </article>
        <article>
          <ShieldCheck aria-hidden="true" size={22} />
          <h2>Honest privacy</h2>
          <p>Private infrastructure protection without claiming end-to-end encryption.</p>
        </article>
      </section>

      <section className="council-final-panel" aria-labelledby="landing-final">
        <div>
          <p className="council-section-label">Council</p>
          <h2 id="landing-final">
            Private messaging and persistent AI contacts in one application.
          </h2>
        </div>
        <Link className="council-button council-button--primary" to={primaryDestination}>
          {primaryLabel}
          <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
        </Link>
      </section>
    </main>
  );
}
