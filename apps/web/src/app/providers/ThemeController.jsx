import { useEffect } from 'react';
import { useAuth } from './AuthContext.js';
import { applyTheme, THEME_STORAGE_KEY } from './theme.js';

export function ThemeController() {
  const { settings } = useAuth();

  useEffect(() => {
    const fallback = localStorage.getItem(THEME_STORAGE_KEY) ?? 'light';
    applyTheme(settings?.theme ?? fallback);
  }, [settings?.theme]);

  return null;
}
