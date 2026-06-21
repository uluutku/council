import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, THEME_STORAGE_KEY } from './theme.js';

describe('applyTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('applies and persists a supported theme', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('normalizes unknown themes to system', () => {
    applyTheme('contrast');
    expect(document.documentElement.dataset.theme).toBe('system');
  });
});
