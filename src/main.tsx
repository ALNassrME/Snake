/** Application entry: store bootstrap, React mount, boot loader hand-off, PWA. */
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { EMPTY_HUD, getStore, initStore } from './app/store';
import { createDefaultProfile, loadProfile } from './core/save';
import { loadSettings } from './core/settings';
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

  // Dismiss the static boot loader once the store flips to ready.
  const store = getStore();
  const unsub = store.subscribe(() => {
    if (store.get().ready) {
      unsub();
      const loader = document.getElementById('boot-loader');
      if (loader) {
        loader.classList.add('boot-done');
        window.setTimeout(() => loader.remove(), 1000);
      }
    }
  });

  // Offline support — only meaningful on a real (non-dev) origin.
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[pwa] service worker registration failed', err);
      });
    });
  }
}

boot();
