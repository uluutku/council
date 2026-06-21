import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordFormSchema } from '@council/schemas';
import { AuthCard } from '../components/AuthCard.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { requestPasswordReset } from '../api/authApi.js';
import { mapSupabaseError } from '../utils/authErrors.js';
import { getFieldErrors } from '../utils/validation.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';

const GENERIC_CONFIRMATION =
  'If an account can receive password recovery email, Council has sent instructions.';

export function ForgotPasswordPage() {
  usePageTitle('Forgot password');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState('neutral');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = forgotPasswordFormSchema.safeParse({ email });
    setErrors(getFieldErrors(parsed));
    if (!parsed.success || cooldown > 0) return;

    setIsSubmitting(true);
    setStatus('');

    try {
      await requestPasswordReset(parsed.data.email);
      setStatus(GENERIC_CONFIRMATION);
      setStatusTone('success');
      setCooldown(30);
    } catch (error) {
      const mapped = mapSupabaseError(error);
      if (mapped.category === 'rate_limited') {
        setStatus(mapped.message);
        setStatusTone('error');
      } else {
        setStatus(GENERIC_CONFIRMATION);
        setStatusTone('success');
        setCooldown(30);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email. Council gives the same response whether or not an account exists."
      footer={<Link to="/login">Return to login</Link>}
    >
      <form className="stacked-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Email" name="email" error={errors.email}>
          {(props) => (
            <input
              {...props}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormStatus message={status} tone={statusTone} />
        <button
          className="button button--full"
          type="submit"
          disabled={isSubmitting || cooldown > 0}
        >
          {isSubmitting
            ? 'Sending…'
            : cooldown > 0
              ? `Try again in ${cooldown}s`
              : 'Send recovery instructions'}
        </button>
      </form>
    </AuthCard>
  );
}
