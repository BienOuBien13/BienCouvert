import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.biencouvert.app',
  appName: 'BienCouvert',
  webDir: 'dist',
  server: {
    // In production, the app loads from the local bundle.
    // For dev, uncomment the url below and point to your Vite dev server:
    // url: 'http://YOUR_LOCAL_IP:3000',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
