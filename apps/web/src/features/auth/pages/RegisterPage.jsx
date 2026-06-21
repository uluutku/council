import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registrationFormSchema } from '@council/schemas';
import { AuthCard } from '../components/AuthCard.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { signUpWithEmail } from '../api/authApi.js';
import { mapSupabaseError } from '../utils/authErrors.js';
import { getFieldErrors } from '../utils/validation.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';

export function RegisterPage() {
  usePageTitle('Register');
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('');
    const parsed = registrationFormSchema.safeParse(form);
    setErrors(getFieldErrors(parsed));
    if (!parsed.success) return;

    setIsSubmitting(true);

    try {
      const data = await signUpWithEmail(parsed.data);
      setForm((current) => ({ ...current, password: '', confirmPassword: '' }));

      if (data.session) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/verify-email', {
          replace: true,
          state: { email: parsed.data.email },
        });
      }
    } catch (error) {
      setStatus(mapSupabaseError(error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      eyebrow="Create account"
      title="Join Council"
      description="Human messaging and AI contacts will share one clearly labeled private inbox."
      footer={
        <p>
          Already registered? <Link to="/login">Log in</Link>
        </p>
      }
    >
      <form className="stacked-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Email" name="email" error={errors.email}>
          {(props) => (
            <input
              {...props}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormField
          label="Password"
          name="password"
          error={errors.password}
          hint="Use at least 10 characters."
        >
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormField label="Confirm password" name="confirmPassword" error={errors.confirmPassword}>
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) => updateField('confirmPassword', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <div className="checkbox-field">
          <input
            id="acceptTerms"
            type="checkbox"
            checked={form.acceptTerms}
            onChange={(event) => updateField('acceptTerms', event.target.checked)}
            aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined}
            disabled={isSubmitting}
          />
          <label htmlFor="acceptTerms">
            I acknowledge Council’s terms and server-readable privacy model.
          </label>
        </div>
        {errors.acceptTerms ? (
          <p className="field-error" id="acceptTerms-error">
            {errors.acceptTerms}
          </p>
        ) : null}
        <FormStatus message={status} tone="error" />
        <button className="button button--full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}
