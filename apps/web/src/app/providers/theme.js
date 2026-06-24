export const THEME_STORAGE_KEY = 'council.theme';

const VALID_THEMES = new Set(['system', 'light', 'dark']);

export function normalizeThemePreference(theme) {
  return VALID_THEMES.has(theme) ? theme : 'light';
}

export function resolvedSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(theme) {
  const preference = normalizeThemePreference(theme);
  return preference === 'system' ? resolvedSystemTheme() : preference;
}

export function applyTheme(theme = 'light') {
  const preference = normalizeThemePreference(theme);
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolvedTheme;
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  return resolvedTheme;
}
