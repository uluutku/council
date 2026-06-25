import { useEffect } from 'react';
import { useAuth } from './AuthContext.js';
import {
  applyChatBackground,
  applyTheme,
  CHAT_BACKGROUND_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from './theme.js';

export function ThemeController() {
  const { settings } = useAuth();

  useEffect(() => {
    const fallback = localStorage.getItem(THEME_STORAGE_KEY) ?? 'light';
    const preference = settings?.theme ?? fallback;
    applyTheme(preference);

    if (preference !== 'system' || typeof window.matchMedia !== 'function') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => applyTheme('system');
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, [settings?.theme]);

  useEffect(() => {
    const fallback = localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY) ?? 'clean';
    const preference = settings?.appearance_preferences?.chat_background ?? fallback;
    applyChatBackground(preference);
  }, [settings?.appearance_preferences?.chat_background]);

  return null;
}
