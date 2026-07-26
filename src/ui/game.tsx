/** In-game UI: HUD, countdown, boss banner, touch joystick, pause & game-over. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { controller } from '../app/controller';
import { useAppState } from '../app/store';
import { formatScore, formatTime } from '../core/mathUtils';
import { ACHIEVEMENTS } from '../game/achievements';
import { MODES } from '../game/modes';
import type { DeathCause } from '../game/types';
import { input } from '../input/input';
import { Button, Ornament } from './components';

const DEATH_LINES: Record<DeathCause | 'completed', string> = {
  wall: 'The Vale’s edge is older than hunger.',
  self: 'The wyrm devours only what it is not.',
  obstacle: 'Stone remembers. Stone does not yield.',
  hazard: 'The gloom keeps its thorns sharp.',
  boss: 'The Warden’s patience has limits.',
  time: 'The borrowed light is spent.',
  completed: 'The rite is complete.',
};

export function Hud(): ReactNode {
  const hud = useAppState((s) => s.hud);
  const mode = useAppState((s) => s.currentMode);
  const showFps = useAppState((s) => s.settings.showFps);
  const fps = useAppState((s) => s.fps);
  const overlay = useAppState((s) => s.overlay);
  const [bump, setBump] = useState(false);
  const lastScore = useRef(0);

  useEffect(() => {
    if (hud.score > lastScore.current) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 130);
      lastScore.current = hud.score;
      return () => window.clearTimeout(t);
    }
    lastScore.current = hud.score;
    return undefined;
  }, [hud.score]);

  if (!mode) return null;
  const modeDef = MODES[mode];
  const urgent = hud.timeRemaining !== null && hud.timeRemaining <= 10;

  return (
    <div className="hud">
      <div className="hud-top-left">
        <div className={`hud-score ${bump ? 'bump' : ''}`}>{formatScore(hud.score)}</div>
        <div className="hud-best">Best {formatScore(hud.best)}</div>
        {hud.combo >= 2 ? (
          <div className="hud-combo">
            <div className="combo-label">
              <span>Combo {hud.combo}</span>
              <span>×{hud.multiplier.toFixed(1)}</span>
            </div>
            <div className="combo-track">
              <div className="combo-fill" style={{ width: `${hud.comboMeter * 100}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="hud-top-right">
        {hud.timeRemaining !== null ? (
          <div className={`hud-timer ${urgent ? 'urgent' : ''}`}>{formatTime(hud.timeRemaining)}</div>
        ) : (
          <div className="hud-timer">{formatTime(hud.timeElapsed)}</div>
        )}
        <div className="hud-mode">{modeDef.name} · {hud.length} segments</div>
        {showFps ? <div className="hud-fps">{fps} fps</div> : null}
      </div>

      {hud.bossActive ? (
        <div className="hud-boss">
          <div className="boss-name">The Vale Warden</div>
          <div className="boss-sigils" aria-label={`${hud.bossSigils} of 5 sigils`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`sigil ${i < hud.bossSigils ? 'lit' : ''}`} />
            ))}
          </div>
        </div>
      ) : null}

      {overlay === 'none' ? (
        <button
          className="pause-btn"
          aria-label="Pause"
          onClick={() => controller.togglePause()}
        >
          ❚❚
        </button>
      ) : null}

      <TouchJoystick />
    </div>
  );
}

/** Renders the virtual joystick while a touch drag is active. */
function TouchJoystick(): ReactNode {
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (input.joystick.active) force((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const j = input.joystick;
  if (!j.active) return null;
  return (
    <>
      <div className="joystick-base" style={{ left: j.baseX, top: j.baseY }} />
      <div className="joystick-stick" style={{ left: j.stickX, top: j.stickY }} />
    </>
  );
}

export function Countdown(): ReactNode {
  const n = useAppState((s) => s.countdown);
  if (n === null) return null;
  return (
    <div className="countdown">
      <span key={n}>{n}</span>
    </div>
  );
}

export function BossBanner(): ReactNode {
  const show = useAppState((s) => s.bossBanner);
  if (!show) return null;
  return (
    <div className="boss-banner">
      <div className="banner-title">The Vale Warden</div>
      <div className="banner-sub">Devour the five sigils. Do not touch the idol.</div>
    </div>
  );
}

export function PauseOverlay(): ReactNode {
  const mode = useAppState((s) => s.currentMode);
  const isZen = mode === 'zen';
  return (
    <div className="overlay">
      <div className="overlay-inner panel">
        <h2 className="heading">Stillness</h2>
        <Ornament />
        <div className="menu-column">
          <Button autoFocus onClick={() => controller.togglePause()}>
            Continue
          </Button>
          <Button variant="quiet" onClick={() => controller.restartRun()}>
            Begin Anew
          </Button>
          <Button variant="quiet" onClick={() => controller.quitToMenu()}>
            {isZen ? 'End the Drift' : 'Abandon the Rite'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GameOverOverlay(): ReactNode {
  const info = useAppState((s) => s.gameOver);
  if (!info) return null;
  const { summary, xp, dailyXp } = info;
  const completed = summary.cause === 'completed';

  return (
    <div className="overlay">
      <div className="overlay-inner panel">
        <h2 className="heading">{completed ? 'Rite Complete' : 'The Light Fades'}</h2>
        <p className="gameover-cause">{DEATH_LINES[summary.cause]}</p>
        <div className="gameover-score">{formatScore(summary.score)}</div>
        {summary.isBestScore && summary.score > 0 ? (
          <span className="best-badge">New Best</span>
        ) : null}
        <div className="run-stats">
          <div className="stat">
            <b>{summary.foodEaten}</b>
            <span>Embers</span>
          </div>
          <div className="stat">
            <b>{summary.maxCombo}</b>
            <span>Top Combo</span>
          </div>
          <div className="stat">
            <b>{formatTime(summary.timeSeconds)}</b>
            <span>Endured</span>
          </div>
          <div className="stat">
            <b>{summary.maxLength}</b>
            <span>Length</span>
          </div>
          {summary.bossesDefeated > 0 ? (
            <div className="stat">
              <b>{summary.bossesDefeated}</b>
              <span>Wardens</span>
            </div>
          ) : null}
        </div>
        <div className="xp-line">
          <b>+{xp.total + dailyXp} XP</b>
          {xp.bossBonus > 0 ? ` · warden bonus +${xp.bossBonus}` : ''}
          {xp.comboBonus > 0 ? ` · combo bonus +${xp.comboBonus}` : ''}
          {dailyXp > 0 ? ` · daily rite +${dailyXp}` : ''}
        </div>
        {info.leveledUp ? <div className="levelup">Level {info.newLevel} Attained</div> : null}
        {info.newAchievements.length > 0 ? (
          <div className="xp-line">
            {info.newAchievements
              .map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name)
              .filter(Boolean)
              .join(' · ')}
          </div>
        ) : null}
        <div className="menu-column">
          <Button autoFocus onClick={() => controller.restartRun()}>
            Rise Again
          </Button>
          <Button variant="quiet" onClick={() => controller.quitToMenu()}>
            Return to the Vale
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Toasts(): ReactNode {
  const toasts = useAppState((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div>
            <div className="toast-title">{t.title}</div>
            <div className="toast-body">{t.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
