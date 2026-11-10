import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.ario.app',
  appName: 'آریو',
  webDir: 'dist',
  plugins: {
    Geolocation: {
      // Android: dialog text is set by the plugin; iOS uses NSLocationWhenInUseUsageDescription.
    },
  },
};

export default config;
