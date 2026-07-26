/** Menu screens: main menu, mode select, settings, cosmetics, achievements, daily. */
import type { ReactNode } from 'react';
import { controller } from '../app/controller';
import { useAppState } from '../app/store';
import { formatScore } from '../core/mathUtils';
import type { ColorblindMode, ParticleDensity, QualityPreset } from '../core/settings';
import { ACHIEVEMENTS } from '../game/achievements';
import { SKINS, unlockDescription } from '../game/cosmetics';
import { effectiveStreak, localDateKey } from '../game/daily';
import { MODE_ORDER, MODES } from '../game/modes';
import { levelFromXp } from '../game/progression';
import { AchievementGlyph, Button, Cycler, Ornament, SettingRow, SkinPreview, Slider, Toggle } from './components';

export function MainMenu(): ReactNode {
  const profile = useAppState((s) => s.profile);
  const daily = useAppState((s) => s.dailyChallenge);
  const level = levelFromXp(profile.xp);
  const streak = effectiveStreak(profile, localDateKey());

  return (
    <div className="screen stagger">
      <h1 className="game-title">Umbra Vale</h1>
      <p className="game-subtitle">a wyrm&rsquo;s pilgrimage through the gloaming</p>
      <Ornament />
      <div className="menu-column">
        <Button autoFocus onClick={() => controller.navigate('modes')}>
          Begin the Rite
        </Button>
        <Button variant="gold" onClick={() => controller.navigate('daily')}>
          Daily Rite{daily && !profile.daily.completed ? ' ✦' : ''}
        </Button>
        <Button onClick={() => controller.navigate('cosmetics')}>Wyrmskins</Button>
        <Button onClick={() => controller.navigate('achievements')}>Deeds</Button>
        <Button onClick={() => controller.navigate('settings')}>Settings</Button>
      </div>
      <div className="menu-footer">
        <div className="level-line">
          <span>
            Level <b>{level.level}</b>
          </span>
          {streak > 0 ? <span>Streak {streak}✦</span> : <span />}
          <span>{formatScore(profile.xp)} xp</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${level.progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export function ModeSelect(): ReactNode {
  const profile = useAppState((s) => s.profile);
  return (
    <div className="screen stagger">
      <h2 className="heading">Choose Your Rite</h2>
      <Ornament />
      <div className="mode-grid">
        {MODE_ORDER.map((id) => {
          const mode = MODES[id];
          const best = profile.bestScores[id];
          return (
            <button
              key={id}
              className="mode-card"
              data-focusable
              onMouseEnter={() => controller.playHover()}
              onClick={() => controller.startRun(id)}
            >
              <h3>{mode.name}</h3>
              <p>{mode.tagline}</p>
              <span className="mode-best">
                {best !== undefined ? `Best · ${formatScore(best)}` : 'Untried'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="screen-actions">
        <Button variant="quiet" small onClick={() => { controller.playBack(); controller.navigate('menu'); }}>
          Return
        </Button>
      </div>
    </div>
  );
}

const QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const satisfies readonly QualityPreset[];
const DENSITY_OPTIONS = ['low', 'medium', 'high'] as const satisfies readonly ParticleDensity[];
const CB_OPTIONS = ['off', 'deuteranopia', 'protanopia', 'tritanopia'] as const satisfies readonly ColorblindMode[];

export function SettingsScreen(): ReactNode {
  const settings = useAppState((s) => s.settings);
  const set = (patch: Parameters<typeof controller.updateSettings>[0]) =>
    controller.updateSettings(patch);

  return (
    <div className="screen">
      <h2 className="heading">Settings</h2>
      <Ornament />
      <div className="settings-body">
        <div className="settings-section">Sound</div>
        <SettingRow label="Master volume">
          <Slider label="Master volume" value={settings.masterVolume} onChange={(v) => set({ masterVolume: v })} />
        </SettingRow>
        <SettingRow label="Music">
          <Slider label="Music volume" value={settings.musicVolume} onChange={(v) => set({ musicVolume: v })} />
        </SettingRow>
        <SettingRow label="Effects">
          <Slider label="Effects volume" value={settings.sfxVolume} onChange={(v) => set({ sfxVolume: v })} />
        </SettingRow>

        <div className="settings-section">Picture</div>
        <SettingRow label="Quality" hint="Auto adapts to keep the frame rate smooth.">
          <Cycler label="Quality" value={settings.quality} options={QUALITY_OPTIONS} onChange={(v) => set({ quality: v })} />
        </SettingRow>
        <SettingRow label="Particle density">
          <Cycler label="Particle density" value={settings.particleDensity} options={DENSITY_OPTIONS} onChange={(v) => set({ particleDensity: v })} />
        </SettingRow>
        <SettingRow label="Bloom">
          <Toggle label="Bloom" checked={settings.bloom} onChange={(v) => set({ bloom: v })} />
        </SettingRow>
        <SettingRow label="Screen shake">
          <Slider label="Screen shake" value={settings.screenShake} onChange={(v) => set({ screenShake: v })} />
        </SettingRow>
        <SettingRow label="Show frame rate">
          <Toggle label="Show frame rate" checked={settings.showFps} onChange={(v) => set({ showFps: v })} />
        </SettingRow>

        <div className="settings-section">Controls</div>
        <SettingRow label="Pointer steering" hint="The wyrm follows your cursor.">
          <Toggle label="Pointer steering" checked={settings.pointerSteering} onChange={(v) => set({ pointerSteering: v })} />
        </SettingRow>
        <SettingRow label="Haptics" hint="Rumble on supported gamepads and phones.">
          <Toggle label="Haptics" checked={settings.hapticsEnabled} onChange={(v) => set({ hapticsEnabled: v })} />
        </SettingRow>

        <div className="settings-section">Accessibility</div>
        <SettingRow label="Reduce motion" hint="Calms shake, ghosts and menu animation.">
          <Toggle label="Reduce motion" checked={settings.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
        </SettingRow>
        <SettingRow label="Reduce flashes">
          <Toggle label="Reduce flashes" checked={settings.reduceFlashes} onChange={(v) => set({ reduceFlashes: v })} />
        </SettingRow>
        <SettingRow label="Colour assist">
          <Cycler label="Colour assist" value={settings.colorblind} options={CB_OPTIONS} onChange={(v) => set({ colorblind: v })} />
        </SettingRow>
        <SettingRow label="Interface size">
          <Slider label="Interface size" min={0.85} max={1.25} step={0.05} value={settings.uiScale} onChange={(v) => set({ uiScale: v })} />
        </SettingRow>
      </div>
      <div className="screen-actions">
        <Button variant="quiet" small onClick={() => { controller.playBack(); controller.navigate('menu'); }}>
          Return
        </Button>
      </div>
    </div>
  );
}

export function CosmeticsScreen(): ReactNode {
  const profile = useAppState((s) => s.profile);
  return (
    <div className="screen stagger">
      <h2 className="heading">Wyrmskins</h2>
      <Ornament />
      <div className="skin-grid">
        {SKINS.map((skin) => {
          const unlocked = profile.unlockedSkins.includes(skin.id);
          const selected = profile.selectedSkin === skin.id;
          return (
            <button
              key={skin.id}
              className={`skin-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`}
              data-focusable={unlocked ? true : undefined}
              disabled={!unlocked}
              onMouseEnter={() => unlocked && controller.playHover()}
              onClick={() => controller.selectSkin(skin.id)}
            >
              <SkinPreview colors={skin.colors} />
              <h4>{skin.name}</h4>
              <p className="skin-lore">{skin.lore}</p>
              <span className="skin-unlock">
                {selected ? '✦ Worn ✦' : unlocked ? 'Unlocked' : unlockDescription(skin)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="screen-actions">
        <Button variant="quiet" small onClick={() => { controller.playBack(); controller.navigate('menu'); }}>
          Return
        </Button>
      </div>
    </div>
  );
}

export function AchievementsScreen(): ReactNode {
  const profile = useAppState((s) => s.profile);
  const earnedCount = Object.keys(profile.achievements).length;
  return (
    <div className="screen stagger">
      <h2 className="heading">Deeds</h2>
      <p className="game-subtitle">
        {earnedCount} of {ACHIEVEMENTS.length} remembered by the Vale
      </p>
      <Ornament />
      <div className="achv-list">
        {ACHIEVEMENTS.map((a) => {
          const earned = Boolean(profile.achievements[a.id]);
          const hidden = a.secret && !earned;
          return (
            <div key={a.id} className={`achv ${earned ? 'earned' : ''}`}>
              <AchievementGlyph glyph={a.glyph} />
              <div>
                <h5>{hidden ? 'A Hidden Deed' : a.name}</h5>
                <p>{hidden ? 'The Vale keeps this secret still.' : a.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="screen-actions">
        <Button variant="quiet" small onClick={() => { controller.playBack(); controller.navigate('menu'); }}>
          Return
        </Button>
      </div>
    </div>
  );
}

export function DailyScreen(): ReactNode {
  const profile = useAppState((s) => s.profile);
  const challenge = useAppState((s) => s.dailyChallenge);
  if (!challenge) return null;
  const today = localDateKey();
  const streak = effectiveStreak(profile, today);
  const isToday = profile.daily.activeDate === today;
  const progress = isToday ? profile.daily.progress : 0;
  const completed = isToday && profile.daily.completed;
  const mode = MODES[challenge.mode];

  return (
    <div className="screen stagger">
      <h2 className="heading">Daily Rite</h2>
      <p className="game-subtitle">{challenge.date}</p>
      <Ornament />
      <div className="panel daily-panel">
        <div className="hud-mode">{mode.name}</div>
        <div className="daily-goal">{challenge.goal.label}</div>
        <div className="daily-mod">
          {challenge.modifier.name} — {challenge.modifier.description}
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, (progress / challenge.goal.target) * 100)}%` }}
          />
        </div>
        <div className="daily-mod">
          {completed
            ? 'Completed. The Vale is pleased.'
            : `${formatScore(progress)} / ${formatScore(challenge.goal.target)}`}
        </div>
        <div className="daily-streak">
          <div className="stat">
            <b>{streak}</b>
            <span>Streak</span>
          </div>
          <div className="stat">
            <b>{profile.daily.bestStreak}</b>
            <span>Best</span>
          </div>
          <div className="stat">
            <b>+{challenge.xpReward}</b>
            <span>XP Reward</span>
          </div>
        </div>
        <div className="menu-column">
          <Button variant="gold" disabled={completed} onClick={() => controller.startRun(challenge.mode, true)}>
            {completed ? 'Rite Complete' : 'Undertake the Rite'}
          </Button>
        </div>
      </div>
      <div className="screen-actions">
        <Button variant="quiet" small onClick={() => { controller.playBack(); controller.navigate('menu'); }}>
          Return
        </Button>
      </div>
    </div>
  );
}
