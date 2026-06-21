import { Link } from 'react-router-dom';

export function AuthCard({ eyebrow, title, description, children, footer }) {
  return (
    <main className="centered-page">
      <section className="panel auth-card">
        <Link className="brand" to="/">
          Council
        </Link>
        <div className="auth-heading">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {children}
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </section>
    </main>
  );
}
