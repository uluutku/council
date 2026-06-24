import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { useCollectionPanelWidth } from './useCollectionPanelWidth.js';

describe('useCollectionPanelWidth', () => {
  beforeEach(() => {
    localStorage.removeItem('council.collectionPanelWidth');
  });

  it('uses the default width and persists adjustments within bounds', () => {
    const { result } = renderHook(() => useCollectionPanelWidth());

    expect(result.current.width).toBe(320);

    act(() => result.current.adjustWidth(500));
    expect(result.current.width).toBe(480);
    expect(localStorage.getItem('council.collectionPanelWidth')).toBe('480');

    act(() => result.current.adjustWidth(-500));
    expect(result.current.width).toBe(320);
    expect(localStorage.getItem('council.collectionPanelWidth')).toBe('320');
  });

  it('clamps a stored width on startup', () => {
    localStorage.setItem('council.collectionPanelWidth', '900');
    const { result } = renderHook(() => useCollectionPanelWidth());

    expect(result.current.width).toBe(480);
  });
});
