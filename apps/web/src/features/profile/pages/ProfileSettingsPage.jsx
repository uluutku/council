import { useEffect, useMemo, useState } from 'react';
import { profileFormSchema } from '@council/schemas';
import { FormField } from '../../../components/FormField.jsx';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { setMyProfile } from '../api/profileApi.js';
import { mapSupabaseError } from '../../auth/utils/authErrors.js';
import { getFieldErrors } from '../../auth/utils/validation.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { useSignedAvatarUrl } from '../../../hooks/useSignedAvatarUrl.js';
import {
  PROFILE_AVATAR_BUCKET,
  avatarUploadErrorMessage,
  removeAvatarFile,
  uploadAvatarFile,
} from '../../../lib/avatarStorage.js';

function formFromProfile(profile) {
  return {
    username: profile.username ?? '',
    display_name: profile.display_name ?? '',
    bio: profile.bio ?? '',
    status_text: profile.status_text ?? '',
  };
}

export function ProfileSettingsPage() {
  usePageTitle('Profile');
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState(() => formFromProfile(profile));
  const [savedForm, setSavedForm] = useState(() => formFromProfile(profile));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const [tone, setTone] = useState('neutral');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const currentAvatarUrl = useSignedAvatarUrl(
    PROFILE_AVATAR_BUCKET,
    removeAvatar ? null : profile.avatar_path,
  );
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm) || Boolean(avatarFile) || removeAvatar,
    [avatarFile, form, removeAvatar, savedForm],
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

  useEffect(
    () => () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    },
    [avatarPreviewUrl],
  );

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setStatus('');
  }

  function updateAvatarFile(file) {
    setStatus('');
    setRemoveAvatar(false);
    setAvatarFile(file ?? null);
    setAvatarPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return file ? URL.createObjectURL(file) : '';
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = profileFormSchema.safeParse(form);
    setErrors(getFieldErrors(parsed));
    if (!parsed.success) return;

    setIsSubmitting(true);
    setStatus('');
    let uploadedAvatarPath = null;

    try {
      const nextAvatarPath = removeAvatar
        ? null
        : avatarFile
          ? await uploadAvatarFile(PROFILE_AVATAR_BUCKET, avatarFile)
          : (profile.avatar_path ?? null);
      uploadedAvatarPath = avatarFile ? nextAvatarPath : null;

      const updated = await setMyProfile({
        ...parsed.data,
        avatar_path: nextAvatarPath,
      });
      if (profile.avatar_path && profile.avatar_path !== nextAvatarPath) {
        removeAvatarFile(PROFILE_AVATAR_BUCKET, profile.avatar_path).catch(() => {});
      }
      const next = formFromProfile(updated);
      setForm(next);
      setSavedForm(next);
      updateAvatarFile(null);
      setRemoveAvatar(false);
      await refreshProfile();
      setStatus('Profile saved.');
      setTone('success');
    } catch (error) {
      if (uploadedAvatarPath) {
        removeAvatarFile(PROFILE_AVATAR_BUCKET, uploadedAvatarPath).catch(() => {});
      }
      setStatus(avatarUploadErrorMessage(error) ?? mapSupabaseError(error).message);
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
  const avatarUrl = avatarPreviewUrl || currentAvatarUrl;

  return (
    <section className="settings-section">
      <header className="settings-head">
        <p className="eyebrow">Public identity</p>
        <h1>Profile</h1>
        <p>Edit the profile fields other Council users may see.</p>
      </header>
      <div className="profile-identity">
        <div className="profile-preview" aria-label="Profile avatar">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
        </div>
        <div className="profile-identity-text">
          <strong>{profile.display_name || profile.username}</strong>
          <span>@{profile.username}</span>
          <div className="profile-avatar-actions">
            <label className="button button--secondary button--small" htmlFor="profile-avatar">
              Upload photo
            </label>
            <input
              id="profile-avatar"
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isSubmitting}
              onChange={(event) => updateAvatarFile(event.target.files?.[0] ?? null)}
            />
            {profile.avatar_path || avatarFile ? (
              <button
                type="button"
                className="button button--secondary button--small"
                disabled={isSubmitting}
                onClick={() => {
                  updateAvatarFile(null);
                  setRemoveAvatar(Boolean(profile.avatar_path));
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <form className="stacked-form panel settings-card" onSubmit={handleSubmit} noValidate>
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
