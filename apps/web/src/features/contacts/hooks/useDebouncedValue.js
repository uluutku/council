import { useEffect, useState } from 'react';

// Returns a debounced copy of a rapidly changing value. Used to avoid issuing a
// discovery query on every keystroke.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
