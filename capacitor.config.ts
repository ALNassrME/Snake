import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration for the Android and iOS builds.
 * The game is a self-contained static bundle, so the WebView loads `dist/`
 * straight from the app package — no server, no network required.
 */
const config: CapacitorConfig = {
  appId: 'com.umbravale.game',
  appName: 'Umbra Vale',
  webDir: 'dist',
  // Deep black matches the game's boot screen, so there is no white flash
  // between the splash screen and the first rendered frame.
  backgroundColor: '#0a0d14',
  android: {
    backgroundColor: '#0a0d14',
    // The renderer already caps resolution per quality tier; letting the
    // WebView debug bridge stay off keeps release builds lean.
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: '#0a0d14',
    // The game paints its own background; a transparent scroll view avoids
    // the WebView's default white bounce.
    scrollEnabled: false,
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // The in-page boot loader takes over immediately, so the native splash
      // only needs to cover process start. It is dismissed from code.
      launchAutoHide: false,
      backgroundColor: '#0a0d14',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
