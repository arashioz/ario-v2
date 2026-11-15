import { useEffect, useState } from 'react';
import { isStandalone } from '../services/pwa';

/** True when the app runs from the home screen (display-mode standalone or iOS navigator.standalone). */
export function useStandaloneMode(): boolean {
  const [standalone, setStandalone] = useState(() => isStandalone());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(display-mode: standalone)');
    const update = () => setStandalone(isStandalone());
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return standalone;
}
