/**
 * Hero industry tagline — two-step wipe: erase left→right, then reveal next left→right.
 * Text layers stay fixed; clip-path hides/reveals each word (overlay wipes fail on iOS
 * Safari because -webkit-background-clip:text paints above sibling z-index layers).
 * Viewport width matches each word and is eased from the outgoing to the incoming width
 * while both layers are blank, so the centered tagline glides instead of snapping.
 */

const WIPE_MS = 520;
const WIDTH_MS = 260;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animate(durationMs: number, onFrame: (eased: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      onFrame(easeInOutCubic(t));

      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };

    requestAnimationFrame(frame);
  });
}

function measureText(layer: HTMLElement, text: string): number {
  const wasHidden = layer.hidden;
  if (wasHidden) layer.hidden = false;
  layer.textContent = text;
  // Fractional width: rounding to offsetWidth leaves a visible 1px hop mid-wipe.
  const width = layer.getBoundingClientRect().width;
  if (wasHidden) layer.hidden = true;
  return width;
}

function setClip(el: HTMLElement, leftPct: number, rightPct: number) {
  const clip = `inset(0 ${rightPct}% 0 ${leftPct}%)`;
  el.style.clipPath = clip;
  el.style.webkitClipPath = clip;
}

function clearClip(el: HTMLElement) {
  el.style.clipPath = '';
  el.style.webkitClipPath = '';
}

/** Erase left→right: the leading edge cuts in from the left until nothing is left. */
function animateWipeOut(el: HTMLElement, durationMs: number): Promise<void> {
  return animate(durationMs, (eased) => setClip(el, eased * 100, 0));
}

/** Reveal left→right: the trailing edge retreats to the right, uncovering the word. */
function animateWipeIn(el: HTMLElement, durationMs: number): Promise<void> {
  return animate(durationMs, (eased) => setClip(el, 0, (1 - eased) * 100));
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

  const setViewportWidth = (widthPx: number) => {
    viewport.style.width = `${widthPx}px`;
  };

  const animateViewportWidth = (fromPx: number, toPx: number): Promise<void> => {
    if (Math.abs(toPx - fromPx) < 0.5) return Promise.resolve();
    return animate(WIDTH_MS, (eased) => {
      setViewportWidth(fromPx + (toPx - fromPx) * eased);
    });
  };

  const resetLayers = (label: string, widthPx?: number) => {
    current.textContent = label;
    current.hidden = false;
    next.textContent = '';
    next.hidden = true;
    clearClip(current);
    clearClip(next);
    root.dataset.heroIndustryLabel = label;
    if (widthPx != null) setViewportWidth(widthPx);
  };

  const initialLabel = industries[index]!;
  resetLayers(initialLabel, labelWidth(initialLabel));
  // The server-rendered min-width only reserves space pre-hydration; leaving it in
  // place would clamp the measured widths for shorter labels.
  viewport.style.minWidth = '0px';

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
    setViewportWidth(outgoingWidth);

    // Step 1 — wipe out at the outgoing word width.
    clearClip(current);
    await animateWipeOut(current, WIPE_MS);

    current.textContent = '';
    current.hidden = true;
    clearClip(current);

    // Step 2 — resize while both layers are blank, so the words on either side
    // of the viewport glide to their new centered position instead of snapping.
    await animateViewportWidth(outgoingWidth, incomingWidth);

    // Step 3 — wipe reveal, travelling the same direction as the erase.
    next.hidden = false;
    setClip(next, 0, 100);
    await animateWipeIn(next, WIPE_MS);

    index = (index + 1) % industries.length;
    resetLayers(incoming, incomingWidth);
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

  // The tagline font-size is viewport-relative, so the pinned pixel width goes
  // stale on resize.
  window.addEventListener('resize', () => {
    if (swapping) return;
    const label = root.dataset.heroIndustryLabel;
    if (label) setViewportWidth(labelWidth(label));
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
