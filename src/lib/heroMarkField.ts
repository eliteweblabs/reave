/**
 * Homepage /card neon mark fill — a continuous spectral field that never
 * tiles and never loops. The old 45° repeating-linear-gradient always came
 * back to the same stripe; this paints domain-warped noise and walks time
 * only forward, so a reload and a long sit both look unique.
 *
 * Every pixel is colored (no blob gaps through the mask). Bloom + face
 * layers share one seed and clock so the glow matches the ink.
 */

/** Internal paint size. Soft-scaled up; keep small so rAF stays cheap. */
const FIELD = 72;
/** Spatial frequency. Too low reads as one diagonal wash. */
const SCALE = 2.85;
/** Domain-warp amount. Keep moderate so blobs stay distinct. */
const WARP = 1.25;
/** How fast the 3rd noise axis advances (no wrap). */
const TIME_SCALE = 0.06;
/** Stretch fbm (~0.3–0.7) across most of the hue wheel. */
const HUE_SPREAD = 2.35;
/** Slow morph — 15fps is plenty and keeps phones cool. */
const FRAME_MS = 1000 / 15;
const SATURATION = 0.92;
const LIGHTNESS = 0.58;
const LUMA_TARGET = 0.42;
const LUMA_MAX_GAIN = 1.75;

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash3(x: number, y: number, z: number): number {
  let n = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  const nx00 = n000 + (n100 - n000) * u;
  const nx10 = n010 + (n110 - n010) * u;
  const nx01 = n001 + (n101 - n001) * u;
  const nx11 = n011 + (n111 - n011) * u;
  const nxy0 = nx00 + (nx10 - nx00) * v;
  const nxy1 = nx01 + (nx11 - nx01) * v;
  return nxy0 + (nxy1 - nxy0) * w;
}

function fbm3(x: number, y: number, z: number): number {
  let n = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 3; i++) {
    n += a * vnoise3(x * f, y * f, z * f);
    a *= 0.5;
    f *= 2.03;
  }
  return n;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

function normalizeLuma(r: number, g: number, b: number): [number, number, number] {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum <= 1e-4) return [r, g, b];
  const gain = Math.min(LUMA_TARGET / lum, LUMA_MAX_GAIN);
  if (gain <= 1) return [r, g, b];
  return [r * gain, g * gain, b * gain];
}

type FieldSeed = {
  hue0: number;
  s0: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
};

function randomSeed(): FieldSeed {
  return {
    hue0: Math.random(),
    s0: Math.random() * 40,
    s1: Math.random() * 40,
    s2: Math.random() * 40 + 17,
    s3: Math.random() * 40 + 9,
    s4: Math.random() * 40 + 31,
    s5: Math.random() * 40 + 4,
  };
}

function paintField(
  image: ImageData,
  seed: FieldSeed,
  t: number,
): void {
  const { data, width: w, height: h } = image;
  const aspect = w / Math.max(h, 1);
  for (let y = 0; y < h; y++) {
    const v = (y / h) * SCALE;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * SCALE * aspect;
      const qx = fbm3(u + seed.s0, v + seed.s1, t * 0.37);
      const qy = fbm3(u + seed.s2, v + seed.s3, t * 0.29);
      const n = fbm3(u + WARP * qx, v + WARP * qy, t);
      const n2 = fbm3(u * 0.48 + seed.s4, v * 0.48 + seed.s5, t * 0.22);
      const hue = seed.hue0 + (n - 0.5) * HUE_SPREAD + (n2 - 0.5) * 1.15;
      let [r, g, b] = hslToRgb(hue, SATURATION, LIGHTNESS);
      [r, g, b] = normalizeLuma(r, g, b);
      const i = (y * w + x) * 4;
      data[i] = Math.min(255, r * 255);
      data[i + 1] = Math.min(255, g * 255);
      data[i + 2] = Math.min(255, b * 255);
      data[i + 3] = 255;
    }
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ensureCanvas(host: HTMLElement): HTMLCanvasElement {
  let canvas = host.querySelector<HTMLCanvasElement>("canvas[data-hero-mark-field]");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.setAttribute("data-hero-mark-field", "");
    canvas.width = FIELD;
    canvas.height = FIELD;
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
  }
  return canvas;
}

type MarkRoot = HTMLElement & { __heroMarkCleanup?: () => void };

function attachMark(root: MarkRoot): () => void {
  root.__heroMarkCleanup?.();

  const sweeps = Array.from(
    root.querySelectorAll<HTMLElement>(".home-hero-mark-sweep"),
  );
  if (sweeps.length === 0) {
    return () => {};
  }

  const canvases = sweeps.map(ensureCanvas);
  const contexts = canvases
    .map((c) => c.getContext("2d", { alpha: false }))
    .filter((ctx): ctx is CanvasRenderingContext2D => Boolean(ctx));
  if (contexts.length === 0) {
    return () => {};
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = FIELD;
  offscreen.height = FIELD;
  const offCtx = offscreen.getContext("2d", { alpha: false });
  if (!offCtx) {
    return () => {};
  }
  const image = offCtx.createImageData(FIELD, FIELD);
  const seed = randomSeed();
  const t0 = Math.random() * 40;
  const reduced = prefersReducedMotion();

  const blit = (t: number) => {
    paintField(image, seed, t0 + t * TIME_SCALE);
    offCtx.putImageData(image, 0, 0);
    for (const ctx of contexts) {
      ctx.drawImage(offscreen, 0, 0);
    }
  };

  blit(0);

  let raf = 0;
  let start = 0;
  let lastPaint = 0;
  let running = true;
  let pausedT = 0;

  const onVisibility = () => {
    if (document.hidden) {
      if (start) pausedT += (performance.now() - start) / 1000;
      cancelAnimationFrame(raf);
      raf = 0;
      start = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const tick = (now: number) => {
    if (!running) return;
    if (!start) start = now;
    if (now - lastPaint >= FRAME_MS) {
      lastPaint = now;
      blit((now - start) / 1000 + pausedT);
    }
    raf = requestAnimationFrame(tick);
  };

  const cleanup = () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVisibility);
    if (root.__heroMarkCleanup === cleanup) delete root.__heroMarkCleanup;
    for (const canvas of canvases) canvas.remove();
  };
  root.__heroMarkCleanup = cleanup;

  if (!reduced) {
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(tick);
  }

  return cleanup;
}

export function attachHeroMarkFields(): () => void {
  const cleanups = new Map<HTMLElement, () => void>();

  const boot = () => {
    document.querySelectorAll<HTMLElement>("[data-hero-mark]").forEach((root) => {
      cleanups.get(root)?.();
      cleanups.set(root, attachMark(root));
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  const onPageHide = () => {
    cleanups.forEach((cleanup) => cleanup());
    cleanups.clear();
  };
  window.addEventListener("pagehide", onPageHide);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    onPageHide();
  };
}
