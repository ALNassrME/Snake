/** Player-facing settings, persisted separately from the profile save. */

export type ParticleDensity = 'low' | 'medium' | 'high';
export type QualityPreset = 'auto' | 'low' | 'medium' | 'high';
export type ColorblindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';
export type ControlScheme = 'auto' | 'keyboard' | 'pointer' | 'touch';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  screenShake: number; // 0..1 intensity scale
  reduceMotion: boolean;
  reduceFlashes: boolean;
  particleDensity: ParticleDensity;
  quality: QualityPreset;
  bloom: boolean;
  colorblind: ColorblindMode;
  pointerSteering: boolean;
  hapticsEnabled: boolean;
  showFps: boolean;
  controlScheme: ControlScheme;
  uiScale: number; // 0.85..1.25
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.85,
  screenShake: 1,
  reduceMotion: false,
  reduceFlashes: false,
  particleDensity: 'high',
  quality: 'auto',
  bloom: true,
  colorblind: 'off',
  pointerSteering: true,
  hapticsEnabled: true,
  showFps: false,
  controlScheme: 'auto',
  uiScale: 1,
};

const SETTINGS_KEY = 'umbravale.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
  } catch (err) {
    console.warn('[settings] failed to load, using defaults', err);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[settings] failed to persist', err);
  }
}

export function sanitizeSettings(s: Settings): Settings {
  const clamp01 = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  return {
    ...s,
    masterVolume: clamp01(s.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: clamp01(s.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clamp01(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    screenShake: clamp01(s.screenShake, DEFAULT_SETTINGS.screenShake),
    uiScale:
      typeof s.uiScale === 'number' && Number.isFinite(s.uiScale)
        ? Math.min(1.25, Math.max(0.85, s.uiScale))
        : DEFAULT_SETTINGS.uiScale,
  };
}
