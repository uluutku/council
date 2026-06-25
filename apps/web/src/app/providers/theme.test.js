import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyChatBackground,
  applyTheme,
  CHAT_BACKGROUND_STORAGE_KEY,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme.js';

describe('applyTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.chatBackground;
  });

  it('applies and persists the light theme', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themePreference).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('applies and persists the dark theme', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePreference).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('normalizes unsupported themes to light', () => {
    applyTheme('contrast');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('resolves the system theme from media preferences', () => {
    window.matchMedia = () => ({ matches: true });
    expect(resolveTheme('system')).toBe('dark');
  });

  it('applies and persists the chat background preference', () => {
    applyChatBackground('grid');
    expect(document.documentElement.dataset.chatBackground).toBe('grid');
    expect(localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY)).toBe('grid');

    applyChatBackground('custom');
    expect(document.documentElement.dataset.chatBackground).toBe('clean');
    expect(localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY)).toBe('clean');
  });
});
