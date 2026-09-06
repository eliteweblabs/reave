/**
 * Grand opening confetti — page load + pill click.
 * Respects prefers-reduced-motion. Sized for Mobile Safari (visualViewport).
 */
(function initGrandOpeningConfetti() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__goConfettiBoot) return;
  window.__goConfettiBoot = true;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduceMotion) return;

  let canvas = null;
  let ctx = null;
  let particles = [];
  let raf = 0;
  let viewportBound = false;
  let lastTriggerBurst = 0;

  function themeColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark
      ? ['#fbbf24', '#ffffff', '#d4d4d4', '#60a5fa', '#f472b6', '#34d399']
      : ['#171717', '#404040', '#737373', '#fbbf24', '#ffffff', '#d4d4d4'];
  }

  function viewport() {
    const vv = window.visualViewport;
    return {
      width: Math.max(1, Math.round(vv?.width ?? window.innerWidth)),
      height: Math.max(1, Math.round(vv?.height ?? window.innerHeight)),
      top: vv?.offsetTop ?? 0,
      left: vv?.offsetLeft ?? 0,
    };
  }

  function ensureCanvas() {
    if (canvas?.isConnected) return ctx;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'go-confetti-canvas';
    canvas.style.position = 'fixed';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '10100';
    canvas.style.transform = 'translateZ(0)';
    canvas.style.webkitTransform = 'translateZ(0)';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d', { alpha: true });
    return ctx;
  }

  function resize() {
    if (!ensureCanvas()) return;
    const { width, height, top, left } = viewport();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.top = `${top}px`;
    canvas.style.left = `${left}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  function bindViewport() {
    if (viewportBound) return;
    viewportBound = true;
    window.addEventListener('resize', resize, { passive: true });
    window.visualViewport?.addEventListener('resize', resize, { passive: true });
    window.visualViewport?.addEventListener('scroll', resize, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(resize, 100), {
      passive: true,
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) resize();
    });
  }

  function spawnBurst(x, y, count) {
    if (!ensureCanvas()) return;
    const colors = themeColors();
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 11;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        w: 5 + Math.random() * 7,
        h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.007 + Math.random() * 0.013,
      });
    }
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  function tick() {
    const { width, height } = viewport();
    ctx.clearRect(0, 0, width, height);
    particles = particles.filter((p) => {
      p.vy += 0.28;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.rot += p.vr;
      p.life -= p.decay;
      if (p.life <= 0) return false;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      return true;
    });

    if (particles.length) {
      raf = window.requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  }

  function burstNormalized(nx, ny, count) {
    const { width, height } = viewport();
    spawnBurst(nx * width, ny * height, count);
  }

  function burstFromElement(el, count) {
    const rect = el.getBoundingClientRect();
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
  }

  function welcomeBurst() {
    burstNormalized(0.18, 0.72, 70);
    burstNormalized(0.82, 0.72, 70);
    window.setTimeout(() => burstNormalized(0.5, 0.18, 110), 180);
  }

  function burstFromTrigger(trigger) {
    const now = Date.now();
    if (now - lastTriggerBurst < 280) return;
    lastTriggerBurst = now;
    burstFromElement(trigger, 90);
  }

  function bindTrigger() {
    const trigger = document.getElementById('go-confetti-trigger');
    if (!trigger || trigger.dataset.confettiBound === '1') return;
    trigger.dataset.confettiBound = '1';
    trigger.addEventListener('click', () => burstFromTrigger(trigger));
  }

  function onPageReady() {
    if (!document.body) return;
    requestAnimationFrame(() => {
      resize();
      bindViewport();
      bindTrigger();
      if (document.body.dataset.goConfettiLoaded === '1') return;
      document.body.dataset.goConfettiLoaded = '1';
      window.setTimeout(welcomeBurst, 350);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }

  document.addEventListener('astro:page-load', () => {
    requestAnimationFrame(() => {
      resize();
      bindTrigger();
    });
  });
})();
