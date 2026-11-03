import React, { useLayoutEffect, useState } from 'react';
import { SplashScreen } from './SplashScreen';

/** Covers only the first paint. Later routes stay on screen and load their own data. */
export const NavigationSplash: React.FC = () => {
  const [booting, setBooting] = useState(true);

  useLayoutEffect(() => {
    document.getElementById('boot')?.remove();
    setBooting(false);
  }, []);

  return booting ? <SplashScreen /> : null;
};
