import { StatusCard } from '../components/StatusCard.jsx';
import { readBrowserEnvironment } from '../lib/env.js';

export function AppPlaceholderPage() {
  const environment = readBrowserEnvironment();

  return (
    <main className="content-page">
      <div>
        <p className="eyebrow">Development shell</p>
        <h1>Council</h1>
        <p className="lede">
          Foundation diagnostics only. No authentication or messaging features are present.
        </p>
      </div>
      <section className="status-grid" aria-label="Application environment">
        <StatusCard label="Environment" value="Ready" detail="Browser configuration validated" />
        <StatusCard
          label="Supabase"
          value="Configured"
          detail="Public URL and anon key are present"
        />
        <StatusCard label="Build mode" value={environment.mode} />
      </section>
    </main>
  );
}
