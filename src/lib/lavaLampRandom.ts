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

export type LavaTheme = {
  lava: [string, string, string, string, string, string];
  ellipse: [string, string, string, string, string];
  /** Seconds for one full drift loop */
  driftDurationSec: number;
  bgSizeVw: number;
  bgSizeVh: number;
};

function hsl(rng: () => number, h: number, sSpread: number, lSpread: number) {
  const s = 72 + rng() * sSpread;
  const l = 48 + rng() * lSpread;
  return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;
}

/**
 * Comma-separated `background-image` layers (top → bottom). Uses literal colors
 * so the browser always repaints (no `var()` inside gradients).
 */
export function lavaBackdropImageLayers(theme: LavaTheme): string {
  const [a, b, c, d, e, f] = theme.lava;
  const [e0, e1, e2, e3, e4] = theme.ellipse;
  /* Long transparent tails reduce visible seams when the pattern repeats */
  const tail = "transparent 62%";
  return [
    `radial-gradient(circle at 30% 30%, ${a} 0%, ${tail})`,
    `radial-gradient(circle at 70% 30%, ${b} 0%, ${tail})`,
    `radial-gradient(circle at 50% 50%, ${c} 0%, ${tail})`,
    `radial-gradient(circle at 30% 70%, ${d} 0%, ${tail})`,
    `radial-gradient(circle at 70% 70%, ${e} 0%, ${tail})`,
    `radial-gradient(circle at 12% 48%, ${f} 0%, ${tail})`,
    `radial-gradient(ellipse at 50% 50%, ${e0} 0%, ${e1} 24%, ${e2} 50%, ${e3} 76%, ${e4} 100%)`,
  ].join(", ");
}

/**
 * Builds a saturated, blob-friendly palette: mixes a random base hue with a
 * complementary second pole so reloads read clearly different from “default rainbow”.
 */
export function randomLavaTheme(seed?: number): LavaTheme {
  const effectiveSeed =
    typeof seed === "number" && Number.isFinite(seed)
      ? Math.floor(seed)
      : Math.floor(Math.random() * 0x7fffffff) || 0x9e3779b9;
  const rng = mulberry32(effectiveSeed);
  const baseHue = rng() * 360;
  const secondHue = (baseHue + 140 + rng() * 80) % 360;
  const armSpread = 38 + rng() * 42;

  const lava = [0, 1, 2, 3, 4, 5].map((i) => {
    const pole = i % 2 === 0 ? baseHue : secondHue;
    const h = (pole + i * armSpread * 0.45 + (rng() - 0.5) * 55 + 360) % 360;
    return hsl(rng, h, 30, 24);
  }) as LavaTheme["lava"];

  const ellipse = [0, 1, 2, 3, 4].map((i) => {
    const pole = i % 2 === 0 ? secondHue : baseHue;
    const h = (pole + i * 58 + rng() * 48 + 360) % 360;
    return hsl(rng, h, 24, 30);
  }) as LavaTheme["ellipse"];

  const driftDurationSec = 26 + rng() * 38;
  const bgSizeVw = 50 + rng() * 22;
  const bgSizeVh = 52 + rng() * 26;

  return { lava, ellipse, driftDurationSec, bgSizeVw, bgSizeVh };
}
