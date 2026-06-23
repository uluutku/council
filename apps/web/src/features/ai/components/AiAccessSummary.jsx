// Honest, non-misleading display of the user's AI access. There is no upgrade
// checkout in this build, so exhausted/expired states say so plainly.
function formatExpiry(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

  if (state === 'pro') {
    if (typeof proCredits !== 'number') {
      return (
        <p className="ai-access" data-variant={variant} data-state="pro">
          Pro access is enabled.
        </p>
      );
    }
    return (
      <p className="ai-access" data-variant={variant} data-state="pro">
        <span className="ai-access-credits">{proCredits}</span> Premium credit
        {proCredits === 1 ? '' : 's'} remaining
        {formatExpiry(proExpiresAt) ? ` · access ends ${formatExpiry(proExpiresAt)}` : ''}
      </p>
    );
  }

  if (state === 'trial_expired') {
    return (
      <p className="ai-access" data-variant={variant} data-state="expired" role="status">
        Your AI trial has ended. A manually issued Premium code can add access.
      </p>
    );
  }

  if (state === 'credits_exhausted') {
    return (
      <p className="ai-access" data-variant={variant} data-state="exhausted" role="status">
        Your AI trial credits are used up. Pro billing is not available in this build; manually
        issued Premium codes can add access.
      </p>
    );
  }

  return (
    <p className="ai-access" data-variant={variant} data-state="trial">
      <span className="ai-access-credits">{credits}</span> trial credit{credits === 1 ? '' : 's'}{' '}
      remaining
      {state === 'trial_active' && expiry
        ? ` · trial ends ${expiry}`
        : ' · trial starts on your first message'}
    </p>
  );
}
