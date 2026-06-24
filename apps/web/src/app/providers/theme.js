export const THEME_STORAGE_KEY = 'council.theme';

export function applyTheme() {
  const normalizedTheme = 'light';
  document.documentElement.dataset.theme = normalizedTheme;
  localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
}
