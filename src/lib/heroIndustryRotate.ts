/**
 * Hero industry tagline — two-step wipe: erase left→right, then reveal next left→right.
 * Text layers stay fixed; only the background mask moves.
 */

const WIPE_MS = 520;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function measureText(layer: HTMLElement, text: string): number {
  layer.textContent = text;
  return layer.offsetWidth;
}

function animateTranslate(
  el: HTMLElement,
  fromX: number,
  toX: number,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const x = fromX + (toX - fromX) * easeInOutCubic(t);
      el.style.transform = `translate3d(${x}px, 0, 0)`;

      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };

    requestAnimationFrame(frame);
  });
}

export function initHeroIndustryRotate(root: HTMLElement) {
  if (root.dataset.heroIndustryBound === '1') return;
  root.dataset.heroIndustryBound = '1';

  let raw: string[] = [];
  try {
    raw = JSON.parse(root.dataset.industries ?? '[]') as string[];
  } catch {
    raw = [];
  }

  const industries = raw.map((s) => s.trim()).filter(Boolean);
  if (!industries.length) return;

  const viewport = root.querySelector<HTMLElement>('[data-hero-industry-viewport]');
  const current = root.querySelector<HTMLElement>('[data-hero-industry-current]');
  const next = root.querySelector<HTMLElement>('[data-hero-industry-next]');
  const wipe = root.querySelector<HTMLElement>('[data-hero-industry-wipe]');
  if (!viewport || !current || !next || !wipe) return;

  const intervalMs = Number(root.dataset.intervalMs) || 2500;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const initial = current.textContent?.trim() ?? '';
  const found = industries.indexOf(initial);
  let index = found >= 0 ? found : Math.floor(Math.random() * industries.length);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let swapping = false;

  const setViewportWidth = (px: number) => {
    viewport.style.width = `${px}px`;
  };

  const resetLayers = (label: string) => {
    current.textContent = label;
    current.hidden = false;
    next.textContent = '';
    next.hidden = true;
    const width = measureText(current, label);
    setViewportWidth(width);
    wipe.style.transform = `translate3d(${-width}px, 0, 0)`;
    root.dataset.heroIndustryLabel = label;
  };

  resetLayers(industries[index]!);

  if (industries.length <= 1) return;

  const cycle = async () => {
    if (swapping) return;
    swapping = true;

    const outgoing = industries[index]!;
    const incoming = industries[(index + 1) % industries.length]!;

    if (reducedMotion) {
      index = (index + 1) % industries.length;
      resetLayers(incoming);
      swapping = false;
      schedule();
      return;
    }

    const outWidth = measureText(current, outgoing);
    setViewportWidth(outWidth);
    current.hidden = false;
    next.hidden = true;
    next.textContent = '';

    // Step 1 — wipe out: mask slides left → right until the word is fully gone.
    wipe.style.transform = `translate3d(${-outWidth}px, 0, 0)`;
    await animateTranslate(wipe, -outWidth, 0, WIPE_MS);

    current.textContent = '';
    current.hidden = true;

    // Step 2 — wipe reveal: same mask slides off left → right, exposing the next word.
    const inWidth = measureText(next, incoming);
    setViewportWidth(inWidth);
    next.hidden = false;
    wipe.style.transform = 'translate3d(0px, 0, 0)';
    await animateTranslate(wipe, 0, inWidth, WIPE_MS);

    index = (index + 1) % industries.length;
    resetLayers(incoming);
    swapping = false;
    schedule();
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void cycle();
    }, intervalMs);
  };

  const stop = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  schedule();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!swapping) schedule();
  });
}

export function bootHeroIndustryRotate() {
  document.querySelectorAll<HTMLElement>('[data-hero-industry]').forEach(initHeroIndustryRotate);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHeroIndustryRotate, { once: true });
  } else {
    bootHeroIndustryRotate();
  }
  document.addEventListener('astro:page-load', bootHeroIndustryRotate);
}
