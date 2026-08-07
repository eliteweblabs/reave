/**
 * Shared detail chrome — header + tab bar + tab panels for clients and projects.
 * Both editors mount these classes so spacing stays in sync via .detail-* CSS.
 */

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

  parent.appendChild(nav);
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
  if (resetScroll && scrollSelector) {
    const scroll = pane.querySelector(scrollSelector);
    if (scroll) scroll.scrollTop = 0;
  }
  onShow?.(tabId);
}
