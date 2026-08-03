/**
 * Hero industry tagline — two-step wipe: erase left→right, then reveal next left→right.
 * Clipping runs on overflow-hidden wrappers, not on gradient text — clip-path and overlay
 * wipes fail on iOS Safari because -webkit-background-clip:text paints in its own layer.
 * Viewport width matches each word and is eased from the outgoing to the incoming width
 * across the reveal, so the centered tagline glides instead of snapping.
 */

const WIPE_MS = 520;

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

function getClip(layer: HTMLElement): HTMLElement | null {
  return layer.querySelector<HTMLElement>('[data-hero-industry-clip]');
}

function getText(layer: HTMLElement): HTMLElement | null {
  return layer.querySelector<HTMLElement>('[data-hero-industry-text]');
}

function measureText(layer: HTMLElement, text: string): number {
  const textEl = getText(layer);
  const clipEl = getClip(layer);
  if (!textEl || !clipEl) return 0;

  const wasHidden = layer.hidden;
  if (wasHidden) layer.hidden = false;
  clipEl.style.width = 'auto';
  textEl.textContent = text;
  // Fractional width: rounding to offsetWidth leaves a visible 1px hop mid-wipe.
  const width = textEl.getBoundingClientRect().width;
  if (wasHidden) layer.hidden = true;
  return width;
}

function setClipWidth(clip: HTMLElement, widthPx: number) {
  clip.style.width = `${widthPx}px`;
}

function clearClipWidth(clip: HTMLElement, fullWidthPx: number) {
  clip.style.width = `${fullWidthPx}px`;
}

/** Erase left→right: shrink the clip rail until nothing is left. */
function animateWipeOut(clip: HTMLElement, fullWidthPx: number, durationMs: number): Promise<void> {
  return animate(durationMs, (eased) => {
    setClipWidth(clip, fullWidthPx * (1 - eased));
  });
}

/** Reveal left→right: grow the clip rail, uncovering the word. */
function animateWipeIn(clip: HTMLElement, fullWidthPx: number, durationMs: number): Promise<void> {
  return animate(durationMs, (eased) => {
    setClipWidth(clip, fullWidthPx * eased);
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
  const currentClip = current ? getClip(current) : null;
  const nextClip = next ? getClip(next) : null;
  const currentText = current ? getText(current) : null;
  if (!viewport || !current || !next || !currentClip || !nextClip || !currentText) return;

  const intervalMs = Number(root.dataset.intervalMs) || 2500;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const labelWidth = (label: string) => measureText(current, label);

  const initial = currentText.textContent?.trim() ?? '';
  const found = industries.indexOf(initial);
  let index = found >= 0 ? found : Math.floor(Math.random() * industries.length);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let swapping = false;

  const setViewportWidth = (widthPx: number) => {
    viewport.style.width = `${widthPx}px`;
  };

  const animateViewportWidth = (
    fromPx: number,
    toPx: number,
    durationMs: number,
  ): Promise<void> => {
    if (Math.abs(toPx - fromPx) < 0.5) return Promise.resolve();
    return animate(durationMs, (eased) => {
      setViewportWidth(fromPx + (toPx - fromPx) * eased);
    });
  };

  const resetLayers = (label: string, widthPx?: number) => {
    const textEl = getText(current);
    if (textEl) textEl.textContent = label;
    current.hidden = false;
    const nextText = getText(next);
    if (nextText) nextText.textContent = '';
    next.hidden = true;
    if (widthPx != null) {
      clearClipWidth(currentClip, widthPx);
      clearClipWidth(nextClip, 0);
    }
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

    const currentTextEl = getText(current);
    const nextTextEl = getText(next);
    if (!currentTextEl || !nextTextEl) {
      swapping = false;
      return;
    }

    currentTextEl.textContent = outgoing;
    current.hidden = false;
    nextTextEl.textContent = incoming;
    next.hidden = true;
    setViewportWidth(outgoingWidth);
    clearClipWidth(currentClip, outgoingWidth);
    clearClipWidth(nextClip, 0);

    // Step 1 — wipe out at the outgoing word width.
    await animateWipeOut(currentClip, outgoingWidth, WIPE_MS);

    currentTextEl.textContent = '';
    current.hidden = true;
    clearClipWidth(currentClip, outgoingWidth);

    // Step 2 — wipe reveal, travelling the same direction as the erase, while the
    // viewport eases to the new width. Sharing one easing curve keeps the box edge
    // at outgoingWidth * (1 - eased) ahead of the wipe front, so the incoming word
    // is never clipped even when it is much longer than the outgoing one.
    next.hidden = false;
    setClipWidth(nextClip, 0);
    await Promise.all([
      animateWipeIn(nextClip, incomingWidth, WIPE_MS),
      animateViewportWidth(outgoingWidth, incomingWidth, WIPE_MS),
    ]);

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
