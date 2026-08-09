/**
 * Proximity-aware tooltips for [data-tooltip] triggers.
 *
 * CSS ::after tips cannot clamp to the viewport or stay near their anchor once
 * content gets wide — this module renders one floating tip, measures it, and
 * places it beside the trigger with viewport padding.
 */
(function () {
  const PAD = 10;
  const GAP = 6;
  const SHOW_DELAY_MS = 80;
  const HIDE_DELAY_MS = 60;

  /** @type {HTMLElement | null} */
  let tipEl = null;
  /** @type {Element | null} */
  let activeTrigger = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let showTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let hideTimer = null;
  let bound = false;

  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = document.createElement('div');
    tipEl.id = 'proximity-tooltip';
    tipEl.className = 'proximity-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function clearTimers() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function tooltipText(trigger) {
    const raw = trigger.getAttribute('data-tooltip') ?? trigger.dataset.tooltip ?? '';
    return String(raw).trim();
  }

  function isPinned(trigger) {
    return trigger.classList.contains('tooltip-open');
  }

  function preferEndAlign(trigger) {
    return trigger.classList.contains('tt-left') || trigger.classList.contains('topbar-deploy-dot');
  }

  /**
   * Place the tip near `trigger`, flipping/shifting so it stays in-viewport and
   * as close to the anchor as possible.
   */
  function positionTip(trigger) {
    const tip = ensureTip();
    const text = tooltipText(trigger);
    if (!text) {
      hideTip();
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isDeploy = trigger.classList.contains('topbar-deploy-dot');
    const maxW = Math.min(isDeploy || text.includes('\n') ? 22 * 16 : 18 * 16, vw - PAD * 2);

    tip.textContent = text;
    tip.classList.toggle('proximity-tooltip--multiline', text.includes('\n'));
    tip.classList.toggle('proximity-tooltip--deploy', isDeploy);
    tip.hidden = false;
    // Measure with the real max-width so wrapping matches final layout.
    tip.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      `max-width:${Math.round(maxW)}px`,
      'visibility:hidden',
      'pointer-events:none',
    ].join(';');

    const triggerRect = trigger.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const width = tipRect.width;
    const height = tipRect.height;

    // Prefer just under the trigger. When the trigger lives in the app header,
    // clear the whole header band so the tip cannot cover logo / search / sleep.
    const header = trigger.closest('.app-header, header');
    const headerBottom = header ? header.getBoundingClientRect().bottom : null;
    let top = triggerRect.bottom + GAP;
    if (headerBottom != null && top < headerBottom + GAP) {
      top = headerBottom + GAP;
    }
    const fitsBelow = top + height <= vh - PAD;
    if (!fitsBelow) {
      const aboveTrigger = triggerRect.top - GAP - height;
      const aboveHeader =
        headerBottom != null ? header.getBoundingClientRect().top - GAP - height : aboveTrigger;
      const above = header ? aboveHeader : aboveTrigger;
      if (above >= PAD) top = above;
    }
    top = Math.max(PAD, Math.min(top, vh - PAD - height));

    // Horizontal: stay near the trigger (end-align for right-edge chrome),
    // then clamp into the viewport instead of spanning unrelated UI.
    let left;
    if (preferEndAlign(trigger)) {
      left = triggerRect.right - width;
    } else {
      left = triggerRect.left + triggerRect.width / 2 - width / 2;
    }
    left = Math.max(PAD, Math.min(left, vw - PAD - width));

    tip.style.cssText = [
      'position:fixed',
      `left:${Math.round(left)}px`,
      `top:${Math.round(top)}px`,
      `max-width:${Math.round(maxW)}px`,
      'visibility:visible',
      'pointer-events:none',
    ].join(';');
    tip.hidden = false;
    activeTrigger = trigger;
  }

  function hideTip() {
    clearTimers();
    if (!tipEl) return;
    tipEl.hidden = true;
    tipEl.textContent = '';
    tipEl.style.visibility = 'hidden';
    activeTrigger = null;
  }

  function showFor(trigger, immediate) {
    if (!(trigger instanceof Element)) return;
    const text = tooltipText(trigger);
    if (!text) {
      hideTip();
      return;
    }
    clearTimers();
    const run = () => positionTip(trigger);
    if (immediate) run();
    else showTimer = setTimeout(run, SHOW_DELAY_MS);
  }

  function scheduleHide(trigger) {
    if (trigger && isPinned(trigger)) return;
    clearTimers();
    hideTimer = setTimeout(() => {
      if (activeTrigger && isPinned(activeTrigger)) return;
      hideTip();
    }, HIDE_DELAY_MS);
  }

  function syncPinned() {
    const pinned = document.querySelector('[data-tooltip].tooltip-open');
    if (pinned instanceof Element && tooltipText(pinned)) {
      showFor(pinned, true);
      return;
    }
    if (activeTrigger && !isPinned(activeTrigger)) {
      // Keep hover tip if the pointer is still over it; otherwise hide.
      if (activeTrigger.matches(':hover') || activeTrigger === document.activeElement) return;
      hideTip();
    }
  }

  function onScrollOrResize() {
    if (activeTrigger && !tipEl?.hidden) positionTip(activeTrigger);
  }

  function closestTrigger(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('[data-tooltip]');
  }

  function init() {
    if (bound) return;
    bound = true;
    ensureTip();

    document.addEventListener(
      'pointerover',
      (ev) => {
        const trigger = closestTrigger(ev.target);
        if (!trigger || !tooltipText(trigger)) return;
        showFor(trigger, false);
      },
      true,
    );

    document.addEventListener(
      'pointerout',
      (ev) => {
        const trigger = closestTrigger(ev.target);
        if (!trigger) return;
        const related = ev.relatedTarget;
        if (related instanceof Node && trigger.contains(related)) return;
        scheduleHide(trigger);
      },
      true,
    );

    document.addEventListener(
      'focusin',
      (ev) => {
        const trigger = closestTrigger(ev.target);
        if (!trigger || !tooltipText(trigger)) return;
        showFor(trigger, true);
      },
      true,
    );

    document.addEventListener(
      'focusout',
      (ev) => {
        const trigger = closestTrigger(ev.target);
        if (!trigger) return;
        scheduleHide(trigger);
      },
      true,
    );

    // Click-toggle tips (deploy bulb) flip `.tooltip-open` with stopPropagation —
    // sync after the toggle in the next frame.
    document.addEventListener(
      'click',
      () => {
        requestAnimationFrame(syncPinned);
      },
      true,
    );

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') hideTip();
    });

    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    window.visualViewport?.addEventListener('resize', onScrollOrResize);
    window.visualViewport?.addEventListener('scroll', onScrollOrResize);
  }

  window.ProximityTooltip = {
    init,
    show: (el) => showFor(el, true),
    hide: hideTip,
    sync: syncPinned,
    reposition: () => {
      if (activeTrigger) positionTip(activeTrigger);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
