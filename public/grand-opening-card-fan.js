/**
 * Grand opening hero card fan — swipe / dots / keyboard. Inline on the page so
 * touch works before deferred Astro module bundles finish loading.
 */
(function initGrandOpeningCardFanGlobal() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function stackCardIndex(originalIndex, activeIndex, n) {
    const relative = (originalIndex - activeIndex + n) % n;
    return n - 1 - relative;
  }

  function cardSpreadOffset(originalIndex, activeIndex, n) {
    let relative = (originalIndex - activeIndex + n) % n;
    if (relative > n / 2) relative -= n;
    return relative;
  }

  function bindFan(fan) {
    if (fan.dataset.ready === '1') return;
    fan.dataset.ready = '1';

    const stack = fan.querySelector('.go-card-fan__stack');
    const cardEls = [...fan.querySelectorAll('.go-card-fan__card')];
    const dots = [...fan.querySelectorAll('.go-card-fan__dot')];
    const count = Number(fan.dataset.cardCount || cardEls.length) || cardEls.length;
    if (!stack || !cardEls.length) return;

    let activeIndex = 0;
    let startX = 0;
    let startY = 0;
    let trackingPointerId = null;

    function applyActive(nextIndex) {
      activeIndex = ((nextIndex % count) + count) % count;

      cardEls.forEach((card) => {
        const index = Number(card.dataset.cardIndex ?? 0);
        const isFront = index === activeIndex;
        card.classList.toggle('is-front', isFront);
        card.style.setProperty('--card-i', String(stackCardIndex(index, activeIndex, count)));
        card.style.setProperty('--card-offset', String(cardSpreadOffset(index, activeIndex, count)));

        const img = card.querySelector('img');
        const alt = card.dataset.alt || '';
        if (img) {
          if (isFront) {
            img.removeAttribute('aria-hidden');
            img.alt = alt;
          } else {
            img.setAttribute('aria-hidden', 'true');
            img.alt = '';
          }
        }
      });

      dots.forEach((dot, i) => {
        const on = i === activeIndex;
        dot.setAttribute('aria-selected', on ? 'true' : 'false');
        dot.classList.toggle('is-active', on);
      });

      fan.dataset.activeIndex = String(activeIndex);
    }

    function finishSwipe(clientX, clientY) {
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (Math.abs(dx) < 32 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      applyActive(activeIndex + (dx < 0 ? 1 : -1));
    }

    function onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (trackingPointerId != null) return;
      trackingPointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
    }

    function onPointerUp(event) {
      if (event.pointerId !== trackingPointerId) return;
      trackingPointerId = null;
      finishSwipe(event.clientX, event.clientY);
    }

    function clearPointerTracking(event) {
      if (event.pointerId === trackingPointerId) trackingPointerId = null;
    }

    stack.addEventListener('pointerdown', onPointerDown, { passive: true });
    stack.addEventListener('pointerup', onPointerUp, { passive: true });
    stack.addEventListener('pointercancel', clearPointerTracking, { passive: true });

    stack.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        applyActive(activeIndex + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        applyActive(activeIndex - 1);
      }
    });

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        applyActive(Number(dot.dataset.slideTo ?? 0));
      });
    });

    applyActive(0);
  }

  function initGrandOpeningCardFans() {
    document.querySelectorAll('.go-card-fan').forEach(bindFan);
  }

  initGrandOpeningCardFans();
  document.addEventListener('astro:page-load', initGrandOpeningCardFans);
})();
