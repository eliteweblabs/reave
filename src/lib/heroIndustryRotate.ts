/**
 * Hero industry tagline — two-step wipe: erase left→right, then reveal next left→right.
 * Text layers stay fixed; only the background mask moves.
 * Viewport expands to the widest label during the wipe, then eases back so the
 * full tagline stays centered under the headline.
 */

const WIPE_MS = 520;
const RECENTER_MS = 420;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function measureText(layer: HTMLElement, text: string): number {
  const wasHidden = layer.hidden;
  if (wasHidden) layer.hidden = false;
  layer.textContent = text;
  const width = layer.offsetWidth;
  if (wasHidden) layer.hidden = true;
  return width;
}

function widestLabelWidth(layer: HTMLElement, labels: string[]): number {
  let max = 0;
  for (const label of labels) {
    max = Math.max(max, measureText(layer, label));
  }
  return max;
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

function animateWidth(
  el: HTMLElement,
  fromWidth: number,
  toWidth: number,
  durationMs: number,
): Promise<void> {
  if (fromWidth === toWidth || durationMs <= 0) {
    el.style.width = `${toWidth}px`;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const w = fromWidth + (toWidth - fromWidth) * easeInOutCubic(t);
      el.style.width = `${w}px`;

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

  const slotWidth = widestLabelWidth(current, industries);

  const initial = current.textContent?.trim() ?? '';
  const found = industries.indexOf(initial);
  let index = found >= 0 ? found : Math.floor(Math.random() * industries.length);

  const labelWidth = (label: string) => measureText(current, label);
  const initialWidth = labelWidth(industries[index]!);
  viewport.style.width = `${initialWidth}px`;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let swapping = false;

  const parkWipe = () => {
    wipe.style.transform = `translate3d(${-viewport.offsetWidth}px, 0, 0)`;
  };

  const resetLayers = (label: string) => {
    current.textContent = label;
    current.hidden = false;
    next.textContent = '';
    next.hidden = true;
    parkWipe();
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
      viewport.style.width = `${labelWidth(incoming)}px`;
      swapping = false;
      schedule();
      return;
    }

    current.textContent = outgoing;
    current.hidden = false;
    next.textContent = incoming;
    next.hidden = true;

    const incomingWidth = labelWidth(incoming);
    const fromWidth = viewport.offsetWidth;

    // Expand to the widest slot so the wipe never clips.
    await animateWidth(viewport, fromWidth, slotWidth, RECENTER_MS);
    parkWipe();

    // Step 1 — wipe out across the full slot (widest word width).
    wipe.style.transform = `translate3d(${-slotWidth}px, 0, 0)`;
    await animateTranslate(wipe, -slotWidth, 0, WIPE_MS);

    current.textContent = '';
    current.hidden = true;

    // Step 2 — wipe reveal: mask exits left → right over the same slot width.
    next.hidden = false;
    wipe.style.transform = 'translate3d(0px, 0, 0)';
    await animateTranslate(wipe, 0, slotWidth, WIPE_MS);

    index = (index + 1) % industries.length;
    resetLayers(incoming);

    // Ease the viewport back to the word's natural width so the tagline recenters.
    await animateWidth(viewport, slotWidth, incomingWidth, RECENTER_MS);
    parkWipe();

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
