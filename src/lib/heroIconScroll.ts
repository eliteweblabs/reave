/**
 * Scroll-linked motion for the homepage hero brand icon.
 */
export function initHeroIconScroll() {
  const hero = document.getElementById('home');
  const iconWrap = document.querySelector<HTMLElement>('[data-hero-icon]');
  if (!hero || !iconWrap || iconWrap.dataset.heroIconBound === '1') return false;
  iconWrap.dataset.heroIconBound = '1';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return true;

  let tick = 0;

  const sync = () => {
    tick = 0;
    const rect = hero.getBoundingClientRect();
    const height = rect.height || window.innerHeight;
    const scrolled = Math.max(0, -rect.top);
    const progress = Math.min(1, scrolled / (height * 0.85));

    const translateY = progress * 48;
    const scale = 1 - progress * 0.18;
    const opacity = 1 - progress * 0.35;

    iconWrap.style.transform = `translate3d(0, ${translateY}px, 0) scale(${scale})`;
    iconWrap.style.opacity = String(opacity);
  };

  const schedule = () => {
    if (tick) return;
    tick = window.requestAnimationFrame(sync);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();

  return true;
}

export function bootHeroIconScroll() {
  initHeroIconScroll();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHeroIconScroll, { once: true });
  } else {
    bootHeroIconScroll();
  }
  document.addEventListener('astro:page-load', bootHeroIconScroll);
}
