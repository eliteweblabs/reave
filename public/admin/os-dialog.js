/**
 * Shared iOS-style alert/confirm dialogs for admin panels.
 */

const osDialogDropdownRepositioners = new Set();

/** Schedule-panel dropdowns inside an open dialog register here for keyboard reflow. */
export function registerOsDialogDropdownRepositioner(fn) {
  osDialogDropdownRepositioners.add(fn);
  return () => osDialogDropdownRepositioners.delete(fn);
}

function repositionOpenOsDialogDropdowns() {
  for (const fn of osDialogDropdownRepositioners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function openOsDialogBackdrop() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop) return null;
  if (window.IosSheet) {
    window.IosSheet.open(backdrop);
  } else {
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.querySelector('.ios-sheet')?.classList.add('ios-sheet--visible');
    document.documentElement.classList.add('ios-sheet-locked');
  }
  return backdrop;
}

export function closeOsDialogBackdrop() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('os-dialog-keyboard');
  document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
  if (window.IosSheet) {
    window.IosSheet.close(backdrop);
    return;
  }
  backdrop.querySelector('.ios-sheet')?.classList.remove('ios-sheet--visible');
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.ios-sheet-backdrop.open')) {
    document.documentElement.classList.remove('ios-sheet-locked');
  }
}

export function bindOsDialogDismiss(backdrop, finish, showCancel) {
  const closeBtn = backdrop.querySelector('[data-os-dialog-close]');
  if (closeBtn) {
    closeBtn.hidden = !showCancel;
    if (showCancel) {
      closeBtn.addEventListener('click', () => finish(false), { once: true });
    }
  }
  if (showCancel) {
    backdrop.addEventListener(
      'click',
      function onBackdropClick(ev) {
        if (ev.target === backdrop) {
          backdrop.removeEventListener('click', onBackdropClick);
          finish(false);
        }
      },
      { once: true },
    );
  }
}

function sanitizeDialogHtml(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc
      .querySelectorAll('script, iframe, object, embed, form, base, link, meta, svg')
      .forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (/^on/.test(name)) el.removeAttribute(attr.name);
        if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name)) {
          const v = attr.value.trim().replace(/\s+/g, '').toLowerCase();
          if (
            v.startsWith('javascript:') ||
            v.startsWith('vbscript:') ||
            v.startsWith('data:text/html') ||
            v.startsWith('data:application/')
          ) {
            el.removeAttribute(attr.name);
          }
        }
      }
    });
    return doc.body.innerHTML;
  } catch {
    return '';
  }
}

export function osDialog(opts) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    return Promise.resolve(opts.showCancel ? false : undefined);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (ev) => {
      if (ev.key === 'Escape' && opts.showCancel) finish(false);
    };

    titleEl.textContent = opts.title || '';
    bodyEl.innerHTML = sanitizeDialogHtml(opts.bodyHtml || '');
    actionsEl.innerHTML = '';

    const mkBtn = (label, cls, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', () => finish(value));
      actionsEl.appendChild(btn);
      return btn;
    };

    if (opts.showCancel) {
      mkBtn(opts.cancelLabel || 'Cancel', 'os-dialog-btn--ghost', false);
    }
    const primary = mkBtn(
      opts.confirmLabel || 'OK',
      opts.danger ? 'os-dialog-btn--danger' : 'os-dialog-btn--primary',
      true,
    );

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, !!opts.showCancel);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    primary.focus();
  });
}

let osDialogKeyboardBound = false;
let osDialogKeyboardSync = null;

function scrollOsDialogFieldIntoView(field) {
  if (!(field instanceof HTMLElement)) return;
  const body = document.getElementById('os-dialog-body');
  if (body?.contains(field)) {
    const bodyRect = body.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const margin = 16;
    if (fieldRect.bottom > bodyRect.bottom - margin || fieldRect.top < bodyRect.top + margin) {
      body.scrollTop += fieldRect.top - bodyRect.top - margin;
    }
  }
  field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function syncOsDialogKeyboardLayout() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop?.classList.contains('open')) return;
  const vv = window.visualViewport;
  const active = document.activeElement;
  const inDialog =
    active instanceof HTMLElement &&
    (active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement) &&
    backdrop.contains(active);
  if (!inDialog || !vv) {
    backdrop.classList.remove('os-dialog-keyboard');
    document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
    return;
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  backdrop.classList.add('os-dialog-keyboard');
  document.documentElement.style.setProperty('--os-dialog-keyboard-inset', `${inset}px`);
  const runScroll = () => {
    scrollOsDialogFieldIntoView(active);
    repositionOpenOsDialogDropdowns();
  };
  requestAnimationFrame(runScroll);
  window.setTimeout(runScroll, 120);
  window.setTimeout(runScroll, 360);
}

export function scheduleOsDialogFieldFocus(field) {
  if (!(field instanceof HTMLElement)) return;
  const focus = () => {
    try {
      field.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    syncOsDialogKeyboardLayout();
  };
  requestAnimationFrame(() => requestAnimationFrame(focus));
}

export function bindOsDialogKeyboardLayout() {
  if (osDialogKeyboardBound) {
    syncOsDialogKeyboardLayout();
    return;
  }
  osDialogKeyboardBound = true;
  osDialogKeyboardSync = syncOsDialogKeyboardLayout;
  document.addEventListener('focusin', osDialogKeyboardSync, true);
  window.visualViewport?.addEventListener('resize', osDialogKeyboardSync);
  window.visualViewport?.addEventListener('scroll', osDialogKeyboardSync);
}

export function releaseOsDialogKeyboardLayout() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  backdrop?.classList.remove('os-dialog-keyboard');
  document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
  if (!osDialogKeyboardBound || !osDialogKeyboardSync) return;
  document.removeEventListener('focusin', osDialogKeyboardSync, true);
  window.visualViewport?.removeEventListener('resize', osDialogKeyboardSync);
  window.visualViewport?.removeEventListener('scroll', osDialogKeyboardSync);
  osDialogKeyboardBound = false;
  osDialogKeyboardSync = null;
}

export function osConfirm(opts) {
  return osDialog({ ...opts, showCancel: true });
}

export function osAlert(opts) {
  return osDialog({ ...opts, showCancel: false, confirmLabel: opts.confirmLabel || 'OK' });
}
