/**
 * Shared list filter tabs — category navigation under search bars.
 * Used by email, chat, clients, and projects sidebars.
 *
 * CSS: .em-filter-tabs, .em-filter-tab (see email.css + editor.css stacked subheader)
 */

import { bindConfirmDeleteButton, IOS_ICONS } from './admin-ui.js?v=20260809a';
import { escHtml } from './shared.js?v=20260808k';

/** Instant scroll — CSS scroll-behavior:smooth would animate every panel re-render otherwise. */
export function setFilterNavScrollLeft(nav, left, { smooth = false } = {}) {
  if (!nav) return;
  nav.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
}

/** Scroll a filter tab into the tab strip only when it is clipped. No-op if fully visible. */
export function scrollFilterTabIntoViewIfNeeded(nav, tabEl) {
  if (!nav || !tabEl) return;
  const navRect = nav.getBoundingClientRect();
  const tabRect = tabEl.getBoundingClientRect();
  if (tabRect.left >= navRect.left && tabRect.right <= navRect.right) return;
  let delta = 0;
  if (tabRect.left < navRect.left) {
    delta = tabRect.left - navRect.left;
  } else if (tabRect.right > navRect.right) {
    delta = tabRect.right - navRect.right;
  }
  if (delta) setFilterNavScrollLeft(nav, nav.scrollLeft + delta, { smooth: false });
}

export function captureFilterTabsScroll(root) {
  return (
    root?.querySelector('.em-filter-tabs--scroll')?.scrollLeft ??
    root?.querySelector('.em-filter-tabs')?.scrollLeft ??
    0
  );
}

export function mountFilterTabsScroll(nav, savedScrollLeft = 0) {
  if (!nav) return;
  requestAnimationFrame(() => {
    setFilterNavScrollLeft(nav, savedScrollLeft, { smooth: false });
    scrollFilterTabIntoViewIfNeeded(nav, nav.querySelector('.em-filter-tab.active'));
  });
}

export function getFilterFixedTabWidth(wrap) {
  if (!wrap) return 0;
  const fixedNav = wrap.querySelector('.em-filter-tabs-fixed');
  const measured = fixedNav?.offsetWidth ?? 0;
  if (measured > 0) return measured;
  const cssVar = parseFloat(getComputedStyle(wrap).getPropertyValue('--em-filter-fixed-tab-width'));
  return Number.isFinite(cssVar) ? cssVar : 0;
}

/** Center a scroll-tab in the strip left of pinned fixed tabs. */
export function centerFilterTabInScrollNav(nav, tabEl, wrap, { smooth = true } = {}) {
  if (!nav || !tabEl) return;
  const fixedWidth = getFilterFixedTabWidth(wrap);
  const visibleWidth = Math.max(0, nav.clientWidth - fixedWidth);
  const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
  const target = tabEl.offsetLeft + tabEl.offsetWidth / 2 - visibleWidth / 2;
  const left = Math.max(0, Math.min(target, maxScroll));
  if (Math.abs(nav.scrollLeft - left) < 1) {
    setFilterNavScrollLeft(nav, left, { smooth: false });
    return;
  }
  setFilterNavScrollLeft(nav, left, { smooth });
}

export function syncEmailFilterFixedTabWidth(wrap) {
  if (!wrap) return;
  const fixedNav = wrap.querySelector('.em-filter-tabs-fixed');
  if (!fixedNav) return;
  const apply = () => {
    const w = fixedNav.offsetWidth;
    if (w > 0) wrap.style.setProperty('--em-filter-fixed-tab-width', `${w}px`);
  };
  apply();
  requestAnimationFrame(apply);
}

/**
 * @param {{
 *   id: string,
 *   label: string,
 *   count?: number,
 *   active: boolean,
 *   variant?: 'default' | 'purge' | 'refresh' | 'draft' | 'sent',
 *   refreshing?: boolean,
 *   onClick?: () => void,
 *   onConfirmDelete?: () => void,
 *   ariaLabel?: string,
 *   title?: string,
 * }} opts
 */
