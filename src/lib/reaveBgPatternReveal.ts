const DEFAULT_REVEAL_WINDOW_MS = 5000;
const DEFAULT_FADE_MS = 250;
/** Once this fraction of paths are visible, swap one out for each new reveal. */
const VISIBLE_THRESHOLD_RATIO = 0.75;

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

function setPathVisible(path: SVGPathElement, visible: boolean, fadeMs: number): void {
  path.classList.remove('reave-bg-pattern__path--in', 'reave-bg-pattern__path--out');
  path.style.opacity = visible ? '1' : '0';
  path.style.transition = '';
  path.style.transitionDelay = '';

  if (prefersReducedMotion()) return;

  path.style.setProperty('--reave-fade-ms', `${fadeMs}ms`);
  path.classList.add(visible ? 'reave-bg-pattern__path--in' : 'reave-bg-pattern__path--out');
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

    const fadeMs = readMs(wrap.dataset.revealFadeMs, DEFAULT_FADE_MS);
    wrap.style.setProperty('--reave-fade-ms', `${fadeMs}ms`);

    if (prefersReducedMotion()) {
      paths.forEach((path) => {
        path.style.opacity = '1';
      });
      return;
    }

    const windowMs = readMs(wrap.dataset.revealWindowMs, DEFAULT_REVEAL_WINDOW_MS);
    const intervalMs = windowMs / paths.length;
    const threshold = Math.max(1, Math.round(paths.length * VISIBLE_THRESHOLD_RATIO));
    const order = shuffle(paths);
    const visibleQueue: SVGPathElement[] = [];
    let step = 0;

    paths.forEach((path) => {
      path.style.opacity = '0';
    });

    const tick = () => {
      const pathToReveal = order[step % order.length];
      setPathVisible(pathToReveal, true, fadeMs);
      visibleQueue.push(pathToReveal);

      if (step >= threshold) {
        const toHide = visibleQueue.shift();
        if (toHide) {
          setPathVisible(toHide, false, fadeMs);
        }
      }

      step += 1;
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tick();
        window.setInterval(tick, intervalMs);
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
