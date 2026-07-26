/**
 * Native (Capacitor) integration.
 *
 * Every export is safe to call on the web: when the app is not running inside
 * a native shell each function is a no-op, so the rest of the codebase never
 * needs to branch on platform.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar } from '@capacitor/status-bar';

export type NativePlatform = 'web' | 'android' | 'ios';

export function platform(): NativePlatform {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios' ? p : 'web';
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Hide system bars so the Vale fills the whole screen. */
async function enterImmersive(): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.hide();
    if (platform() === 'android') {
      // Keep the layout under the (hidden) bars rather than resizing on
      // transient system-UI reveals, which would thrash the renderer.
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch (err) {
    console.warn('[native] status bar unavailable', err);
  }
}

/** Dismiss the native splash once the first real frame is ready. */
export async function dismissNativeSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 350 });
  } catch (err) {
    console.warn('[native] splash dismiss failed', err);
  }
}

export interface NativeHooks {
  /** Android hardware back button. Return true if the app handled it. */
  onBack: () => boolean;
  /** App moved to the background (or returned). */
  onAppStateChange: (active: boolean) => void;
}

let listenersBound = false;

/**
 * Wire up native lifecycle. Call once during boot; safe on web.
 */
export async function initNative(hooks: NativeHooks): Promise<void> {
  if (!isNative() || listenersBound) return;
  listenersBound = true;

  await enterImmersive();

  try {
    await App.addListener('backButton', () => {
      const handled = hooks.onBack();
      if (!handled) void App.exitApp();
    });

    await App.addListener('appStateChange', ({ isActive }) => {
      hooks.onAppStateChange(isActive);
      // Returning from the background can drop the immersive flags.
      if (isActive) void enterImmersive();
    });
  } catch (err) {
    console.warn('[native] lifecycle listeners failed', err);
  }
}

/** Native haptics, falling back to the Vibration API on the web. */
export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning'): void {
  if (isNative()) {
    try {
      if (kind === 'success' || kind === 'warning') {
        void Haptics.notification({
          type: kind === 'success' ? NotificationType.Success : NotificationType.Warning,
        });
      } else {
        const style =
          kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
        void Haptics.impact({ style });
      }
    } catch {
      /* haptics are cosmetic; never surface a failure */
    }
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    const ms = kind === 'light' ? 20 : kind === 'medium' ? 40 : kind === 'heavy' ? 90 : 30;
    navigator.vibrate(ms);
  }
}
