import { mulberry32, TOGGLE_RADIAL_HEX } from "./lavaLampRandom";

const BLOB_COUNT = 6;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = items.slice() as T[];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Blob = {
  phase: number;
  phase2: number;
  wx: number;
  wy: number;
  color: string;
};

/**
 * Drives blob positions / hue on `:root`.
 * Do **not** re-declare the same `--bx*` / `--hue` on `.page-lava` in CSS — that would
 * shadow `:root` and freeze the gradient (no motion).
 */
export function attachMorphingPageLava(opts?: { seed?: number }): () => void {
  const root = document.documentElement;

  const effectiveSeed =
    typeof opts?.seed === "number" && Number.isFinite(opts.seed)
      ? Math.floor(opts.seed)
      : Math.floor(Math.random() * 0x7fffffff) || 0x9e3779b9;
  const rng = mulberry32(effectiveSeed);
  const colors = shuffle(TOGGLE_RADIAL_HEX, rng);

  const blobs: Blob[] = Array.from({ length: BLOB_COUNT }, (_, i) => ({
    phase: rng() * Math.PI * 2,
    phase2: rng() * Math.PI * 2,
    /* Faster, more “lava lamp” drift */
    wx: 0.09 + rng() * 0.22,
    wy: 0.1 + rng() * 0.24,
    color: colors[i % colors.length],
  }));

  for (let i = 0; i < BLOB_COUNT; i++) {
    root.style.setProperty(`--c${i}`, blobs[i].color);
  }

  const prefersReduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  let alive = true;
  let raf = 0;
  const t0 = performance.now();

  function tick(now: number) {
    if (!alive) return;
    const t = ((now - t0) / 1000) * (prefersReduced ? 0.15 : 1);

    for (let i = 0; i < BLOB_COUNT; i++) {
      const b = blobs[i];
      const x =
        50 +
        48 *
          Math.sin(t * b.wx + b.phase) *
          Math.cos(t * 0.045 + b.phase2 * 0.25);
      const y =
        50 +
        48 *
          Math.cos(t * b.wy + b.phase2) *
          Math.sin(t * 0.041 + b.phase * 0.18 + i * 0.55);
      root.style.setProperty(`--bx${i}`, `${x.toFixed(2)}%`);
      root.style.setProperty(`--by${i}`, `${y.toFixed(2)}%`);
    }

    const hue = (t * 14) % 360;
    root.style.setProperty("--hue", `${hue.toFixed(1)}deg`);

    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}
