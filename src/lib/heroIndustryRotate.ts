/**
 * Cycles hero tagline industry labels (from admin → Industries).
 */
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
  if (industries.length <= 1) return;

  const textEl = root.querySelector<HTMLElement>('[data-hero-industry-text]');
  if (!textEl) return;

  const intervalMs = Number(root.dataset.intervalMs) || 2800;
  let index = industries.indexOf(textEl.textContent?.trim() ?? '');
  if (index < 0) index = 0;

  let timer: ReturnType<typeof setInterval> | null = null;
  let swapping = false;

  const swap = () => {
    if (swapping) return;
    swapping = true;
    root.classList.add('is-swapping');

    window.setTimeout(() => {
      index = (index + 1) % industries.length;
      textEl.textContent = industries[index]!;
      textEl.style.transform = 'translateY(110%)';
      textEl.style.opacity = '0';
      root.classList.remove('is-swapping');

      requestAnimationFrame(() => {
        textEl.style.transform = '';
        textEl.style.opacity = '';
      });

      swapping = false;
    }, 320);
  };

  const start = () => {
    if (timer) return;
    timer = setInterval(swap, intervalMs);
  };

  const stop = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  if (document.hidden) stop();
  else start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stop();
  }
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
