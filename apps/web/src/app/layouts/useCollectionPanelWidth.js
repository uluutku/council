import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'council.collectionPanelWidth';
const DEFAULT_WIDTH = 368;
const MIN_WIDTH = 300;
const MAX_WIDTH = 480;

function clampWidth(value) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

export function useCollectionPanelWidth() {
  const [width, setWidth] = useState(() => {
    const storedValue = localStorage.getItem(STORAGE_KEY);
    if (storedValue === null) return DEFAULT_WIDTH;
    const stored = Number(storedValue);
    return Number.isFinite(stored) ? clampWidth(stored) : DEFAULT_WIDTH;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  const startResize = useCallback(
    (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;

      function handleMove(moveEvent) {
        setWidth(clampWidth(startWidth + moveEvent.clientX - startX));
      }

      function handleUp() {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
    },
    [width],
  );

  const adjustWidth = useCallback((delta) => {
    setWidth((current) => clampWidth(current + delta));
  }, []);

  return { width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH, startResize, adjustWidth };
}
