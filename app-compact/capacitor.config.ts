import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ftjdfr.travelexpensecompact',
  appName: 'Travel Expense Compact',
  webDir: 'dist',
  android: {
    path: 'android',
  },
  plugins: {
    SystemBars: {
      // ponytail: app already uses env(safe-area-inset-*); avoid early WebView CSS injection errors.
      insetsHandling: 'disable',
    },
  },
};

export default config;
