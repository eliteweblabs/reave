/**
 * Hero industry tagline — two-step wipe: erase left→right, then reveal next left→right.
 * Text layers stay fixed; clip-path hides/reveals each word (overlay wipes fail on iOS
 * Safari because -webkit-background-clip:text paints above sibling z-index layers).
 * Viewport width matches each word; it resizes under the mask between wipe steps,
 * then CSS transitions width afterward so the tagline recenters smoothly.
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

function setClipInsetLeft(el: HTMLElement, leftPct: number) {
  const clip = `inset(0 0 0 ${leftPct}%)`;
  el.style.clipPath = clip;
  el.style.webkitClipPath = clip;
}

function clearClip(el: HTMLElement) {
  el.style.clipPath = '';
  el.style.webkitClipPath = '';
}

/** Animate clip-path inset from left (0 = fully visible, 100 = fully hidden). */
function animateClipInsetLeft(
  el: HTMLElement,
  fromLeftPct: number,
  toLeftPct: number,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const left = fromLeftPct + (toLeftPct - fromLeftPct) * easeInOutCubic(t);
      setClipInsetLeft(el, left);

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
  if (!viewport || !current || !next) return;

  const intervalMs = Number(root.dataset.intervalMs) || 2500;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const labelWidth = (label: string) => measureText(current, label);

  const initial = current.textContent?.trim() ?? '';
  const found = industries.indexOf(initial);
  let index = found >= 0 ? found : Math.floor(Math.random() * industries.length);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let swapping = false;

  const setViewportWidth = (widthPx: number, instant = false) => {
    if (instant) viewport.classList.add('is-wiping');
    viewport.style.width = `${widthPx}px`;
    if (instant) void viewport.offsetWidth;
  };

  const recenterViewport = (widthPx: number) => {
    viewport.classList.remove('is-wiping');
    void viewport.offsetWidth;
    viewport.style.width = `${widthPx}px`;
  };

  const resetLayers = (label: string, widthPx?: number) => {
    current.textContent = label;
    current.hidden = false;
    next.textContent = '';
    next.hidden = true;
    clearClip(current);
    clearClip(next);
    root.dataset.heroIndustryLabel = label;
    if (widthPx != null) setViewportWidth(widthPx, true);
  };

  const initialLabel = industries[index]!;
  const initialWidth = labelWidth(initialLabel);
  resetLayers(initialLabel, initialWidth);
  viewport.classList.remove('is-wiping');

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
      resetLayers(incoming, incomingWidth);
      swapping = false;
      schedule();
      return;
    }

    current.textContent = outgoing;
    current.hidden = false;
    next.textContent = incoming;
    next.hidden = true;
    setViewportWidth(outgoingWidth, true);

    // Step 1 — wipe out at the outgoing word width.
    clearClip(current);
    await animateClipInsetLeft(current, 0, 100, WIPE_MS);

    current.textContent = '';
    current.hidden = true;
    clearClip(current);

    // Widen under the mask only when the incoming word is longer.
    if (incomingWidth > outgoingWidth) {
      setViewportWidth(incomingWidth, true);
    }

    // Step 2 — wipe reveal.
    next.hidden = false;
    setClipInsetLeft(next, 100);
    await animateClipInsetLeft(next, 100, 0, WIPE_MS);

    index = (index + 1) % industries.length;
    resetLayers(incoming);

    // Ease to the incoming word width so the tagline recenters after reveal.
    if (incomingWidth < outgoingWidth) {
      recenterViewport(incomingWidth);
    } else {
      viewport.classList.remove('is-wiping');
    }
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
