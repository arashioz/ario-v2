import React, { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { pageActivity } from '../services/pageActivity';
import { SplashScreen } from './SplashScreen';

export const NavigationSplash: React.FC = () => {
  const location = useLocation();
  const route = `${location.key}:${location.pathname}:${location.search}:${location.hash}`;
  const [view, setView] = useState({ route, ready: false });
  if (view.route !== route) setView({ route, ready: false });
  const pending = useSyncExternalStore(pageActivity.subscribe, pageActivity.getSnapshot);
  const visible = view.route !== route || !view.ready;

  useLayoutEffect(() => {
    if (!visible || pending) return;
    // Wait for a quiet paint interval so page effects can start their requests.
    // New work cancels dismissal; slow loads are not hidden by a fixed timeout.
    let frame = 0;
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => {
        if (pageActivity.getSnapshot()) return;
        setView({ route, ready: true });
        document.getElementById('boot')?.remove();
      });
    }, 180);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [route, pending, visible]);

  return visible ? <SplashScreen /> : null;
};
