import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, THEME_STORAGE_KEY } from './theme.js';

describe('applyTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('applies and persists the light theme', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('normalizes unsupported and dark themes to light', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('light');

    applyTheme('contrast');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
