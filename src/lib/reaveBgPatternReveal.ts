const DEFAULT_SWAP_MS = 150;
const DEFAULT_FADE_MS = 250;
const DEFAULT_BOOTSTRAP_RATIO = 0.66;
const DEFAULT_BOOTSTRAP_MS = 1500;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readRatio(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
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

    const bootstrapRatio = readRatio(wrap.dataset.revealBootstrapRatio, DEFAULT_BOOTSTRAP_RATIO);
    const bootstrapMs = readMs(wrap.dataset.revealBootstrapMs, DEFAULT_BOOTSTRAP_MS);
    const swapMs = readMs(wrap.dataset.revealSwapMs, DEFAULT_SWAP_MS);

    const targetVisible = Math.max(1, Math.round(paths.length * bootstrapRatio));
    const order = shuffle(paths);
    const visibleQueue: SVGPathElement[] = [];
    let bootstrapIndex = 0;
    let steadyStep = 0;
    let timerId = 0;

    paths.forEach((path) => {
      path.style.opacity = '0';
    });

    const bootstrapTick = () => {
      if (bootstrapIndex >= targetVisible) {
        window.clearInterval(timerId);
        timerId = window.setInterval(steadyTick, swapMs);
        return;
      }

      const pathToReveal = order[bootstrapIndex];
      setPathVisible(pathToReveal, true, fadeMs);
      visibleQueue.push(pathToReveal);
      bootstrapIndex += 1;
    };

    const steadyTick = () => {
      const pathToReveal = order[steadyStep % order.length];
      setPathVisible(pathToReveal, true, fadeMs);

      const toHide = visibleQueue.shift();
      if (toHide) {
        setPathVisible(toHide, false, fadeMs);
      }

      visibleQueue.push(pathToReveal);
      steadyStep += 1;
    };

    const bootstrapIntervalMs = bootstrapMs / targetVisible;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bootstrapTick();
        timerId = window.setInterval(bootstrapTick, bootstrapIntervalMs);
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
