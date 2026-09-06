/**
 * Grand opening confetti — page load + pill click.
 * Respects prefers-reduced-motion.
 */
(function initGrandOpeningConfetti() {
  if (window.__goConfettiReady) return;
  window.__goConfettiReady = true;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduceMotion) return;

  const COLORS = ['#171717', '#404040', '#737373', '#fbbf24', '#ffffff', '#d4d4d4'];

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'go-confetti-canvas';
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let particles = [];
  let raf = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  function spawnBurst(x, y, count) {
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
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
        decay: 0.007 + Math.random() * 0.013,
      });
    }
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
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
    spawnBurst(nx * window.innerWidth, ny * window.innerHeight, count);
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

  function bindTrigger() {
    const trigger = document.getElementById('go-confetti-trigger');
    if (!trigger || trigger.dataset.confettiBound === '1') return;
    trigger.dataset.confettiBound = '1';
    trigger.addEventListener('click', () => {
      burstFromElement(trigger, 90);
    });
  }

  function onPageReady() {
    bindTrigger();
    if (document.body.dataset.goConfettiLoaded === '1') return;
    document.body.dataset.goConfettiLoaded = '1';
    window.setTimeout(welcomeBurst, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }

  document.addEventListener('astro:page-load', () => {
    bindTrigger();
  });
})();
