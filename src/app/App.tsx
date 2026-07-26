/** Root component: canvas host, screen router, overlays and gamepad focus nav. */
import { useEffect, useRef, type ReactNode } from 'react';
import { input, type MenuDirection } from '../input/input';
import { BossBanner, Countdown, GameOverOverlay, Hud, PauseOverlay, Toasts } from '../ui/game';
import {
  AchievementsScreen,
  CosmeticsScreen,
  DailyScreen,
  MainMenu,
  ModeSelect,
  SettingsScreen,
} from '../ui/screens';
import { controller } from './controller';
import { getStore, useAppState } from './store';

/** Move DOM focus among visible [data-focusable] elements (gamepad / arrows). */
function moveFocus(dir: MenuDirection): void {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-focusable]:not([disabled])'),
  ).filter((el) => el.offsetParent !== null);
  if (nodes.length === 0) return;
  const current = document.activeElement as HTMLElement | null;
  const idx = current ? nodes.indexOf(current) : -1;
  if (idx === -1) {
    nodes[0]?.focus();
    return;
  }
  const forward = dir === 'down' || dir === 'right';
  const next = nodes[(idx + (forward ? 1 : -1) + nodes.length) % nodes.length];
  next?.focus();
}

export default function App(): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const ready = useAppState((s) => s.ready);
  const fatalError = useAppState((s) => s.fatalError);
  const screen = useAppState((s) => s.screen);
  const overlay = useAppState((s) => s.overlay);
  const veil = useAppState((s) => s.veil);
  const reduceMotion = useAppState((s) => s.settings.reduceMotion);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // A failed renderer boot must surface as the recovery screen; left
    // unhandled it is an invisible rejection and the player sees only black.
    controller.init(host).catch((err: unknown) => {
      console.error('[boot] renderer initialisation failed', err);
      getStore().set({
        fatalError:
          'The Vale could not be drawn on this device. It needs WebGL, which older ' +
          'browsers and some devices do not provide. On Android, updating "Android ' +
          'System WebView" and Chrome from the Play Store usually resolves this.',
      });
    });
  }, []);

  useEffect(() => {
    const offNav = input.events.on('menu_nav', ({ dir }) => moveFocus(dir));
    const offSelect = input.events.on('menu_select', () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.hasAttribute('data-focusable')) el.click();
    });
    const offBack = input.events.on('menu_back', () => {
      const s = screen;
      if (s !== 'menu' && s !== 'game') {
        controller.playBack();
        controller.navigate('menu');
      }
    });
    return () => {
      offNav();
      offSelect();
      offBack();
    };
  }, [screen]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  return (
    <div className="app-shell">
      <div ref={hostRef} className="canvas-host" />
      {ready ? (
        <div className="ui-layer">
          {screen === 'menu' ? <MainMenu /> : null}
          {screen === 'modes' ? <ModeSelect /> : null}
          {screen === 'settings' ? <SettingsScreen /> : null}
          {screen === 'cosmetics' ? <CosmeticsScreen /> : null}
          {screen === 'achievements' ? <AchievementsScreen /> : null}
          {screen === 'daily' ? <DailyScreen /> : null}
          {screen === 'game' ? (
            <>
              <Hud />
              <Countdown />
              <BossBanner />
              {overlay === 'pause' ? <PauseOverlay /> : null}
              {overlay === 'gameover' ? <GameOverOverlay /> : null}
            </>
          ) : null}
          <Toasts />
        </div>
      ) : null}
      <div className={`veil ${veil ? 'veil-on' : ''}`} />
      {fatalError ? (
        <div className="fatal">
          <div>
            <h2>The Vale Trembles</h2>
            <p>{fatalError}</p>
            <button className="btn" onClick={() => window.location.reload()}>
              Rekindle
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
