/**
 * Shared admin notification card chrome.
 *
 * Every dismissible dashboard / header notice (PWA install, push enable,
 * confirm banners, review notifications) must be built through
 * `buildAdminNotice` so layout, dismiss X, and tone classes stay in sync.
 *
 * Styles live on `.admin-setup-alert*` in src/styles/admin/shell.css.
 */

import { iosIcon, createBrandBtn, createIosIconBtn } from './admin-ui.js?v=20260825f';

export const ADMIN_NOTICE_DISMISS_SVG = iosIcon('x', 16);

/**
 * IOS_ICONS keys for email-rule / dashboard notify actions.
 * Matches the client-portal share sheet stroke set (eye, copy, …).
 */
export const NOTICE_ACTION_ICONS = {
  view: 'eye',
  open: 'eye',
  archive: 'archive',
  delete: 'trash',
  copy: 'copy',
  activate: 'link',
  explain: 'sparkles',
  expense: 'receipt',
  rules: 'agent',
};

/**
 * Append an action button to a notice toolbar.
 * @param {HTMLElement} toolbar
 * @param {{ label: string, iconKey?: string, primary?: boolean, danger?: boolean, disabled?: boolean, title?: string, onClick: (btn: HTMLButtonElement) => void }} opts
 * @returns {HTMLButtonElement}
 */
export function appendAdminNoticeAction(toolbar, opts) {
  const iconKey = opts.iconKey || null;
  if (iconKey) {
    const btn = createIosIconBtn({
      iconKey,
      label: opts.title || opts.label,
      className: 'ios-icon-btn admin-setup-alert-icon-btn',
      onClick: (el) => opts.onClick(el),
    });
    if (opts.disabled) btn.disabled = true;
    toolbar.appendChild(btn);
    return btn;
  }
  const variant = opts.danger ? 'danger' : opts.primary ? 'filled' : 'glass';
  const btn = createBrandBtn({
    variant,
    label: opts.label,
    title: opts.title,
    disabled: opts.disabled,
    className: 'admin-setup-alert-btn',
    onClick: (el) => opts.onClick(el),
  });
  toolbar.appendChild(btn);
  return btn;
}

/**
 * Build one admin notification card.
 *
 * @param {{
 *   tone?: string,
 *   role?: string,
 *   copyHtml: string,
 *   iconUrl?: string | null,
 *   iconFallbackUrl?: string | null,
 *   modifiers?: string[],
 *   attrs?: Record<string, string | null | undefined>,
 *   actions?: Array<{ label: string, iconKey?: string, primary?: boolean, danger?: boolean, disabled?: boolean, title?: string, onClick: (btn: HTMLButtonElement) => void }>,
 *   onDismiss?: (btn: HTMLButtonElement, ev: Event) => void,
 *   dismissLabel?: string,
 *   onCopyClick?: () => void,
 *   ariaLabelledBy?: string,
 *   ariaModal?: string,
 * }} opts
 * @returns {{ root: HTMLElement, copy: HTMLElement, toolbar: HTMLElement | null, dismiss: HTMLButtonElement }}
 */
export function buildAdminNotice(opts) {
  const tone = opts.tone || 'alert';
  const alert = document.createElement('div');
  const modifiers = (opts.modifiers || []).filter(Boolean);
  alert.className = [
    'admin-setup-alert',
    `admin-setup-alert--${tone}`,
    ...modifiers.map((m) => (m.startsWith('admin-setup-alert--') ? m : `admin-setup-alert--${m}`)),
  ].join(' ');
  alert.setAttribute('role', opts.role || 'status');
  if (opts.ariaLabelledBy) alert.setAttribute('aria-labelledby', opts.ariaLabelledBy);
  if (opts.ariaModal != null) alert.setAttribute('aria-modal', opts.ariaModal);

  if (opts.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) {
      if (value == null || value === '') continue;
      alert.setAttribute(key, String(value));
    }
  }

  const copy = document.createElement('div');
  copy.className = 'admin-setup-alert-copy';
  copy.innerHTML = opts.copyHtml || '';
  if (opts.onCopyClick) {
    copy.addEventListener('click', () => opts.onCopyClick());
  }

  let toolbar = null;
  const actions = opts.actions || [];
  if (actions.length) {
    toolbar = document.createElement('div');
    toolbar.className = 'admin-setup-alert-toolbar';
    toolbar.dataset.actionCount = String(Math.min(actions.length, 3));
    for (const action of actions) {
      appendAdminNoticeAction(toolbar, action);
    }
  }

  const dismiss = createIosIconBtn({
    iconKey: 'x',
    label: opts.dismissLabel || 'Dismiss',
    className: 'ios-icon-btn admin-setup-alert-dismiss',
    onClick: opts.onDismiss
      ? (btn, ev) => opts.onDismiss(btn, ev)
      : undefined,
  });

  const iconUrl = opts.iconUrl || null;
  if (iconUrl) {
    const head = document.createElement('div');
    head.className = 'admin-setup-alert-head';

    const brandIcon = document.createElement('img');
    brandIcon.className = 'admin-setup-alert-brand';
    brandIcon.src = iconUrl;
    brandIcon.alt = '';
    brandIcon.setAttribute('aria-hidden', 'true');
    const fallback = opts.iconFallbackUrl || iconUrl;
    if (fallback && fallback !== iconUrl) {
      brandIcon.addEventListener(
        'error',
        () => {
          brandIcon.onerror = null;
          brandIcon.src = fallback;
        },
        { once: true },
      );
    }

    head.append(brandIcon, copy);
    alert.appendChild(head);
  } else {
    alert.appendChild(copy);
  }

  if (toolbar) alert.appendChild(toolbar);
  alert.appendChild(dismiss);

  return { root: alert, copy, toolbar, dismiss };
}
