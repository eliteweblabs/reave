/**
 * Cursor-following rainbow glow behind the homepage hero icon.
 */
const LERP = 0.1;
const POINTER_GAIN = 0.42;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initHeroIconGlow() {
  const wrap = document.querySelector<HTMLElement>('[data-hero-icon]');
  const glow = wrap?.querySelector<HTMLElement>('[data-hero-icon-glow]');
  if (!wrap || !glow || wrap.dataset.heroIconGlowBound === '1') return false;
  wrap.dataset.heroIconGlowBound = '1';

  if (prefersReducedMotion()) {
    wrap.classList.add('home-hero-icon-wrap--glow-active');
    return true;
  }

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let pointerInside = false;
  let raf = 0;

  const syncGlow = () => {
    currentX += (targetX - currentX) * LERP;
    currentY += (targetY - currentY) * LERP;

    glow.style.setProperty('--glow-x', `${currentX.toFixed(2)}px`);
    glow.style.setProperty('--glow-y', `${currentY.toFixed(2)}px`);
    glow.style.setProperty(
      '--glow-angle',
      `${((Math.atan2(currentY, currentX) * 180) / Math.PI + 90).toFixed(2)}deg`,
    );

    const settled =
      !pointerInside &&
      Math.abs(targetX - currentX) < 0.15 &&
      Math.abs(targetY - currentY) < 0.15;
    if (settled) {
      raf = 0;
      return;
    }

    raf = requestAnimationFrame(syncGlow);
  };

  const setTargetFromPointer = (clientX: number, clientY: number) => {
    const rect = wrap.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    targetX = (clientX - cx) * POINTER_GAIN;
    targetY = (clientY - cy) * POINTER_GAIN;
  };

  const activate = () => {
    pointerInside = true;
    wrap.classList.add('home-hero-icon-wrap--glow-active');
    if (!raf) raf = requestAnimationFrame(syncGlow);
  };

  const deactivate = () => {
    pointerInside = false;
    wrap.classList.remove('home-hero-icon-wrap--glow-active');
    wrap.classList.remove('home-hero-icon-wrap--glow-pulse');
    targetX = 0;
    targetY = 0;
  };

  wrap.addEventListener('pointerenter', (event) => {
    activate();
    setTargetFromPointer(event.clientX, event.clientY);
  });

  wrap.addEventListener('pointermove', (event) => {
    if (!pointerInside) activate();
    setTargetFromPointer(event.clientX, event.clientY);
  });

  wrap.addEventListener('pointerleave', deactivate);

  wrap.addEventListener(
    'pointerdown',
    (event) => {
      activate();
      setTargetFromPointer(event.clientX, event.clientY);
      wrap.classList.add('home-hero-icon-wrap--glow-pulse');
    },
    { passive: true },
  );

  wrap.addEventListener(
    'pointerup',
    () => {
      wrap.classList.remove('home-hero-icon-wrap--glow-pulse');
    },
    { passive: true },
  );

  return true;
}

export function bootHeroIconGlow() {
  initHeroIconGlow();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHeroIconGlow, { once: true });
  } else {
    bootHeroIconGlow();
  }
  document.addEventListener('astro:page-load', bootHeroIconGlow);
}
