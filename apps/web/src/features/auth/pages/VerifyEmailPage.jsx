import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { emailSchema } from '@council/schemas';
import { AuthCard } from '../components/AuthCard.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { resendVerificationEmail } from '../api/authApi.js';
import { mapSupabaseError } from '../utils/authErrors.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { useAuth } from '../../../app/providers/AuthContext.js';

export function VerifyEmailPage() {
  usePageTitle('Verify email');
  const { user, isOnboarded } = useAuth();
  const location = useLocation();
  const email = useMemo(() => {
    const result = emailSchema.safeParse(location.state?.email);
    return result.success ? result.data : null;
  }, [location.state]);
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState('');
  const [tone, setTone] = useState('neutral');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function handleResend() {
    if (!email || cooldown > 0) return;
    setIsSending(true);
    setStatus('');

    try {
      await resendVerificationEmail(email);
      setStatus('If verification can be resent, a new email is on its way.');
      setTone('success');
      setCooldown(30);
    } catch (error) {
      const mapped = mapSupabaseError(error);
      setStatus(
        mapped.category === 'rate_limited'
          ? mapped.message
          : 'If verification can be resent, a new email is on its way.',
      );
      setTone(mapped.category === 'rate_limited' ? 'error' : 'success');
    } finally {
      setIsSending(false);
    }
  }

  if (user?.email_confirmed_at) {
    return (
      <AuthCard eyebrow="Email verified" title="Your email is confirmed">
        <Link className="button button--full" to={isOnboarded ? '/app' : '/onboarding'}>
          Continue to Council
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Email verification"
      title="Check your inbox"
      description={
        email
          ? `Follow the verification link sent to ${email}.`
          : 'Follow the verification link in your registration email.'
      }
      footer={<Link to="/login">Return to login</Link>}
    >
      <div className="stacked-form">
        <p>
          Verification links expire. If the link is invalid, return here from registration or
          request another email.
        </p>
        <FormStatus message={status} tone={tone} />
        {email ? (
          <button
            className="button button--secondary button--full"
            type="button"
            onClick={handleResend}
            disabled={isSending || cooldown > 0}
          >
            {isSending
              ? 'Sending…'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : 'Resend verification email'}
          </button>
        ) : null}
      </div>
    </AuthCard>
  );
}
