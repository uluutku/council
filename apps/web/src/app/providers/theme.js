export const THEME_STORAGE_KEY = 'council.theme';
export const CHAT_BACKGROUND_STORAGE_KEY = 'council.chat-background';

const VALID_THEMES = new Set(['system', 'light', 'dark']);
const VALID_CHAT_BACKGROUNDS = new Set(['clean', 'grid', 'paper', 'midnight']);

export function normalizeThemePreference(theme) {
  return VALID_THEMES.has(theme) ? theme : 'light';
}

export function normalizeChatBackgroundPreference(background) {
  return VALID_CHAT_BACKGROUNDS.has(background) ? background : 'clean';
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

export function applyChatBackground(background = 'clean') {
  const preference = normalizeChatBackgroundPreference(background);
  document.documentElement.dataset.chatBackground = preference;
  localStorage.setItem(CHAT_BACKGROUND_STORAGE_KEY, preference);
  return preference;
}