export function createFilterTabButton(opts) {
  const {
    id,
    label,
    count,
    active,
    variant = 'default',
    refreshing = false,
    onClick,
    onConfirmDelete,
    ariaLabel,
    title,
  } = opts;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.filter = id;
  btn.className =
    'em-filter-tab' +
    (active ? ' active' : '') +
    (variant === 'purge' ? ' em-filter-tab--purge' : '') +
    (variant === 'refresh' ? ' em-filter-tab--refresh' : '') +
    (variant === 'refresh' && refreshing ? ' em-filter-tab--refreshing' : '') +
    (variant === 'draft' ? ' em-filter-tab--draft' : '') +
    (variant === 'sent' ? ' em-filter-tab--sent' : '');
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', active ? 'true' : 'false');
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  if (title) btn.title = title;

  if (variant === 'purge') {
    btn.innerHTML =
      `<span class="em-filter-tab-label">${escHtml(label)}</span>` +
      `<span class="em-filter-purge-icon">${IOS_ICONS.trash}</span>`;
    bindConfirmDeleteButton(btn, onConfirmDelete);
  } else if (variant === 'refresh') {
    btn.innerHTML =
      `<span class="em-filter-tab-label">${escHtml(label)}</span>` +
      `<span class="em-filter-refresh-icon">${IOS_ICONS.refresh}</span>`;
    btn.addEventListener('click', () => onClick?.());
  } else {
    const countHtml =
      count != null ? ` <span class="em-filter-count">${count}</span>` : '';
    btn.innerHTML = `${escHtml(label)}${countHtml}`;
    btn.addEventListener('click', () => onClick?.());
  }

  return btn;
}

/**
 * Standard scrollable filter tabs for list sidebars (clients, projects, chat).
 *
 * @param {{
 *   tabs: { id: string, label: string, count?: number }[],
 *   activeId: string,
 *   ariaLabel: string,
 *   savedScrollLeft?: number,
 *   scroll?: boolean,
 *   onSelect: (id: string) => void,
 *   activeTabVariant?: (tab: { id: string, label: string, count?: number }, active: boolean) => {
 *     variant?: 'default' | 'purge' | 'refresh',
 *     refreshing?: boolean,
 *     onClick?: () => void,
 *     onConfirmDelete?: () => void,
 *     ariaLabel?: string,
 *     title?: string,
 *   } | null,
 * }} opts
 */
