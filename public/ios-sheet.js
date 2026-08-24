/**
 * iOS-style bottom sheet controller for the PWA.
 * Usage: data-ios-sheet-open="sheet-id" on triggers; IosSheet.open('sheet-id') from JS.
 *
 * Mobile Safari: overflow:hidden on html does not stop background scroll, and
 * focusing an input pans position:fixed overlays with the visual viewport so
 * the sheet jumps off the keyboard. Lock body with position:fixed, and while
 * the keyboard is open pin the backdrop to visualViewport.
 */
(function () {
  const LOCK_CLASS = 'ios-sheet-locked';
  const VISIBLE_CLASS = 'ios-sheet--visible';
  const OPEN_CLASS = 'open';
  const KEYBOARD_CLASS = 'ios-sheet-keyboard';
  /** URL bar deltas are ~40–100px; keyboards are much larger. */
  const KEYBOARD_MIN_PX = 140;

  /** @type {Map<string, () => void>} */
  const closeHandlers = new Map();

  let lockedScrollY = 0;
  let keyboardRaf = 0;
  let keyboardBound = false;
  let touchMoveBound = false;

  function lockScroll() {
    if (!document.documentElement.classList.contains(LOCK_CLASS)) {
      lockedScrollY = window.scrollY || window.pageYOffset || 0;
      document.documentElement.classList.add(LOCK_CLASS);
      const body = document.body;
      body.style.position = 'fixed';
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }
    bindTouchMoveLock();
    bindKeyboardLayout();
  }

  function unlockScroll() {
    if (document.querySelector('.ios-sheet-backdrop.' + OPEN_CLASS)) return;
    document.documentElement.classList.remove(LOCK_CLASS);
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    window.scrollTo(0, lockedScrollY);
    releaseKeyboardLayout();
  }

  function bindTouchMoveLock() {
    if (touchMoveBound) return;
    touchMoveBound = true;
    document.addEventListener('touchmove', onLockTouchMove, { passive: false });
  }

  function onLockTouchMove(ev) {
    if (!document.documentElement.classList.contains(LOCK_CLASS)) return;
    const target = ev.target;
    if (target instanceof Element && target.closest('.ios-sheet')) return;
    ev.preventDefault();
  }

  function keyboardInset() {
    const vv = window.visualViewport;
    if (!vv) return 0;
    // Height of the layout viewport the visual viewport no longer covers.
    // Do not subtract offsetTop: iOS often scrolls the visual viewport when a
    // field is focused so offsetTop + height ≈ innerHeight, which hid the
    // keyboard from the previous formula while the keys still covered the sheet.
    return Math.max(0, Math.round(window.innerHeight - vv.height));
  }

  function clearBackdropPin(el) {
    el.classList.remove(KEYBOARD_CLASS);
    el.style.top = '';
    el.style.left = '';
    el.style.width = '';
    el.style.height = '';
    el.style.bottom = '';
    el.style.right = '';
  }

  function pinBackdropToVisualViewport(el) {
    const vv = window.visualViewport;
    if (!vv) return;
    el.classList.add(KEYBOARD_CLASS);
    el.style.top = `${vv.offsetTop}px`;
    el.style.left = `${vv.offsetLeft}px`;
    el.style.width = `${vv.width}px`;
    el.style.height = `${vv.height}px`;
    el.style.bottom = 'auto';
    el.style.right = 'auto';
  }

  function scrollActiveFieldInSheet() {
    const active = document.activeElement;
    if (
      !(active instanceof HTMLInputElement) &&
      !(active instanceof HTMLTextAreaElement) &&
      !(active instanceof HTMLSelectElement)
    ) {
      return;
    }
    const sheet = active.closest('.ios-sheet');
    if (!sheet) return;

    // Chat sheets scroll the transcript, not the body (overflow:hidden).
    // Keep the latest turn in view so the composer stays docked above the keys.
    const messages = sheet.querySelector('.aw-messages');
    if (messages instanceof HTMLElement) {
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const body = active.closest('.ios-sheet-body');
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    const fieldRect = active.getBoundingClientRect();
    const margin = 12;
    if (fieldRect.bottom > bodyRect.bottom - margin || fieldRect.top < bodyRect.top + margin) {
      body.scrollTop += fieldRect.top - bodyRect.top - margin;
    }
  }

  function syncKeyboardLayout() {
    const openBackdrops = document.querySelectorAll('.ios-sheet-backdrop.' + OPEN_CLASS);
    if (!openBackdrops.length) {
      document.documentElement.style.removeProperty('--ios-sheet-keyboard-inset');
      return;
    }

    const inset = keyboardInset();
    const keyboardOpen = inset >= KEYBOARD_MIN_PX;
    if (keyboardOpen) {
      document.documentElement.style.setProperty('--ios-sheet-keyboard-inset', `${inset}px`);
    } else {
      document.documentElement.style.removeProperty('--ios-sheet-keyboard-inset');
    }

    openBackdrops.forEach((el) => {
      if (keyboardOpen) pinBackdropToVisualViewport(el);
      else clearBackdropPin(el);
    });

    if (keyboardOpen) scrollActiveFieldInSheet();

    if (document.documentElement.classList.contains(LOCK_CLASS) && window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  }

  function scheduleKeyboardLayout() {
    if (keyboardRaf) return;
    keyboardRaf = window.requestAnimationFrame(() => {
      keyboardRaf = 0;
      syncKeyboardLayout();
    });
  }

  function bindKeyboardLayout() {
    if (keyboardBound) {
      scheduleKeyboardLayout();
      return;
    }
    keyboardBound = true;
    document.addEventListener('focusin', scheduleKeyboardLayout, true);
    document.addEventListener('focusout', scheduleKeyboardLayout, true);
    window.visualViewport?.addEventListener('resize', scheduleKeyboardLayout, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduleKeyboardLayout, { passive: true });
    window.addEventListener('resize', scheduleKeyboardLayout, { passive: true });
    scheduleKeyboardLayout();
  }

  function releaseKeyboardLayout() {
    document.querySelectorAll('.ios-sheet-backdrop').forEach(clearBackdropPin);
    document.documentElement.style.removeProperty('--ios-sheet-keyboard-inset');
    if (!keyboardBound) return;
    keyboardBound = false;
    document.removeEventListener('focusin', scheduleKeyboardLayout, true);
    document.removeEventListener('focusout', scheduleKeyboardLayout, true);
    window.visualViewport?.removeEventListener('resize', scheduleKeyboardLayout);
    window.visualViewport?.removeEventListener('scroll', scheduleKeyboardLayout);
    window.removeEventListener('resize', scheduleKeyboardLayout);
  }

  /**
   * @param {string | HTMLElement} target
   * @param {{ onClose?: () => void }} [opts]
   */
  function open(target, opts) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;

    if (opts?.onClose) closeHandlers.set(el.id, opts.onClose);

    if (!el.classList.contains(OPEN_CLASS)) {
      el.classList.add(OPEN_CLASS);
      el.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        el.querySelector('.ios-sheet')?.classList.add(VISIBLE_CLASS);
      });
    }
    lockScroll();
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
    clearBackdropPin(el);
    unlockScroll();

    const handler = closeHandlers.get(el.id);
    if (handler) {
      closeHandlers.delete(el.id);
      handler();
    }

    el.dispatchEvent(new CustomEvent('ios-sheet-close', { bubbles: true }));
  }

  function isDismissible(backdrop) {
    return backdrop?.dataset?.sheetDismiss !== 'false';
  }

  function closeAll() {
    document.querySelectorAll('.ios-sheet-backdrop.' + OPEN_CLASS).forEach((backdrop) => {
      if (!isDismissible(backdrop)) return;
      close(/** @type {HTMLElement} */ (backdrop));
    });
  }

  function bindDragDismiss(backdrop) {
    const sheet = backdrop.querySelector('.ios-sheet');
    if (!sheet || backdrop.dataset.dragBound === '1') return;
    // Required sheets (e.g. Clerk on protected pages) cannot swipe away.
    if (!isDismissible(backdrop)) return;
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
    if (backdrop.classList.contains(OPEN_CLASS)) lockScroll();
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
      if (backdrop?.id && isDismissible(backdrop)) close(backdrop.id);
      return;
    }

    const backdrop = ev.target.closest('.ios-sheet-backdrop');
    if (backdrop && ev.target === backdrop && isDismissible(backdrop)) {
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

  window.IosSheet = {
    open,
    close,
    closeAll,
    whenReady(fn) {
      if (typeof fn !== 'function') return;
      const ready = () => Boolean(window.IosSheet?.open);
      if (ready()) {
        fn();
        return;
      }
      const poll = () => {
        if (ready()) {
          fn();
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    },
  };
})();
