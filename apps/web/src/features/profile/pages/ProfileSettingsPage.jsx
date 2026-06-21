import { useEffect, useMemo, useState } from 'react';
import { profileFormSchema } from '@council/schemas';
import { FormField } from '../../../components/FormField.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { setMyProfile } from '../api/profileApi.js';
import { mapSupabaseError } from '../../auth/utils/authErrors.js';
import { getFieldErrors } from '../../auth/utils/validation.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';

function formFromProfile(profile) {
  return {
    username: profile.username ?? '',
    display_name: profile.display_name ?? '',
    bio: profile.bio ?? '',
    status_text: profile.status_text ?? '',
  };
}

export function ProfileSettingsPage() {
  usePageTitle('Profile settings');
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState(() => formFromProfile(profile));
  const [savedForm, setSavedForm] = useState(() => formFromProfile(profile));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [tone, setTone] = useState('neutral');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm),
    [form, savedForm],
  );

  useEffect(() => {
    function warnBeforeUnload(event) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setStatus('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = profileFormSchema.safeParse(form);
    setErrors(getFieldErrors(parsed));
    if (!parsed.success) return;

    setIsSubmitting(true);
    setStatus('');

    try {
      const updated = await setMyProfile({
        ...parsed.data,
        avatar_path: profile.avatar_path ?? null,
      });
      const next = formFromProfile(updated);
      setForm(next);
      setSavedForm(next);
      await refreshProfile();
      setStatus('Profile saved.');
      setTone('success');
    } catch (error) {
      setStatus(mapSupabaseError(error).message);
      setTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const initials = (profile.display_name || profile.username)
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="settings-section">
      <div>
        <p className="eyebrow">Public identity</p>
        <h1>Profile</h1>
        <p>
          Edit the profile fields other Council users may see. Avatar upload is not available yet.
        </p>
      </div>
      <div className="profile-preview" aria-label="Generated profile avatar">
        {initials}
      </div>
      <form className="stacked-form panel" onSubmit={handleSubmit} noValidate>
        <FormField label="Username" name="username" error={errors.username}>
          {(props) => (
            <input
              {...props}
              value={form.username}
              onChange={(event) => updateField('username', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormField label="Display name" name="display_name" error={errors.display_name}>
          {(props) => (
            <input
              {...props}
              autoComplete="name"
              value={form.display_name}
              onChange={(event) => updateField('display_name', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormField label="Biography" name="bio" error={errors.bio}>
          {(props) => (
            <textarea
              {...props}
              rows="4"
              value={form.bio}
              onChange={(event) => updateField('bio', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormField label="Status" name="status_text" error={errors.status_text}>
          {(props) => (
            <input
              {...props}
              value={form.status_text}
              onChange={(event) => updateField('status_text', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>
        <FormStatus message={status} tone={tone} />
        <div className="form-actions">
          <button className="button" type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save profile'}
          </button>
          <span className="dirty-state">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
        </div>
      </form>
    </section>
  );
}
