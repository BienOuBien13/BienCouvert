import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import App from './App';

// Initialize Capacitor native plugins when running on a device
if (Capacitor.isNativePlatform()) {
  // Hide splash screen once the app is ready
  SplashScreen.hide();

  // Dark status bar on light backgrounds
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});

  // Keyboard: scroll content up when keyboard opens
  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);