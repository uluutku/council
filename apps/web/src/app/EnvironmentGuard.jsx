import { inspectBrowserEnvironment } from '../lib/env.js';

export function EnvironmentGuard({ children }) {
  const environment = inspectBrowserEnvironment(import.meta.env);

  if (!environment.valid) {
    return (
      <main className="centered-page" role="alert">
        <section className="status-card">
          <p className="eyebrow">Configuration required</p>
          <h1>Council is missing browser environment settings.</h1>
          <p>
            Copy the root <code>.env.example</code> to <code>.env.local</code> and provide the local
            public Supabase URL and anon key.
          </p>
          <ul>
            {environment.issues.map((issue) => (
              <li key={`${issue.path}-${issue.message}`}>
                {issue.path}: {issue.message}
              </li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  return children;
}
