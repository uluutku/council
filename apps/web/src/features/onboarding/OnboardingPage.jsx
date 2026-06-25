import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usernameOnboardingSchema } from '@council/schemas';
import { FormField } from '../../components/FormField.jsx';
import { FormStatus } from '../../components/FormStatus.jsx';
import { useAuth } from '../../app/providers/AuthContext.js';
import { setMyProfile } from '../profile/api/profileApi.js';
import { mapSupabaseError } from '../auth/utils/authErrors.js';
import { getFieldErrors } from '../auth/utils/validation.js';
import { DEFAULT_APP_PATH } from '../auth/utils/safeRedirect.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';

export function OnboardingPage() {
  usePageTitle('Choose username');
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ username: '', display_name: profile?.display_name ?? '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = usernameOnboardingSchema.safeParse(form);
    setErrors(getFieldErrors(parsed));
    if (!parsed.success) return;

    setIsSubmitting(true);
    setStatus('');

    try {
      await setMyProfile({
        username: parsed.data.username,
        display_name: parsed.data.display_name,
        bio: profile?.bio ?? null,
        avatar_path: profile?.avatar_path ?? null,
        status_text: profile?.status_text ?? null,
      });
      await refreshProfile();
      navigate(DEFAULT_APP_PATH, { replace: true });
    } catch (error) {
      setStatus(mapSupabaseError(error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="centered-page auth-page">
      <section className="panel auth-card onboarding-card">
        <header className="auth-brandbar">
          <span className="brand auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">
              C
            </span>
            <span className="auth-brand-name">Council</span>
          </span>
          <p className="onboarding-step" aria-hidden="true">
            Step 1 of 1
          </p>
        </header>
        <div className="auth-heading">
          <p className="eyebrow">One required step</p>
          <h1>Choose your Council username</h1>
          <p className="auth-description">
            Other users can discover this username. Your email remains private and is never returned
            by profile search.
          </p>
        </div>
        <form className="stacked-form" onSubmit={handleSubmit} noValidate>
          <FormField
            label="Username"
            name="username"
            error={errors.username}
            hint="3–24 lowercase letters, numbers, or underscores."
          >
            {(props) => (
              <input
                {...props}
                autoComplete="username"
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({ ...current, username: event.target.value }))
                }
                disabled={isSubmitting}
              />
            )}
          </FormField>
          <FormField
            label="Display name (optional)"
            name="display_name"
            error={errors.display_name}
          >
            {(props) => (
              <input
                {...props}
                autoComplete="name"
                value={form.display_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, display_name: event.target.value }))
                }
                disabled={isSubmitting}
              />
            )}
          </FormField>
          <FormStatus message={status} tone="error" />
          <button className="button button--full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving username…' : 'Continue to Council'}
          </button>
        </form>
      </section>
    </main>
  );
}
