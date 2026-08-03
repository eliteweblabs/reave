const DEFAULT_REVEAL_WINDOW_MS = 2500;
const DEFAULT_FADE_MS = 500;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function initReaveBgPatternReveal(root: ParentNode = document): number {
  const patterns = root.querySelectorAll<HTMLElement>('.reave-bg-pattern[data-reveal="true"]');
  let started = 0;

  patterns.forEach((wrap) => {
    if (wrap.dataset.reaveBgPatternRevealBound === '1') return;
    wrap.dataset.reaveBgPatternRevealBound = '1';

    const svg = wrap.querySelector('.reave-bg-pattern__svg');
    if (!svg) return;

    const paths = [...svg.querySelectorAll<SVGPathElement>('path')];
    if (paths.length === 0) return;

    started += 1;

    if (prefersReducedMotion()) {
      paths.forEach((path) => {
        path.style.opacity = '1';
      });
      return;
    }

    const fadeMs = readMs(wrap.dataset.revealFadeMs, DEFAULT_FADE_MS);
    const windowMs = readMs(wrap.dataset.revealWindowMs, DEFAULT_REVEAL_WINDOW_MS);
    const maxDelay = Math.max(0, windowMs - fadeMs);

    paths.forEach((path) => {
      path.style.opacity = '0';
      path.style.transition = `opacity ${fadeMs}ms ease-in`;
      path.style.transitionDelay = `${Math.random() * maxDelay}ms`;
    });

    // Commit the hidden state before triggering fade-in so transitions actually run.
    void wrap.getBoundingClientRect();

    requestAnimationFrame(() => {
      paths.forEach((path) => {
        path.style.opacity = '1';
      });
    });
  });

  return started;
}

export function bootReaveBgPatternReveal() {
  initReaveBgPatternReveal();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootReaveBgPatternReveal, { once: true });
  } else {
    bootReaveBgPatternReveal();
  }
  document.addEventListener('astro:page-load', bootReaveBgPatternReveal);
}
