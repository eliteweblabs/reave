/**
 * iOS-style bottom sheet controller for the PWA.
 * Usage: data-ios-sheet-open="sheet-id" on triggers; IosSheet.open('sheet-id') from JS.
 */
(function () {
  const LOCK_CLASS = 'ios-sheet-locked';
  const VISIBLE_CLASS = 'ios-sheet--visible';
  const OPEN_CLASS = 'open';

  /** @type {Map<string, () => void>} */
  const closeHandlers = new Map();

  function lockScroll() {
    document.documentElement.classList.add(LOCK_CLASS);
  }

  function unlockScroll() {
    if (!document.querySelector('.ios-sheet-backdrop.' + OPEN_CLASS)) {
      document.documentElement.classList.remove(LOCK_CLASS);
    }
  }

  /**
   * @param {string | HTMLElement} target
   * @param {{ onClose?: () => void }} [opts]
   */
  function open(target, opts) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el || el.classList.contains(OPEN_CLASS)) return;

    if (opts?.onClose) closeHandlers.set(el.id, opts.onClose);

    el.classList.add(OPEN_CLASS);
    el.setAttribute('aria-hidden', 'false');
    lockScroll();

    requestAnimationFrame(() => {
      el.querySelector('.ios-sheet')?.classList.add(VISIBLE_CLASS);
    });
  }

  /**
   * @param {string | HTMLElement} [target]
   */
  function close(target) {
    const el =
      typeof target === 'string'
        ? document.getElementById(target)
        : target instanceof HTMLElement
          ? target
          : document.querySelector('.ios-sheet-backdrop.' + OPEN_CLASS);

    if (!el) return;

    const sheet = el.querySelector('.ios-sheet');
    if (sheet) {
      sheet.style.transform = '';
      sheet.style.transition = '';
    }
    sheet?.classList.remove(VISIBLE_CLASS);
    el.classList.remove(OPEN_CLASS);
    el.setAttribute('aria-hidden', 'true');
    unlockScroll();

    const handler = closeHandlers.get(el.id);
    if (handler) {
      closeHandlers.delete(el.id);
      handler();
    }

    el.dispatchEvent(new CustomEvent('ios-sheet-close', { bubbles: true }));
  }

  function closeAll() {
    document.querySelectorAll('.ios-sheet-backdrop.' + OPEN_CLASS).forEach((backdrop) => {
      close(/** @type {HTMLElement} */ (backdrop));
    });
  }

  function bindDragDismiss(backdrop) {
    const sheet = backdrop.querySelector('.ios-sheet');
    if (!sheet || backdrop.dataset.dragBound === '1') return;
    backdrop.dataset.dragBound = '1';

    const body = sheet.querySelector('.ios-sheet-body');
    const header = sheet.querySelector('.ios-sheet-header');
    const grabber = sheet.querySelector('.ios-sheet-grabber');

    let startY = 0;
    let currentY = 0;
    let dragging = false;
    /** @type {'chrome' | 'body' | null} */
    let dragMode = null;
    /** @type {HTMLElement | null} */
    let scrollRoot = null;

    function resetDrag() {
      dragging = false;
      currentY = 0;
      dragMode = null;
      scrollRoot = null;
      sheet.style.transition = '';
      sheet.style.transform = '';
    }

    function isInteractiveTarget(el) {
      return !!el?.closest?.('button, a, input, textarea, select, label');
    }

    function findScrollContainer(target, root) {
      let el = target instanceof Element ? target : null;
      while (el && el !== root) {
        if (el.scrollHeight > el.clientHeight + 1) {
          const oy = getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return el;
        }
        el = el.parentElement;
      }
      return root;
    }

    function isChromeTarget(target) {
      if (!(target instanceof Element)) return false;
      if (grabber && (target === grabber || grabber.contains(target))) return true;
      if (header && (target === header || header.contains(target))) {
        return !isInteractiveTarget(target);
      }
      return false;
    }

    function beginDrag(clientY, mode) {
      startY = clientY;
      currentY = 0;
      dragging = true;
      dragMode = mode;
      sheet.style.transition = 'none';
    }

    sheet.addEventListener(
      'touchstart',
      (ev) => {
        if (!backdrop.classList.contains(OPEN_CLASS)) return;
        const touch = ev.touches[0];
        if (!touch) return;

        if (isChromeTarget(ev.target)) {
          beginDrag(touch.clientY, 'chrome');
          return;
        }

        if (body && body.contains(ev.target) && !isInteractiveTarget(ev.target)) {
          scrollRoot = findScrollContainer(ev.target, body);
          if (scrollRoot.scrollTop <= 0) {
            beginDrag(touch.clientY, 'body');
          }
          return;
        }
      },
      { passive: true },
    );

    sheet.addEventListener(
      'touchmove',
      (ev) => {
        if (!dragging) return;
        const touch = ev.touches[0];
        if (!touch) return;

        const deltaY = touch.clientY - startY;

        if (dragMode === 'body') {
          if (deltaY <= 0) {
            resetDrag();
            return;
          }
          if (scrollRoot) scrollRoot.scrollTop = 0;
          ev.preventDefault();
        }

        currentY = Math.max(0, deltaY);
        sheet.style.transform = `translateY(${currentY}px)`;
      },
      { passive: false },
    );

    sheet.addEventListener(
      'touchend',
      () => {
        if (!dragging) return;
        sheet.style.transition = '';
        if (currentY > 100) {
          close(backdrop.id);
        } else {
          sheet.style.transform = '';
        }
        dragging = false;
        currentY = 0;
        dragMode = null;
      },
      { passive: true },
    );

    sheet.addEventListener('touchcancel', resetDrag, { passive: true });
  }

  function initBackdrop(backdrop) {
    if (!(backdrop instanceof HTMLElement) || backdrop.dataset.sheetBound === '1') return;
    backdrop.dataset.sheetBound = '1';
    bindDragDismiss(backdrop);
  }

  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest('[data-ios-sheet-open]');
    if (trigger) {
      ev.preventDefault();
      const id = trigger.getAttribute('data-ios-sheet-open');
      if (id) open(id);
      return;
    }

    const closeBtn = ev.target.closest('[data-ios-sheet-close]');
    if (closeBtn) {
      const backdrop = closeBtn.closest('.ios-sheet-backdrop');
      if (backdrop?.id) close(backdrop.id);
      return;
    }

    const backdrop = ev.target.closest('.ios-sheet-backdrop');
    if (backdrop && ev.target === backdrop && backdrop.dataset.sheetDismiss !== 'false') {
      close(backdrop.id);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeAll();
  });

  document.querySelectorAll('.ios-sheet-backdrop').forEach(initBackdrop);

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.classList?.contains('ios-sheet-backdrop')) initBackdrop(node);
        node.querySelectorAll?.('.ios-sheet-backdrop').forEach(initBackdrop);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.IosSheet = { open, close, closeAll };
})();
