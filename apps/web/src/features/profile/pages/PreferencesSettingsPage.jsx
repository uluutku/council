import { useMemo, useState } from 'react';
import { preferencesFormSchema } from '@council/schemas';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { applyTheme } from '../../../app/providers/theme.js';
import { updateMySettings } from '../api/profileApi.js';
import { mapSupabaseError } from '../../auth/utils/authErrors.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';

function preferencesFromSettings(settings) {
  return {
    theme: settings.theme,
    notification_preferences: {
      message_notifications: settings.notification_preferences.message_notifications ?? true,
      message_previews: settings.notification_preferences.message_previews ?? false,
      sound: settings.notification_preferences.sound ?? true,
    },
    privacy_preferences: {
      show_online_status: settings.privacy_preferences.show_online_status ?? true,
      show_last_seen: settings.privacy_preferences.show_last_seen ?? true,
      allow_contact_requests: settings.privacy_preferences.allow_contact_requests ?? true,
    },
  };
}

function ToggleField({ label, description, checked, onChange, disabled }) {
  return (
    <label className="toggle-field">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  );
}

export function PreferencesSettingsPage() {
  usePageTitle('Preferences');
  const { settings, refreshProfile } = useAuth();
  const [form, setForm] = useState(() => preferencesFromSettings(settings));
  const [savedForm, setSavedForm] = useState(() => preferencesFromSettings(settings));
  const [status, setStatus] = useState('');
  const [tone, setTone] = useState('neutral');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm),
    [form, savedForm],
  );

  function setTheme(theme) {
    setForm((current) => ({ ...current, theme }));
    applyTheme(theme);
    setStatus('');
  }

  function setPreference(group, field, value) {
    setForm((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [field]: value,
      },
    }));
    setStatus('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const parsed = preferencesFormSchema.safeParse(form);
    if (!parsed.success) {
      setStatus('Review the preference values and try again.');
      setTone('error');
      return;
    }

    setIsSubmitting(true);
    setStatus('');

    try {
      const updated = await updateMySettings(parsed.data);
      const next = preferencesFromSettings(updated);
      setForm(next);
      setSavedForm(next);
      applyTheme(next.theme);
      await refreshProfile();
      setStatus('Preferences saved.');
      setTone('success');
    } catch (error) {
      applyTheme(savedForm.theme);
      setStatus(mapSupabaseError(error).message);
      setTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="settings-section">
      <div>
        <p className="eyebrow">Account behavior</p>
        <h1>Preferences</h1>
        <p>These values are private to your account and persist across sessions.</p>
      </div>
      <form className="stacked-form" onSubmit={handleSubmit}>
        <fieldset className="panel preference-group">
          <legend>Appearance</legend>
          <div className="segmented-control" aria-label="Theme">
            {['system', 'light', 'dark'].map((theme) => (
              <button
                key={theme}
                type="button"
                data-selected={form.theme === theme}
                onClick={() => setTheme(theme)}
                disabled={isSubmitting}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="panel preference-group">
          <legend>Notifications</legend>
          <p className="field-hint">
            Notification delivery is deferred; Council stores these preferences for the future.
          </p>
          <ToggleField
            label="Message notifications"
            description="Allow future message notifications."
            checked={form.notification_preferences.message_notifications}
            onChange={(event) =>
              setPreference(
                'notification_preferences',
                'message_notifications',
                event.target.checked,
              )
            }
            disabled={isSubmitting}
          />
          <ToggleField
            label="Notification previews"
            description="Allow message text in future notifications."
            checked={form.notification_preferences.message_previews}
            onChange={(event) =>
              setPreference('notification_preferences', 'message_previews', event.target.checked)
            }
            disabled={isSubmitting}
          />
          <ToggleField
            label="Sound"
            description="Allow sound for future notifications."
            checked={form.notification_preferences.sound}
            onChange={(event) =>
              setPreference('notification_preferences', 'sound', event.target.checked)
            }
            disabled={isSubmitting}
          />
        </fieldset>

        <fieldset className="panel preference-group">
          <legend>Privacy</legend>
          <ToggleField
            label="Show online status"
            description="Allow contacts to see when you are online once presence is implemented."
            checked={form.privacy_preferences.show_online_status}
            onChange={(event) =>
              setPreference('privacy_preferences', 'show_online_status', event.target.checked)
            }
            disabled={isSubmitting}
          />
          <ToggleField
            label="Show last seen"
            description="Allow contacts to see your last active time once available."
            checked={form.privacy_preferences.show_last_seen}
            onChange={(event) =>
              setPreference('privacy_preferences', 'show_last_seen', event.target.checked)
            }
            disabled={isSubmitting}
          />
          <ToggleField
            label="Allow contact requests"
            description="Controls whether strangers can discover and request you."
            checked={form.privacy_preferences.allow_contact_requests}
            onChange={(event) =>
              setPreference('privacy_preferences', 'allow_contact_requests', event.target.checked)
            }
            disabled={isSubmitting}
          />
        </fieldset>

        <FormStatus message={status} tone={tone} />
        <div className="form-actions">
          <button className="button" type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save preferences'}
          </button>
          <span className="dirty-state">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
        </div>
      </form>
    </section>
  );
}
