import { MessagesSquare, ShieldCheck, Sparkles } from 'lucide-react';

// The split auth screen: a calm marketing panel on the left telling the Council
// story, and the focused auth card on the right. Every auth page renders its
// form (and optional footer) inside this shared shell so the whole flow is
// consistent. The left panel is decorative and hidden on narrow viewports.
export function AuthCard({ eyebrow, title, description, children, footer }) {
  return (
    <main className="auth-split">
      <aside className="auth-marketing" aria-hidden="true">
        <span className="auth-badge">
          <span className="auth-badge-dot" /> Beta
        </span>
        <h2 className="auth-marketing-title">Private messaging for humans and AI.</h2>
        <p className="auth-marketing-lede">
          The calm, secure workspace where your team and personal AI agents collaborate in one
          seamless interface.
        </p>

        <div className="auth-illustration">
          <div className="auth-illu-row auth-illu-row--in">
            <span className="auth-illu-avatar">A</span>
            <span className="auth-illu-bubble">
              <span className="auth-illu-line" />
              <span className="auth-illu-line auth-illu-line--short" />
            </span>
          </div>
          <div className="auth-illu-row auth-illu-row--out">
            <span className="auth-illu-bubble auth-illu-bubble--accent">
              <span className="auth-illu-line" />
              <span className="auth-illu-line auth-illu-line--mid" />
            </span>
          </div>
          <div className="auth-illu-chip">
            <Sparkles size={14} strokeWidth={2.5} />
            Knowledge extracted
          </div>
        </div>

        <span className="auth-secure-chip">
          <ShieldCheck size={15} strokeWidth={2.5} />
          Secure &amp; private
        </span>
      </aside>

      <div className="auth-pane">
        <section className="auth-card">
          <span className="auth-card-icon" aria-hidden="true">
            <MessagesSquare size={22} strokeWidth={2.5} />
          </span>
          <div className="auth-heading">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            {description ? <p className="auth-description">{description}</p> : null}
          </div>
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </section>
      </div>
    </main>
  );
}
