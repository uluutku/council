import { useMemo, useState } from 'react';
import { preferencesFormSchema } from '@council/schemas';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { updateMySettings } from '../api/profileApi.js';
import { mapSupabaseError } from '../../auth/utils/authErrors.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';
import { applyChatBackground, applyTheme } from '../../../app/providers/theme.js';

const CHAT_BACKGROUND_OPTIONS = [
  { value: 'clean', label: 'Clean', description: 'Flat conversation surface.' },
  { value: 'grid', label: 'Grid', description: 'Fine line pattern.' },
  { value: 'paper', label: 'Paper', description: 'Soft paper texture.' },
  { value: 'midnight', label: 'Midnight', description: 'Deeper black surface.' },
];

const SECTION_CONFIG = {
  appearance: {
    eyebrow: 'Display',
    title: 'Appearance',
    description: 'Theme and chat background controls for this account.',
    saveLabel: 'Save appearance',
    savedMessage: 'Appearance saved.',
  },
  notifications: {
    eyebrow: 'Alerts',
    title: 'Notifications',
    description: 'Message notification behavior for this browser and account.',
    saveLabel: 'Save notifications',
    savedMessage: 'Notifications saved.',
  },
  privacy: {
    eyebrow: 'Visibility',
    title: 'Privacy',
    description: 'Control what contacts and strangers can see or request.',
    saveLabel: 'Save privacy',
    savedMessage: 'Privacy saved.',
  },
};

function preferencesFromSettings(settings) {
  const theme = ['system', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'light';
  const chatBackground = ['clean', 'grid', 'paper', 'midnight'].includes(
    settings.appearance_preferences?.chat_background,
  )
    ? settings.appearance_preferences.chat_background
    : 'clean';
  return {
    theme,
    appearance_preferences: {
      chat_background: chatBackground,
    },
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
      <span className="toggle-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="toggle-control">
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
        <span className="toggle-switch" aria-hidden="true" />
      </span>
    </label>
  );
}

function ChatBackgroundField({ value, onChange, disabled }) {
  return (
    <div className="chat-background-options" role="radiogroup" aria-label="Chat background">
      {CHAT_BACKGROUND_OPTIONS.map((option) => (
        <label
          className="chat-background-option"
          data-background={option.value}
          data-selected={value === option.value ? 'true' : undefined}
          key={option.value}
        >
          <input
            type="radio"
            name="chat-background"
            value={option.value}
            aria-label={option.label}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="chat-background-swatch" aria-hidden="true" />
          <span className="chat-background-copy">
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

export function PreferencesSettingsPage({ section = 'appearance' }) {
  const config = SECTION_CONFIG[section] ?? SECTION_CONFIG.appearance;
  usePageTitle(config.title);
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

  function setDarkMode(enabled) {
    setForm((current) => ({
      ...current,
      theme: enabled ? 'dark' : 'light',
    }));
    setStatus('');
  }

  function setChatBackground(value) {
    setForm((current) => ({
      ...current,
      appearance_preferences: {
        ...current.appearance_preferences,
        chat_background: value,
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
      applyChatBackground(next.appearance_preferences.chat_background);
      await refreshProfile();
      setStatus(config.savedMessage);
      setTone('success');
    } catch (error) {
      setStatus(mapSupabaseError(error).message);
      setTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-head">
        <p className="eyebrow">{config.eyebrow}</p>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
      </header>
      <form className="stacked-form" onSubmit={handleSubmit}>
        {section === 'appearance' ? (
          <fieldset className="panel preference-group">
            <legend>Appearance</legend>
            <ToggleField
              label="Dark mode"
              description="Use the low-light Council palette on every app screen."
              checked={form.theme === 'dark'}
              onChange={(event) => setDarkMode(event.target.checked)}
              disabled={isSubmitting}
            />
            <div className="preference-divider" />
            <div className="preference-subgroup">
              <p className="preference-subgroup-title">Chat background</p>
              <ChatBackgroundField
                value={form.appearance_preferences.chat_background}
                onChange={setChatBackground}
                disabled={isSubmitting}
              />
            </div>
          </fieldset>
        ) : null}

        {section === 'notifications' ? (
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
        ) : null}

        {section === 'privacy' ? (
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
        ) : null}

        <FormStatus message={status} tone={tone} />
        <div className="form-actions">
          <button className="button" type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? 'Saving…' : config.saveLabel}
          </button>
          <span className="dirty-state">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
        </div>
      </form>
    </section>
  );
}
