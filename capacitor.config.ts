import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nightfall.game',
  appName: 'Nightfall',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
