/**
 * Hero industry tagline — random start, then a left-to-right background wipe
 * reveals the next label (mask block width matches the outgoing word).
 */

const WIPE_MS = 650;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function measureLayer(el: HTMLElement, text: string): number {
  el.textContent = text;
  return el.offsetWidth;
}

function applyWipe(opts: {
  x: number;
  width: number;
  current: HTMLElement;
  next: HTMLElement;
  wipe: HTMLElement;
}) {
  const { x, width, current, next, wipe } = opts;
  if (width <= 0) return;

  const revealPx = Math.max(0, Math.min(x, width));
  const currentLeftPx = Math.max(0, Math.min(x + width, width));

  next.style.clipPath = `inset(0 ${100 - (revealPx / width) * 100}% 0 0)`;
  current.style.clipPath = `inset(0 0 0 ${(currentLeftPx / width) * 100}%)`;
  wipe.style.transform = `translate3d(${x}px, 0, 0)`;
}

function runWipe(
  viewport: HTMLElement,
  current: HTMLElement,
  next: HTMLElement,
  wipe: HTMLElement,
  outgoing: string,
  incoming: string,
): Promise<void> {
  current.textContent = outgoing;
  next.textContent = incoming;

  const width = measureLayer(current, outgoing);
  viewport.style.width = `${width}px`;
  next.style.width = `${width}px`;
  current.style.width = `${width}px`;

  applyWipe({ x: -width, width, current, next, wipe });

  return new Promise((resolve) => {
    const startX = -width;
    const endX = width;
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / WIPE_MS);
      const x = startX + (endX - startX) * easeInOutCubic(t);
      applyWipe({ x, width, current, next, wipe });

      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }

      const nextWidth = measureLayer(current, incoming);
      viewport.style.width = `${nextWidth}px`;
      next.style.width = `${nextWidth}px`;
      current.style.width = `${nextWidth}px`;
      current.textContent = incoming;
      next.textContent = '';
      next.style.clipPath = '';
      current.style.clipPath = '';
      wipe.style.transform = `translate3d(${-nextWidth}px, 0, 0)`;
      resolve();
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

  let index = 0;
  const initial = current.textContent?.trim() ?? '';
  const found = industries.indexOf(initial);
  index = found >= 0 ? found : Math.floor(Math.random() * industries.length);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let swapping = false;

  const setInitial = () => {
    const label = industries[index]!;
    current.textContent = label;
    next.textContent = '';
    const width = measureLayer(current, label);
    viewport.style.width = `${width}px`;
    wipe.style.transform = `translate3d(${-width}px, 0, 0)`;
    root.dataset.heroIndustryLabel = label;
  };

  setInitial();

  if (industries.length <= 1) return;

  const swap = async () => {
    if (swapping) return;
    swapping = true;

    const outgoing = industries[index]!;
    index = (index + 1) % industries.length;
    const incoming = industries[index]!;

    if (reducedMotion) {
      current.textContent = incoming;
      const width = measureLayer(current, incoming);
      viewport.style.width = `${width}px`;
      root.dataset.heroIndustryLabel = incoming;
      swapping = false;
      schedule();
      return;
    }

    await runWipe(viewport, current, next, wipe, outgoing, incoming);
    root.dataset.heroIndustryLabel = incoming;
    swapping = false;
    schedule();
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void swap();
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
