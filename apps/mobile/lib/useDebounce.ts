import { useEffect, useState } from 'react';

/**
 * Follows a value after it stops changing. Used for the search box: without it
 * every keystroke is a request, and the slower ones land out of order.
 */
export function useDebounce<T>(value: T, delay = 350): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
