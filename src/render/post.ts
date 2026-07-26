/**
 * Cinematic post-processing — the "film look" pass that sits on the stage.
 *
 * One full-screen shader applies, in order: radial chromatic aberration,
 * exposure + filmic S-curve contrast, saturation, split-tone colour grading
 * (cool shadows / warm highlights), a soft vignette and animated film grain.
 * A separate bright-pass filter turns the quarter-res bloom buffer into a
 * true emissive bloom (only bright pixels glow) instead of a whole-scene blur.
 *
 * Everything is driven by a handful of uniforms so the renderer can dial the
 * look per quality tier and per accessibility setting.
 */
import { Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const cineFrag = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;
uniform float uAberration;
uniform float uVignette;
uniform float uGrain;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vTextureCoord;
  vec2 centered = uv - 0.5;
  float dist2 = dot(centered, centered);

  // --- chromatic aberration: channels drift apart towards the frame edge ---
  vec2 shift = centered * dist2 * uAberration;
  vec3 col;
  col.r = texture(uTexture, uv + shift).r;
  col.g = texture(uTexture, uv).g;
  col.b = texture(uTexture, uv - shift).b;
  float alpha = texture(uTexture, uv).a;
  if (alpha > 0.0) col /= alpha;
  col = clamp(col, 0.0, 1.0);

  // --- S-curve contrast: deepens shadows, lifts brights, keeps blacks ---
  vec3 curved = col * col * (3.0 - 2.0 * col);
  vec3 graded = mix(col, curved, uContrast * uIntensity);

  // --- saturation ---
  float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(luma), graded, uSaturation);

  // --- split-tone grade: shadows lean cool, highlights lean warm ---
  float shadowMask = 1.0 - smoothstep(0.0, 0.55, luma);
  float highMask = smoothstep(0.45, 1.0, luma);
  vec3 tint = mix(vec3(1.0), uShadowTint, shadowMask * uIntensity);
  tint *= mix(vec3(1.0), uHighlightTint, highMask * uIntensity);
  graded *= tint;

  // --- vignette: draws the eye to the centre of the frame ---
  float vig = 1.0 - smoothstep(0.18, 0.72, dist2) * uVignette;
  graded *= vig;

  // --- animated film grain, luma-weighted so shadows breathe ---
  float g = hash(gl_FragCoord.xy + vec2(fract(uTime * 61.7) * 719.0));
  graded += (g - 0.5) * uGrain * (1.0 - luma * 0.6);

  finalColor = vec4(graded * alpha, alpha);
}
`;

export class CinematicFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment: cineFrag,
        name: 'cinematic-filter',
      }),
      resources: {
        cineUniforms: new UniformGroup({
          uTime: { value: 0, type: 'f32' },
          uIntensity: { value: 1, type: 'f32' },
          // Texture-coordinate units: 0.008 * dist2(max 0.5) ≈ 4px at 1080p.
          uAberration: { value: 0.008, type: 'f32' },
          uVignette: { value: 0.38, type: 'f32' },
          uGrain: { value: 0.035, type: 'f32' },
          uSaturation: { value: 1.16, type: 'f32' },
          uContrast: { value: 0.55, type: 'f32' },
          uShadowTint: { value: new Float32Array([0.92, 1.01, 1.06]), type: 'vec3<f32>' },
          uHighlightTint: { value: new Float32Array([1.06, 1.01, 0.92]), type: 'vec3<f32>' },
        }),
      },
    });
  }

  private get u(): Record<string, number> {
    return this.resources.cineUniforms.uniforms as Record<string, number>;
  }

  set time(v: number) {
    this.u.uTime = v;
  }

  set intensity(v: number) {
    this.u.uIntensity = v;
  }

  /** Extra channel-split on hits/fever; 0.008 is the calm baseline. */
  set aberration(v: number) {
    this.u.uAberration = v;
  }

  set grain(v: number) {
    this.u.uGrain = v;
  }

  set vignette(v: number) {
    this.u.uVignette = v;
  }
}

const brightFrag = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uThreshold;
uniform float uKnee;

void main() {
  vec4 c = texture(uTexture, vTextureCoord);
  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float keep = smoothstep(uThreshold, uThreshold + uKnee, luma);
  finalColor = c * keep;
}
`;

/** Keeps only the bright end of the frame so bloom reads as emission. */
export class BrightPassFilter extends Filter {
  constructor(threshold = 0.42, knee = 0.5) {
    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment: brightFrag,
        name: 'bright-pass-filter',
      }),
      resources: {
        brightUniforms: new UniformGroup({
          uThreshold: { value: threshold, type: 'f32' },
          uKnee: { value: knee, type: 'f32' },
        }),
      },
    });
  }
}
