import { Coins, Crown, Sparkles, TriangleAlert } from 'lucide-react';

// Honest, non-misleading display of the user's AI access. There is no upgrade
// checkout in this build, so exhausted/expired states say so plainly.
function formatExpiry(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function pluralizeCredit(count, label) {
  return `${label} credit${count === 1 ? '' : 's'}`;
}

function AccessCard({ state, variant, icon: Icon, badge, title, count, countLabel, detail, note }) {
  return (
    <section
      className="ai-access"
      data-variant={variant}
      data-state={state}
      role={state === 'expired' || state === 'exhausted' ? 'status' : undefined}
      aria-label={`${title}${typeof count === 'number' ? `, ${count} ${countLabel}` : ''}${
        detail ? `, ${detail}` : ''
      }`}
    >
      <span className="ai-access-icon" aria-hidden="true">
        <Icon size={variant === 'compact' ? 16 : 20} strokeWidth={2.15} />
      </span>
      <span className="ai-access-copy">
        <span className="ai-access-topline">
          <span className="ai-access-title">{title}</span>
          <span className="ai-access-badge">{badge}</span>
        </span>
        {typeof count === 'number' ? (
          <span className="ai-access-meter">
            <strong className="ai-access-credits">{count}</strong>
            <span>{countLabel}</span>
          </span>
        ) : null}
        {detail ? <span className="ai-access-detail">{detail}</span> : null}
        {note ? <span className="ai-access-note">{note}</span> : null}
      </span>
    </section>
  );
}

export function AiAccessSummary({ access, variant = 'full' }) {
  if (!access) return null;

  const {
    access_state: state,
    trial_credits_remaining: credits,
    trial_expires_at: expiresAt,
    pro_credits_remaining: proCredits,
    pro_expires_at: proExpiresAt,
  } = access;
  const expiry = formatExpiry(expiresAt);
  const proExpiry = formatExpiry(proExpiresAt);

  if (state === 'pro') {
    if (typeof proCredits !== 'number') {
      return (
        <AccessCard
          state="pro"
          variant={variant}
          icon={Crown}
          badge="Pro"
          title="Premium access"
          detail="Pro access is enabled."
        />
      );
    }
    return (
      <AccessCard
        state="pro"
        variant={variant}
        icon={Crown}
        badge="Pro"
        title="Premium balance"
        count={proCredits}
        countLabel={pluralizeCredit(proCredits, 'Premium')}
        detail={proExpiry ? `Access ends ${proExpiry}` : 'Premium access is enabled.'}
      />
    );
  }

  if (state === 'trial_expired') {
    return (
      <AccessCard
        state="expired"
        variant={variant}
        icon={TriangleAlert}
        badge="Ended"
        title="Trial ended"
        detail="Your AI trial has ended."
        note="A manually issued Premium code can add access."
      />
    );
  }

  if (state === 'credits_exhausted') {
    return (
      <AccessCard
        state="exhausted"
        variant={variant}
        icon={TriangleAlert}
        badge="Empty"
        title="Trial credits used"
        detail="Your AI trial credits are used up."
        note="Pro billing is not available in this build; manually issued Premium codes can add access."
      />
    );
  }

  return (
    <AccessCard
      state="trial"
      variant={variant}
      icon={state === 'trial_active' ? Coins : Sparkles}
      badge={state === 'trial_active' ? 'Trial active' : 'Trial ready'}
      title="AI trial balance"
      count={credits}
      countLabel={pluralizeCredit(credits, 'trial')}
      detail={
        state === 'trial_active' && expiry
          ? `Trial ends ${expiry}`
          : 'Trial starts on your first message'
      }
    />
  );
}
