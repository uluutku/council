import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useRouteFocus() {
  const location = useLocation();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector('main h1, .settings-section h1');
      if (!heading) return;
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);
}