export function mountListFilterTabs(opts) {
  const {
    tabs,
    activeId,
    ariaLabel,
    savedScrollLeft = 0,
    scroll = true,
    onSelect,
    activeTabVariant,
  } = opts;

  const nav = document.createElement('div');
  nav.className = ['em-filter-tabs', scroll ? 'em-filter-tabs--scroll' : '']
    .filter(Boolean)
    .join(' ');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', ariaLabel);

  for (const tab of tabs) {
    const isActive = activeId === tab.id;
    const variantOpts = isActive && activeTabVariant ? activeTabVariant(tab, isActive) : null;
    const variant = variantOpts?.variant ?? 'default';

    const btn = createFilterTabButton({
      id: tab.id,
      label: tab.label,
      count: tab.count,
      active: isActive,
      variant,
      refreshing: variantOpts?.refreshing,
      ariaLabel: variantOpts?.ariaLabel,
      title: variantOpts?.title,
      onClick:
        variant === 'default'
          ? () => {
              const current = nav.querySelector('.em-filter-tab.active')?.dataset.filter;
              if (current === tab.id) return;
              nav.querySelectorAll('.em-filter-tab').forEach((el) => {
                const on = el.dataset.filter === tab.id;
                el.classList.toggle('active', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
              });
              scrollFilterTabIntoViewIfNeeded(nav, btn);
              onSelect(tab.id);
            }
          : variantOpts?.onClick,
      onConfirmDelete: variantOpts?.onConfirmDelete,
    });

    nav.appendChild(btn);
  }

  mountFilterTabsScroll(nav, savedScrollLeft);
  return nav;
}

/**
 * Email-style filter tabs: scroll area + pinned fixed tabs (Draft/Sent).
 *
 * @param {{
 *   scrollTabs: { id: string, label: string, count?: number }[],
 *   fixedTabs: { id: string, label: string, count?: number, variant?: 'draft' | 'sent' }[],
 *   activeId: string,
 *   savedScrollLeft?: number,
 *   onSelect: (id: string) => void,
 *   activeTabVariant?: (tab: { id: string, label: string, count?: number }, active: boolean) => {
 *     variant?: 'default' | 'purge' | 'refresh',
 *     refreshing?: boolean,
 *     onClick?: () => void,
 *     onConfirmDelete?: () => void,
 *     ariaLabel?: string,
 *     title?: string,
 *   } | null,
 * }} opts
 */
export function mountListFilterTabsWrap(opts) {
  const { scrollTabs, fixedTabs, activeId, savedScrollLeft = 0, onSelect, activeTabVariant } = opts;

  const wrap = document.createElement('div');
  wrap.className = 'em-filter-tabs-wrap';

  const scrollNav = document.createElement('div');
  scrollNav.className = 'em-filter-tabs em-filter-tabs--scroll';
  scrollNav.setAttribute('role', 'tablist');
  scrollNav.setAttribute('aria-label', 'Inbox filters');

  for (const tab of scrollTabs) {
    const isActive = activeId === tab.id;
    const variantOpts = isActive && activeTabVariant ? activeTabVariant(tab, isActive) : null;
    const variant = variantOpts?.variant ?? 'default';

    const btn = createFilterTabButton({
      id: tab.id,
      label: tab.label,
      count: tab.count,
      active: isActive,
      variant,
      refreshing: variantOpts?.refreshing,
      ariaLabel: variantOpts?.ariaLabel,
      title: variantOpts?.title,
      onClick:
        variant === 'default'
          ? () => onSelect(tab.id)
          : variantOpts?.onClick,
      onConfirmDelete: variantOpts?.onConfirmDelete,
    });

    scrollNav.appendChild(btn);
  }

  const fixedNav = document.createElement('div');
  fixedNav.className = 'em-filter-tabs-fixed';
  fixedNav.setAttribute('role', 'tablist');
  fixedNav.setAttribute('aria-label', 'Mail folders');

  for (const tab of fixedTabs) {
    const isActive = activeId === tab.id;
    const btn = createFilterTabButton({
      id: tab.id,
      label: tab.label,
      count: tab.count,
      active: isActive,
      variant: tab.variant ?? 'default',
      onClick: () => onSelect(tab.id),
    });
    fixedNav.appendChild(btn);
  }

  wrap.appendChild(scrollNav);
  wrap.appendChild(fixedNav);
  mountFilterTabsScroll(scrollNav, savedScrollLeft);
  return wrap;
}

const EMAIL_FILTER_SCROLL_TAB_IDS = [
  'all',
  'alert',
  'review',
  'book',
  'project',
  'routed',
  'receipt',
  'junk',
];
const EMAIL_FILTER_CENTER_FROM_ID = 'receipt';

function emailFilterShouldCenter(filterId) {
  const cutoff = EMAIL_FILTER_SCROLL_TAB_IDS.indexOf(EMAIL_FILTER_CENTER_FROM_ID);
  const idx = EMAIL_FILTER_SCROLL_TAB_IDS.indexOf(filterId);
  return cutoff !== -1 && idx !== -1 && idx >= cutoff;
}

/** Whether switching to this inbox filter should center the active tab in the scroll strip. */
export function shouldCenterEmailFilterTab(filterId) {
  return emailFilterShouldCenter(filterId);
}

/**
 * Email-only scroll positioning after render (center far-right tabs or restore scroll).
 */
export function applyEmailFilterTabsScroll(wrap, savedScrollLeft = 0, filterId = 'all', centerActive = false) {
  if (!wrap) return;
  const nav = wrap.querySelector('.em-filter-tabs--scroll');
  if (!nav) return;
  const run = () => {
    syncEmailFilterFixedTabWidth(wrap);
    const activeTab = nav.querySelector('.em-filter-tab.active');
    const shouldCenter = centerActive && emailFilterShouldCenter(filterId);
    if (shouldCenter && activeTab) {
      centerFilterTabInScrollNav(nav, activeTab, wrap, { smooth: true });
      return;
    }
    setFilterNavScrollLeft(nav, savedScrollLeft, { smooth: false });
    scrollFilterTabIntoViewIfNeeded(nav, activeTab);
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}
