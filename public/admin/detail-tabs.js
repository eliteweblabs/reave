/**
 * Shared detail chrome — header + tab bar + tab panels for clients and projects.
 * Both editors mount these classes so spacing stays in sync via .detail-* CSS.
 *
 * Pair with filter-tabs.js for list sidebar category navigation (under search bars).
 */

function setDetailTabScrollLeft(nav, left) {
  if (!nav) return;
  nav.scrollTo({ left, behavior: 'instant' });
}

/** Scroll an active detail tab into view when clipped at the strip edge. */
export function scrollDetailTabIntoViewIfNeeded(nav, tabEl, edgePad = 6) {
  if (!nav || !tabEl) return;
  const navRect = nav.getBoundingClientRect();
  const tabRect = tabEl.getBoundingClientRect();
  const leftBound = navRect.left + edgePad;
  const rightBound = navRect.right - edgePad;
  if (tabRect.left >= leftBound && tabRect.right <= rightBound) return;
  let delta = 0;
  if (tabRect.left < leftBound) {
    delta = tabRect.left - leftBound;
  } else if (tabRect.right > rightBound) {
    delta = tabRect.right - rightBound;
  }
  if (delta) setDetailTabScrollLeft(nav, nav.scrollLeft + delta);
}

/** Restore horizontal scroll and ensure the active tab is visible after mount. */
export function mountDetailTabScroll(nav, savedScrollLeft = 0) {
  if (!nav) return;
  requestAnimationFrame(() => {
    setDetailTabScrollLeft(nav, savedScrollLeft);
    scrollDetailTabIntoViewIfNeeded(nav, nav.querySelector('.detail-tab.active'));
  });
}

export function createDetailChrome(pane, extraClass = '') {
  const chrome = document.createElement('div');
  chrome.className = 'detail-chrome' + (extraClass ? ` ${extraClass}` : '');
  pane.appendChild(chrome);
  return chrome;
}

export function createDetailFormScroll(pane, extraClass = '') {
  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll detail-form-scroll' + (extraClass ? ` ${extraClass}` : '');
  pane.appendChild(scroll);
  return scroll;
}

/** Standard inner wrapper for tab panel content — scroll owns outer inset. */
export function createDetailPanelBody(extraClass = '') {
  const body = document.createElement('div');
  body.className = ['detail-panel-body', extraClass].filter(Boolean).join(' ');
  return body;
}

/**
 * @param {HTMLElement} parent
 * @param {{
 *   tabs: { id: string, label: string }[],
 *   activeTab: string,
 *   onSelect: (tabId: string) => void,
 *   ariaLabel: string,
 *   tabClass?: string,
 *   tabsClass?: string,
 *   dataAttr?: string,
 *   renderTab?: (btn: HTMLButtonElement, tab: { id: string, label: string }, active: boolean) => void,
 * }} opts
 */
export function mountDetailTabs(parent, opts) {
  const {
    tabs,
    activeTab,
    onSelect,
    ariaLabel,
    tabClass = '',
    tabsClass = '',
    dataAttr = 'detailTab',
    renderTab,
  } = opts;

  const wrap = document.createElement('div');
  wrap.className = 'detail-tabs-wrap';

  const nav = document.createElement('div');
  nav.className = ['detail-tabs', tabsClass].filter(Boolean).join(' ');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', ariaLabel);

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = activeTab === tab.id;
    btn.className = ['detail-tab', tabClass, isActive ? 'active' : ''].filter(Boolean).join(' ');
    btn.dataset[dataAttr] = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (renderTab) {
      renderTab(btn, tab, isActive);
    } else {
      btn.textContent = tab.label;
    }
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      onSelect(tab.id);
    });
    nav.appendChild(btn);
  }

  wrap.appendChild(nav);
  parent.appendChild(wrap);
  mountDetailTabScroll(nav);
  return nav;
}

export function createDetailPanel({
  tabId,
  activeTab,
  panelClass = '',
  dataAttr = 'detailTab',
}) {
  const panel = document.createElement('div');
  panel.className = ['detail-panel', panelClass].filter(Boolean).join(' ');
  panel.dataset[dataAttr] = tabId;
  panel.hidden = activeTab !== tabId;
  return panel;
}

/**
 * @param {HTMLElement} pane
 * @param {{
 *   tabId: string,
 *   tabBtnSelector: string,
 *   panelSelector: string,
 *   tabDataAttr: string,
 *   panelDataAttr: string,
 *   scrollSelector?: string,
 *   resetScroll?: boolean,
 *   onShow?: (tabId: string) => void,
 * }} opts
 */
export function showDetailPanel(pane, opts) {
  const {
    tabId,
    tabBtnSelector,
    panelSelector,
    tabDataAttr,
    panelDataAttr,
    scrollSelector,
    resetScroll = true,
    onShow,
  } = opts;

  pane.querySelectorAll(tabBtnSelector).forEach((btn) => {
    const active = btn.dataset[tabDataAttr] === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  pane.querySelectorAll(panelSelector).forEach((panel) => {
    panel.hidden = panel.dataset[panelDataAttr] !== tabId;
  });
  const tabsNav = pane.querySelector('.detail-tabs');
  if (tabsNav) {
    scrollDetailTabIntoViewIfNeeded(tabsNav, tabsNav.querySelector(`${tabBtnSelector}.active`));
  }
  if (resetScroll && scrollSelector) {
    const scroll = pane.querySelector(scrollSelector);
    if (scroll) scroll.scrollTop = 0;
  }
  onShow?.(tabId);
}
