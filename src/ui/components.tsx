/** Shared UI primitives: buttons, toggles, sliders, cyclers and glyph art. */
import type { ReactNode } from 'react';
import { controller } from '../app/controller';
import type { SkinColors } from '../game/cosmetics';

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function Button(props: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'gold' | 'quiet';
  small?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}): ReactNode {
  const cls = [
    'btn',
    props.variant === 'gold' ? 'btn-gold' : '',
    props.variant === 'quiet' ? 'btn-quiet' : '',
    props.small ? 'btn-small' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={cls}
      data-focusable
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      onMouseEnter={() => controller.playHover()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function Ornament(): ReactNode {
  return (
    <div className="ornament" aria-hidden>
      <div className="gem" />
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }): ReactNode {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      data-focusable
      onMouseEnter={() => controller.playHover()}
      onClick={() => {
        controller.playHover();
        props.onChange(!props.checked);
      }}
    />
  );
}

export function Slider(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}): ReactNode {
  return (
    <input
      className="slider"
      type="range"
      data-focusable
      aria-label={props.label}
      min={props.min ?? 0}
      max={props.max ?? 1}
      step={props.step ?? 0.05}
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

export function Cycler<T extends string>(props: {
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (v: T) => void;
  label: string;
}): ReactNode {
  const idx = props.options.indexOf(props.value);
  const move = (dir: number) => {
    controller.playHover();
    const next = props.options[(idx + dir + props.options.length) % props.options.length]!;
    props.onChange(next);
  };
  return (
    <div className="cycler" aria-label={props.label}>
      <button data-focusable aria-label={`${props.label}: previous`} onClick={() => move(-1)}>
        ‹
      </button>
      <span className="cycler-value">{props.labels?.[props.value] ?? props.value}</span>
      <button data-focusable aria-label={`${props.label}: next`} onClick={() => move(1)}>
        ›
      </button>
    </div>
  );
}

export function SettingRow(props: { label: string; hint?: string; children: ReactNode }): ReactNode {
  return (
    <div className="setting-row">
      <label>
        {props.label}
        {props.hint ? <span className="hint">{props.hint}</span> : null}
      </label>
      {props.children}
    </div>
  );
}

/** Original achievement glyphs — small engraved sigils. */
export function AchievementGlyph(props: { glyph: string }): ReactNode {
  const stroke = '#f0c060';
  const common = { fill: 'none', stroke, strokeWidth: 2, strokeLinecap: 'round' as const };
  let art: ReactNode;
  switch (props.glyph) {
    case 'spark':
      art = (
        <>
          <circle cx="24" cy="24" r="7" {...common} />
          <path d="M24 6v8M24 34v8M6 24h8M34 24h8" {...common} />
        </>
      );
      break;
    case 'chain':
      art = (
        <>
          <circle cx="16" cy="24" r="8" {...common} />
          <circle cx="32" cy="24" r="8" {...common} />
        </>
      );
      break;
    case 'crown':
      art = (
        <path d="M8 34 L12 16 L20 26 L24 12 L28 26 L36 16 L40 34 Z" {...common} strokeLinejoin="round" />
      );
      break;
    case 'warden':
      art = (
        <>
          <path d="M24 6 C36 14 34 30 24 42 C14 30 12 14 24 6 Z" {...common} strokeLinejoin="round" />
          <ellipse cx="19" cy="20" rx="1.6" ry="4" fill={stroke} stroke="none" />
          <ellipse cx="29" cy="20" rx="1.6" ry="4" fill={stroke} stroke="none" />
        </>
      );
      break;
    case 'depth':
      art = (
        <>
          <path d="M8 16 Q24 26 40 16" {...common} />
          <path d="M8 26 Q24 36 40 26" {...common} opacity="0.7" />
          <path d="M8 36 Q24 46 40 36" {...common} opacity="0.4" />
        </>
      );
      break;
    case 'bloom':
      art = (
        <>
          <circle cx="24" cy="24" r="5" {...common} />
          <path d="M24 8 Q28 16 24 19 Q20 16 24 8Z M24 40 Q28 32 24 29 Q20 32 24 40Z M8 24 Q16 20 19 24 Q16 28 8 24Z M40 24 Q32 20 29 24 Q32 28 40 24Z" {...common} strokeLinejoin="round" />
        </>
      );
      break;
    case 'moon':
      art = <path d="M30 8 A18 18 0 1 0 30 40 A14 14 0 1 1 30 8 Z" {...common} strokeLinejoin="round" />;
      break;
    default: // storm
      art = (
        <path d="M28 6 L14 26 h8 L18 42 L34 20 h-9 L28 6 Z" {...common} strokeLinejoin="round" />
      );
  }
  return (
    <svg className="achv-glyph" viewBox="0 0 48 48" aria-hidden>
      {art}
    </svg>
  );
}

/** Miniature painted wyrm rendered in a skin's colours. */
export function SkinPreview(props: { colors: SkinColors; size?: number }): ReactNode {
  const s = props.size ?? 110;
  const c = props.colors;
  const segments = 11;
  const points: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const a = t * Math.PI * 2.1 - Math.PI * 0.6;
    points.push({
      x: 55 + Math.cos(a) * (30 - t * 12),
      y: 58 + Math.sin(a) * (26 - t * 10),
      r: 11 - t * 6.5,
    });
  }
  const head = points[0]!;
  return (
    <svg
      className="skin-preview"
      width={s}
      height={s}
      viewBox="0 0 110 110"
      aria-hidden
    >
      <circle cx={head.x} cy={head.y} r={30} fill={hex(c.glow)} opacity={0.22} />
      {points
        .slice()
        .reverse()
        .map((p, i) => {
          const t = 1 - i / (segments - 1);
          const mix = t;
          // simple two-stop gradient across the body
          const col = mix < 0.5 ? c.bodyA : c.bodyB;
          return <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={hex(col)} opacity={0.95} />;
        })}
      <circle cx={head.x} cy={head.y} r={11.5} fill={hex(c.head)} />
      <circle cx={head.x - 4} cy={head.y - 2} r={2.1} fill={hex(c.eye)} />
      <circle cx={head.x + 4} cy={head.y - 2} r={2.1} fill={hex(c.eye)} />
    </svg>
  );
}

export { hex };
