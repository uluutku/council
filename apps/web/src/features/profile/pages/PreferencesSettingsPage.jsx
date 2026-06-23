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
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
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
      <header className="settings-head">
        <p className="eyebrow">Account behavior</p>
        <h1>Preferences</h1>
        <p>These values are private to your account and persist across sessions.</p>
      </header>
      <form className="stacked-form" onSubmit={handleSubmit}>
        <fieldset className="panel preference-group">
          <legend>Appearance</legend>
          <p className="field-hint">Choose how Council looks. System follows your device theme.</p>
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
            Browser notifications work while Council is open. Background push is not enabled.
          </p>
          <div className="notification-permission">
            <span className="notification-permission-state">
              Browser permission:{' '}
              <span className="permission-chip" data-permission={permission}>
                {permission}
              </span>
            </span>
            {permission === 'default' ? (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={async () => setPermission(await Notification.requestPermission())}
              >
                Enable browser notifications
              </button>
            ) : null}
            {permission === 'denied' ? (
              <small>Permission is denied. Enable it in your browser site settings.</small>
            ) : null}
          </div>
          <ToggleField
            label="Message notifications"
            description="Show incoming human-message notifications while Council is open."
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
            description="Include a bounded plain-text message excerpt."
            checked={form.notification_preferences.message_previews}
            onChange={(event) =>
              setPreference('notification_preferences', 'message_previews', event.target.checked)
            }
            disabled={isSubmitting}
          />
          <ToggleField
            label="Sound"
            description="Play a best-effort sound for incoming notifications."
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
            description="Allow accepted contacts to see when you are online."
            checked={form.privacy_preferences.show_online_status}
            onChange={(event) =>
              setPreference('privacy_preferences', 'show_online_status', event.target.checked)
            }
            disabled={isSubmitting}
          />
          <ToggleField
            label="Show last seen"
            description="Allow accepted contacts to see your last active time."
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
