export const THEME_STORAGE_KEY = 'council.theme';

export function applyTheme(theme) {
  const normalizedTheme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
  document.documentElement.dataset.theme = normalizedTheme;
  localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
}
