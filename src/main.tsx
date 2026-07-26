/** Application entry: store bootstrap, React mount, boot loader hand-off, PWA. */
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { EMPTY_HUD, getStore, initStore } from './app/store';
import { createDefaultProfile, loadProfile } from './core/save';
import { loadSettings } from './core/settings';
import { dismissNativeSplash, isNative } from './platform/native';
import './ui/styles.css';

function boot(): void {
  let profile;
  try {
    profile = loadProfile();
  } catch {
    profile = createDefaultProfile();
  }

  initStore({
    ready: false,
    fatalError: null,
    screen: 'menu',
    veil: false,
    overlay: 'none',
    hud: EMPTY_HUD,
    countdown: null,
    bossBanner: false,
    profile,
    settings: loadSettings(),
    toasts: [],
    gameOver: null,
    currentMode: null,
    dailyChallenge: null,
    dailyRunActive: false,
    fps: 60,
  });

  // Surface unexpected failures instead of a silent black screen.
  window.addEventListener('error', (e) => {
    console.error('[fatal]', e.error ?? e.message);
    try {
      getStore().set({
        fatalError:
          'Something in the deep dark went wrong. Your progress is safe — reload to continue the pilgrimage.',
      });
    } catch {
      /* store not ready */
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[fatal:promise]', e.reason);
  });

  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('Missing #root element');
  createRoot(rootEl).render(<App />);

  // Dismiss the static boot loader once the game is running — or once it has
  // failed, since the loader sits above the error screen and would otherwise
  // hide the very message the player needs.
  const store = getStore();
  const unsub = store.subscribe(() => {
    const state = store.get();
    if (!state.ready && !state.fatalError) return;
    unsub();
    // Stand the compatibility watchdog down: the outcome is now known.
    (window as unknown as { __umbraBooted?: boolean }).__umbraBooted = true;
    const loader = document.getElementById('boot-loader');
    if (loader) {
      if (state.fatalError) {
        loader.remove();
      } else {
        loader.classList.add('boot-done');
        window.setTimeout(() => loader.remove(), 1000);
      }
    }
    // On native the OS splash stays up until the first frame is ready.
    void dismissNativeSplash();
  });

  // Offline support. Native builds ship the bundle inside the app package,
  // so a service worker would only add a redundant cache layer there.
  if ('serviceWorker' in navigator && !import.meta.env.DEV && !isNative()) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[pwa] service worker registration failed', err);
      });
    });
  }
}

boot();
