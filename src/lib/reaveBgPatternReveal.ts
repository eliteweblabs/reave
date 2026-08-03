const DEFAULT_REVEAL_WINDOW_MS = 5000;
const DEFAULT_FADE_MS = 250;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
    const intervalMs = windowMs / paths.length;
    const order = shuffle(paths);

    order.forEach((path, sequence) => {
      path.style.opacity = '0';
      path.style.transition = `opacity ${fadeMs}ms ease`;
      path.style.transitionDelay = `${sequence * intervalMs}ms`;
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        paths.forEach((path) => {
          path.style.opacity = '1';
        });
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
