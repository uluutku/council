import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { loginFormSchema } from '@council/schemas';
import { AuthCard } from '../components/AuthCard.jsx';
import { FormField } from '../../../components/FormField.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { signInWithEmail } from '../api/authApi.js';
import { getMyProfileWithRetry } from '../../profile/api/profileApi.js';
import { mapSupabaseError } from '../utils/authErrors.js';
import { getSafeReturnPath } from '../utils/safeRedirect.js';
import { getFieldErrors } from '../utils/validation.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { accountKeys } from '../../../lib/query-keys/account.js';

export function LoginPage() {
  usePageTitle('Log in');
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('');
    const parsed = loginFormSchema.safeParse({ email, password });
    setErrors(getFieldErrors(parsed));
    if (!parsed.success) return;

    setIsSubmitting(true);

    try {
      const { user } = await signInWithEmail(parsed.data);
      const profile = await queryClient.fetchQuery({
        queryKey: accountKeys.profile(user.id),
        queryFn: () => getMyProfileWithRetry(user.id),
        staleTime: 30_000,
      });
      setPassword('');
      const requestedPath = getSafeReturnPath(location.state?.returnTo, '/app');
      navigate(profile.username ? requestedPath : '/onboarding', { replace: true });
    } catch (error) {
      setPassword('');
      setStatus(mapSupabaseError(error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Log in to Council"
      footer={
        <p>
          New to Council? <Link to="/register">Create an account</Link>
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormField label="Password" name="password" error={errors.password}>
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <div className="form-row form-row--between">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <FormStatus message={status} tone="error" />
        <button className="button button--full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthCard>
  );
}
