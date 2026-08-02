/**
 * Hero industry tagline — two-step wipe: erase left→right, then reveal next left→right.
 * Text layers stay fixed; only the background mask moves.
 * Viewport width matches each word; it resizes under the mask between wipe steps.
 */

const WIPE_MS = 520;

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

  const labelWidth = (label: string) => measureText(current, label);

  const initial = current.textContent?.trim() ?? '';
  const found = industries.indexOf(initial);
  let index = found >= 0 ? found : Math.floor(Math.random() * industries.length);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let swapping = false;

  const setViewportWidth = (widthPx: number) => {
    viewport.style.width = `${widthPx}px`;
  };

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
  setViewportWidth(labelWidth(industries[index]!));

  if (industries.length <= 1) return;

  const cycle = async () => {
    if (swapping) return;
    swapping = true;

    const outgoing = industries[index]!;
    const incoming = industries[(index + 1) % industries.length]!;
    const outgoingWidth = labelWidth(outgoing);
    const incomingWidth = labelWidth(incoming);

    if (reducedMotion) {
      index = (index + 1) % industries.length;
      resetLayers(incoming);
      setViewportWidth(incomingWidth);
      swapping = false;
      schedule();
      return;
    }

    current.textContent = outgoing;
    current.hidden = false;
    next.textContent = incoming;
    next.hidden = true;
    setViewportWidth(outgoingWidth);

    // Step 1 — wipe out at the outgoing word width.
    wipe.style.transform = `translate3d(${-outgoingWidth}px, 0, 0)`;
    await animateTranslate(wipe, -outgoingWidth, 0, WIPE_MS);

    current.textContent = '';
    current.hidden = true;

    // Resize for the incoming word while fully masked.
    setViewportWidth(incomingWidth);
    parkWipe();

    // Step 2 — wipe reveal at the incoming word width.
    next.hidden = false;
    wipe.style.transform = 'translate3d(0px, 0, 0)';
    await animateTranslate(wipe, 0, incomingWidth, WIPE_MS);

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
