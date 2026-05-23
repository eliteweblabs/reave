/**
 * Deterministic PRNG (mulberry32) so palettes can be reproduced from a seed number.
 */
export function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Exact colors used on `VoiceChatButton` active toggle track (radial blobs).
 * @see VoiceChatButton.astro `.vapi-voice-button.active .toggle-track`
 */
export const TOGGLE_RADIAL_HEX = [
  "#ff0000",
  "#ff00ff",
  "#00ffff",
  "#00ff00",
  "#ffff00",
] as const;

/**
 * Ellipse stops on the same control: matches linear border sequence folded into radial.
 */
export const TOGGLE_ELLIPSE_HEX = [
  "#ff0000",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#ff0000",
] as const;

export type LavaTheme = {
  /** One color per radial, same positions as the toggle (30/30 … 70/70). */
  lava: [string, string, string, string, string];
  ellipse: [string, string, string, string, string];
  /** Seconds for one full drift loop */
  driftDurationSec: number;
  bgSizeVw: number;
  bgSizeVh: number;
};

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** #rrggbb → rgba() for soft under-painting (avoids harsh #000 gutters). */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

/** Bottom-most layer: fills tile corners / repeat gaps without flat black. */
function deepWashLayer(theme: LavaTheme): string {
  const [e0, e1, e2, e3] = theme.ellipse;
  const a = hexToRgb(e1);
  const b = hexToRgb(e2);
  const c = hexToRgb(e0);
  const d = hexToRgb(e3);
  return [
    "radial-gradient(ellipse 185% 185% at 50% 50%,",
    `rgba(${a.r},${a.g},${a.b},0.55) 0%,`,
    `rgba(${b.r},${b.g},${b.b},0.35) 38%,`,
    `rgba(${c.r},${c.g},${c.b},0.45) 62%,`,
    `rgb(${Math.round(d.r * 0.12)},0,${Math.max(18, Math.round(d.b * 0.14))}) 100%)`,
  ].join(" ");
}

/**
 * Same stacking order and stops as `.vapi-voice-button.active .toggle-track`,
 * but colors come from the theme (permuted toggle hex).
 * Softer radial tails + deep wash reduce repeat seams and “black ring” gutters.
 */
export function lavaBackdropImageLayers(theme: LavaTheme): string {
  const [c0, c1, c2, c3, c4] = theme.lava;
  const [e0, e1, e2, e3, e4] = theme.ellipse;
  /* Longer falloff than the 60px toggle (fewer hard rings when tiled large) */
  const tail = "transparent 72%";
  return [
    `radial-gradient(circle at 30% 30%, ${c0} 0%, ${c0} 4%, ${tail})`,
    `radial-gradient(circle at 70% 30%, ${c1} 0%, ${c1} 4%, ${tail})`,
    `radial-gradient(circle at 50% 50%, ${c2} 0%, ${c2} 4%, ${tail})`,
    `radial-gradient(circle at 30% 70%, ${c3} 0%, ${c3} 4%, ${tail})`,
    `radial-gradient(circle at 70% 70%, ${c4} 0%, ${c4} 4%, ${tail})`,
    `radial-gradient(ellipse at center, ${e0} 0%, ${e1} 25%, ${e2} 50%, ${e3} 75%, ${e4} 100%)`,
    deepWashLayer(theme),
  ].join(", ");
}

/**
 * Randomizes **which** pure toggle hex sits in each slot — same sRGB primaries as
 * the mic toggle, never muted HSL blends.
 */
export function randomLavaTheme(seed?: number): LavaTheme {
  const effectiveSeed =
    typeof seed === "number" && Number.isFinite(seed)
      ? Math.floor(seed)
      : Math.floor(Math.random() * 0x7fffffff) || 0x9e3779b9;
  const rng = mulberry32(effectiveSeed);

  const lava = shuffle([...TOGGLE_RADIAL_HEX], rng) as LavaTheme["lava"];
  const ellipse = shuffle([...TOGGLE_ELLIPSE_HEX], rng) as LavaTheme["ellipse"];

  const driftDurationSec = 26 + rng() * 38;
  const bgSizeVw = 50 + rng() * 22;
  const bgSizeVh = 52 + rng() * 26;

  return { lava, ellipse, driftDurationSec, bgSizeVw, bgSizeVh };
}
