import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPasswordFormSchema } from '@council/schemas';
import { AuthCard } from '../components/AuthCard.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { updatePassword } from '../api/authApi.js';
import { mapSupabaseError } from '../utils/authErrors.js';
import { getFieldErrors } from '../utils/validation.js';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { clearPasswordChangeIntent, hasPasswordChangeIntent } from '../utils/passwordIntent.js';

export function ResetPasswordPage() {
  usePageTitle('Update password');
  const navigate = useNavigate();
  const { isHydrating, isAuthenticated, isPasswordRecovery, completePasswordRecovery } = useAuth();
  const [hasChangeIntent] = useState(hasPasswordChangeIntent);
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const canUpdate = isAuthenticated && (isPasswordRecovery || hasChangeIntent);

  useEffect(
    () => () => {
      if (!isComplete && !isPasswordRecovery) {
        clearPasswordChangeIntent();
      }
    },
    [isComplete, isPasswordRecovery],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = resetPasswordFormSchema.safeParse(form);
    setErrors(getFieldErrors(parsed));
    if (!parsed.success || !canUpdate) return;

    setIsSubmitting(true);
    setStatus('');

    try {
      await updatePassword(parsed.data.password);
      setForm({ password: '', confirmPassword: '' });
      clearPasswordChangeIntent();
      completePasswordRecovery();
      setIsComplete(true);
    } catch (error) {
      setStatus(mapSupabaseError(error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isHydrating) {
    return (
      <AuthCard eyebrow="Account security" title="Checking recovery link…">
        <p aria-busy="true">Please wait.</p>
      </AuthCard>
    );
  }

  if (!canUpdate && !isComplete) {
    return (
      <AuthCard
        eyebrow="Invalid recovery"
        title="This password link cannot be used"
        description="The link may be missing, expired, or already used."
        footer={<Link to="/forgot-password">Request a new recovery email</Link>}
      >
        <Link className="button button--full" to="/login">
          Return to login
        </Link>
      </AuthCard>
    );
  }

  if (isComplete) {
    return (
      <AuthCard eyebrow="Password updated" title="Your password has been changed">
        <button className="button button--full" type="button" onClick={() => navigate('/app')}>
          Continue to Council
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Account security"
      title="Choose a new password"
      description="Use at least 10 characters. Council does not require arbitrary character rules."
    >
      <form className="stacked-form" onSubmit={handleSubmit} noValidate>
        <FormField label="New password" name="password" error={errors.password}>
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormField
          label="Confirm new password"
          name="confirmPassword"
          error={errors.confirmPassword}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) =>
                setForm((current) => ({ ...current, confirmPassword: event.target.value }))
              }
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormStatus message={status} tone="error" />
        <button className="button button--full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Updating password…' : 'Update password'}
        </button>
      </form>
    </AuthCard>
  );
}
