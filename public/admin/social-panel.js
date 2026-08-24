/**
 * Social inbox — email-style list (network tabs) + reply/post pane.
 */
import {
  createIosIconBtn,
  createAgentBtn,
  createCenteredListEmpty,
  listSearchAddNew,
  attachIosPullToRefresh,
  initSidebarLayout,
  syncAdminSplitView,
  scanPanelSidebars,
} from './admin-ui.js?v=20260811a';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260810a';
import { mountListFilterTabs, captureFilterTabsScroll } from './filter-tabs.js?v=20260813a';

let shell = {};

const socialState = {
  networks: [],
  items: [],
  counts: {},
  filter: 'all',
  search: '',
  activeId: null,
  composing: false,
  composeText: '',
  composePlatforms: [],
  composeHint: '',
  reviewsEnabled: false,
  refreshing: false,
};

const KIND_LABELS = {
  post: 'Post',
  comment: 'Comment',
  mention: 'Mention',
  review: 'Review',
};

const SIMPLE_ICONS_PINNED = { linkedin: '13.19.0' };
const ICON_CDN = (slug) => {
  const version = SIMPLE_ICONS_PINNED[slug] || 'v16';
  return `https://cdn.jsdelivr.net/npm/simple-icons@${version}/icons/${slug}.svg`;
};

export function initSocialPanel(deps) {
  shell = deps || {};
}

function rootEl() {
  return document.getElementById('social-panel');
}

function formatSocialDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function networkById(id) {
  return socialState.networks.find((n) => n.id === id) || null;
}

function filteredItems() {
  const q = socialState.search.trim().toLowerCase();
  return socialState.items.filter((item) => {
    if (socialState.filter !== 'all' && item.platform !== socialState.filter) return false;
    if (!q) return true;
    return (
      item.authorName.toLowerCase().includes(q) ||
      item.text.toLowerCase().includes(q) ||
      item.platformLabel.toLowerCase().includes(q) ||
      item.kind.toLowerCase().includes(q)
    );
  });
}

function activeItem() {
  return socialState.items.find((item) => item.id === socialState.activeId) || null;
}

function snippet(text, max = 88) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function starsHtml(rating) {
  if (rating == null || !Number.isFinite(Number(rating))) return '';
  const n = Math.round(Number(rating));
  return `<span class="soc-stars" aria-label="${n} stars">${'★'.repeat(Math.min(5, Math.max(0, n)))}${'☆'.repeat(5 - Math.min(5, Math.max(0, n)))}</span>`;
}

function platformIcon(networkOrId) {
  const network = typeof networkOrId === 'string' ? networkById(networkOrId) : networkOrId;
  if (!network) return `<span class="soc-icon soc-icon--fallback"></span>`;
  return (
    `<span class="soc-icon" style="--soc-color:${escHtml(network.color)};` +
    `--soc-icon:url('${ICON_CDN(network.iconSlug)}')"></span>`
  );
}

function countForTab() {
  if (socialState.filter === 'all') return socialState.counts.all ?? socialState.items.length;
  return socialState.counts[socialState.filter] ?? 0;
}

function searchPlaceholder() {
  const n = filteredItems().length;
  return `Search ${n} ${n === 1 ? 'item' : 'items'}`;
}

async function apiGet(query = '') {
  const res = await adminFetch(`/api/admin/social/feed${query}`, { cache: 'no-store' });
  return readAdminJson(res);
}

async function apiPost(body) {
  const res = await adminFetch('/api/admin/social/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readAdminJson(res);
}

function applyFeed(feed) {
  socialState.networks = Array.isArray(feed?.networks) ? feed.networks : [];
  socialState.items = Array.isArray(feed?.items) ? feed.items : [];
  socialState.counts = feed?.counts && typeof feed.counts === 'object' ? feed.counts : {};
  socialState.composeHint = feed?.composeHint || '';
  socialState.reviewsEnabled = !!feed?.reviewsEnabled;
  if (
    socialState.filter !== 'all' &&
    !socialState.networks.some((n) => n.id === socialState.filter)
  ) {
    socialState.filter = 'all';
  }
  if (socialState.activeId && !socialState.items.some((i) => i.id === socialState.activeId)) {
    socialState.activeId = null;
  }
  if (!socialState.composePlatforms.length) {
    socialState.composePlatforms = socialState.networks
      .filter((n) => n.configured && n.id !== 'yelp' && n.id !== 'googlebusiness')
      .map((n) => n.id)
      .slice(0, 4);
  }
}

function startCompose() {
  socialState.composing = true;
  socialState.activeId = null;
  if (!socialState.composePlatforms.length) {
    socialState.composePlatforms = socialState.networks
      .filter((n) => n.configured)
      .map((n) => n.id)
      .slice(0, 3);
  }
  renderSocialPane();
  rootEl()?.classList.add('soc-pane-active');
}

function clearSocialDetail() {
  socialState.activeId = null;
  socialState.composing = false;
  rootEl()?.classList.remove('soc-pane-active');
  renderSocialPanel({ preserveSidebar: true });
}

function openSocialItem(id) {
  socialState.activeId = id;
  socialState.composing = false;
  syncSocialSidebarActive({ scroll: true });
  renderSocialPane();
  rootEl()?.classList.add('soc-pane-active');
}

function renderSocialFilterTabs(savedScrollLeft = 0) {
  const tabs = [
    { id: 'all', label: 'All', count: socialState.counts.all ?? socialState.items.length },
    ...socialState.networks
      .filter((n) => n.configured || (socialState.counts[n.id] ?? 0) > 0)
      .map((n) => ({
        id: n.id,
        label: n.label,
        count: socialState.counts[n.id] ?? 0,
      })),
  ];
  return mountListFilterTabs({
    tabs,
    activeId: socialState.filter,
    ariaLabel: 'Social networks',
    savedScrollLeft,
    onSelect(id) {
      if (socialState.filter === id) return;
      socialState.filter = id;
      const visible = filteredItems();
      if (socialState.activeId && !visible.some((item) => item.id === socialState.activeId)) {
        socialState.activeId = null;
        socialState.composing = false;
        rootEl()?.classList.remove('soc-pane-active');
      }
      renderSocialPanel();
    },
    activeTabVariant(tab, active) {
      if (active && tab.id === 'all') {
        return {
          variant: 'refresh',
          refreshing: socialState.refreshing,
          ariaLabel: 'Refresh feed',
          title: 'Refresh feed',
          onClick: () => {
            void refreshSocialFeed();
          },
        };
      }
      return null;
    },
  });
}

function createSocialListItem(item) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ch-list-item' + (item.id === socialState.activeId ? ' active' : '');
  btn.dataset.id = item.id;
  const kind = KIND_LABELS[item.kind] || item.kind;
  const demo = item.live ? '' : '<span class="soc-chip soc-chip--demo">Sample</span>';
  const rating = item.kind === 'review' ? starsHtml(item.rating) : '';
  btn.innerHTML =
    platformIcon(item.platform) +
    `<span class="ch-list-content">` +
      `<span class="ch-item-row">` +
        `<span class="ch-item-title">${escHtml(item.authorName)}</span>` +
        `<span class="ch-item-date">${escHtml(formatSocialDate(item.createdAt))}</span>` +
      `</span>` +
      `<span class="ch-item-sub">${escHtml(item.platformLabel)} · ${escHtml(kind)} ${rating} ${demo}</span>` +
      `<span class="soc-item-snippet">${escHtml(snippet(item.text))}</span>` +
    `</span>`;
  btn.addEventListener('click', () => openSocialItem(item.id));
  return btn;
}

function fillSocialSidebarList(list) {
  list.replaceChildren();
  const items = filteredItems();
  if (!items.length) {
    list.appendChild(
      createCenteredListEmpty({
        innerHtml: socialState.search.trim()
          ? 'No matches.'
          : socialState.filter === 'all'
            ? 'Nothing in the feed yet.<br><span class="em-hint">Add profile links under Socials. Google reviews land here after a sync.</span>'
            : `No ${escHtml(networkById(socialState.filter)?.label || 'network')} activity yet.`,
      }),
    );
    return;
  }
  for (const item of items) list.appendChild(createSocialListItem(item));
}

function syncSocialSidebarActive(opts = {}) {
  const root = rootEl();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const on = el.dataset.id === socialState.activeId;
    el.classList.toggle('active', on);
    if (on) activeEl = el;
  });
  if (opts.scroll && activeEl) {
    activeEl.scrollIntoView({ block: 'nearest' });
  }
}

function renderSocialSidebar(savedFilterScroll = 0) {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const subheader = listSearchAddNew({
    itemCount: countForTab(),
    search: {
      value: socialState.search,
      placeholder: searchPlaceholder(),
      onInput: (value) => {
        socialState.search = value;
        const visible = filteredItems();
        if (socialState.activeId && !visible.some((item) => item.id === socialState.activeId)) {
          socialState.activeId = null;
          socialState.composing = false;
          rootEl()?.classList.remove('soc-pane-active');
        }
        renderSocialPanel({ preserveSidebar: true, preservePane: true });
        const list = rootEl()?.querySelector('.ch-sidebar .ch-list');
        if (list) fillSocialSidebarList(list);
      },
    },
    addNew: {
      label: 'New post',
      onClick: () => startCompose(),
    },
    below: renderSocialFilterTabs(savedFilterScroll),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  fillSocialSidebarList(list);
  attachIosPullToRefresh(list, () => refreshSocialFeed());
  sidebar.appendChild(list);
  return sidebar;
}

function openExternal(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function requestComposeDraft(payload) {
  const res = await adminFetch('/api/admin/compose-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readAdminJson(res, 'compose-draft');
}

function setButtonBusy(btn, busy, idleLabel) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) btn.textContent = 'Writing…';
  else if (idleLabel) btn.textContent = idleLabel;
}

async function writeSocialComposeWithAgent(btn) {
  const textarea = rootEl()?.querySelector('#soc-compose-text');
  const platforms = socialState.composePlatforms
    .map((id) => networkById(id)?.label || id)
    .filter(Boolean)
    .join(', ');
  setButtonBusy(btn, true);
  try {
    const data = await requestComposeDraft({
      kind: 'social_post',
      platform: platforms,
      currentBody: textarea?.value || socialState.composeText,
    });
    if (!data.ok) throw new Error(data.error || 'Could not write draft');
    const body = String(data.draft?.body || '').trim();
    if (!body) throw new Error('The agent did not return any copy.');
    socialState.composeText = body;
    if (textarea) textarea.value = body;
    shell.osAlert?.('Draft ready — review before posting.', 'success');
  } catch (e) {
    shell.osAlert?.(e.message || 'Write failed', 'error');
  } finally {
    setButtonBusy(btn, false, 'Write with agent');
  }
}

async function writeSocialReplyWithAgent(item, btn) {
  const textarea = rootEl()?.querySelector('#soc-reply-draft');
  setButtonBusy(btn, true);
  try {
    const data = await requestComposeDraft({
      kind: 'social_reply',
      platform: item.platformLabel || item.platform,
      authorName: item.authorName,
      incomingText: item.text,
      currentBody: textarea?.value || item.replyDraft || '',
    });
    if (!data.ok) throw new Error(data.error || 'Could not write draft');
    const body = String(data.draft?.body || '').trim();
    if (!body) throw new Error('The agent did not return any copy.');
    if (textarea) textarea.value = body;
    item.replyDraft = body;
    try {
      await saveReply(item);
    } catch {
      /* draft is still in the box */
    }
    shell.osAlert?.('Draft ready — review before posting.', 'success');
  } catch (e) {
    shell.osAlert?.(e.message || 'Write failed', 'error');
  } finally {
    setButtonBusy(btn, false, 'Write with agent');
  }
}

async function saveReply(item, extras = {}) {
  const root = rootEl();
  const draftEl = root?.querySelector('#soc-reply-draft');
  const postedEl = root?.querySelector('#soc-reply-text');
  const data = await apiPost({
    action: 'reply',
    id: item.id,
    replyDraft: draftEl?.value ?? item.replyDraft,
    replyText: postedEl?.value ?? item.replyText,
    ...extras,
  });
  if (!data.ok) throw new Error(data.error || 'Save failed');
  item.replyDraft = draftEl?.value ?? item.replyDraft;
  item.replyText = postedEl?.value ?? item.replyText;
  if (extras.status) item.status = extras.status;
  return data;
}

function renderSocialComposePane(pane) {
  const postable = socialState.networks.filter(
    (n) => n.id !== 'apple' && n.id !== 'tripadvisor' && n.id !== 'other',
  );
  pane.appendChild(
    createPaneHeader({
      back: { label: 'Back to feed', onClick: () => clearSocialDetail() },
      title: 'New post',
      icons: [
        createAgentBtn({
          title: 'Write with agent',
          label: 'Write with agent',
          onClick: () => void writeSocialComposeWithAgent(rootEl()?.querySelector('#soc-compose-agent')),
        }),
      ],
    }).root,
  );

  const body = document.createElement('div');
  body.className = 'soc-detail em-detail';
  const checks = postable
    .map((n) => {
      const checked = socialState.composePlatforms.includes(n.id) ? ' checked' : '';
      return (
        `<label class="soc-compose-net">` +
          `<input type="checkbox" data-soc-compose-net="${escHtml(n.id)}"${checked} />` +
          platformIcon(n) +
          `<span>${escHtml(n.label)}</span>` +
        `</label>`
      );
    })
    .join('');

  body.innerHTML =
    `<p class="em-hint">${escHtml(socialState.composeHint || 'Copy the post, then open each network to publish. In-app posting is not live yet.')}</p>` +
    `<div class="soc-compose-nets">${checks || '<p class="em-hint">Add profile links under Socials to choose networks.</p>'}</div>` +
    `<label class="prof-field">` +
      `<span class="prof-label soc-compose-label">Post <button type="button" class="em-compose-agent" id="soc-compose-agent">Write with agent</button></span>` +
      `<textarea id="soc-compose-text" class="em-compose-textarea soc-compose-text" rows="8" placeholder="Write once, open each network to publish…">${escHtml(socialState.composeText)}</textarea>` +
    `</label>` +
    `<div class="soc-detail-actions" id="soc-compose-actions"></div>`;

  pane.appendChild(body);

  body.querySelectorAll('[data-soc-compose-net]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-soc-compose-net');
      if (!id) return;
      const next = new Set(socialState.composePlatforms);
      if (input.checked) next.add(id);
      else next.delete(id);
      socialState.composePlatforms = [...next];
    });
  });

  const textarea = body.querySelector('#soc-compose-text');
  textarea?.addEventListener('input', () => {
    socialState.composeText = textarea.value;
  });
  body.querySelector('#soc-compose-agent')?.addEventListener('click', (ev) => {
    void writeSocialComposeWithAgent(ev.currentTarget);
  });

  const actions = body.querySelector('#soc-compose-actions');
  if (!actions) return;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'de-btn de-btn--secondary';
  copyBtn.textContent = 'Copy text';
  copyBtn.addEventListener('click', async () => {
    const text = textarea?.value.trim() || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      shell.osAlert?.('Copied.', 'success');
    } catch {
      shell.osAlert?.('Could not copy.', 'error');
    }
  });
  actions.appendChild(copyBtn);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'de-btn';
  openBtn.textContent = 'Open selected networks';
  openBtn.addEventListener('click', async () => {
    const text = textarea?.value.trim() || '';
    if (!socialState.composePlatforms.length) {
      shell.osAlert?.('Pick at least one network.', 'warning');
      return;
    }
    const profileUrls = {};
    for (const n of socialState.networks) {
      if (n.url) profileUrls[n.id] = n.url;
    }
    try {
      const data = await apiPost({
        action: 'compose_urls',
        text,
        platforms: socialState.composePlatforms,
        profileUrls,
      });
      if (!data.ok) throw new Error(data.error || 'Could not build links');
      for (const row of data.urls || []) {
        if (row.url) openExternal(row.url);
      }
    } catch (e) {
      shell.osAlert?.(e.message || 'Open failed', 'error');
    }
  });
  actions.appendChild(openBtn);
}

function renderSocialDetailPane(pane, item) {
  const title =
    item.kind === 'review'
      ? `${item.authorName} · ${item.platformLabel} review`
      : `${item.authorName} · ${KIND_LABELS[item.kind] || item.kind}`;

  const icons = [];
  if (item.url) {
    icons.push(
      createIosIconBtn({
        iconKey: 'link',
        label: `Open on ${item.platformLabel}`,
        onClick: () => openExternal(item.url),
      }),
    );
  }
  icons.push(
    createIosIconBtn({
      iconKey: 'reply',
      label: 'Focus reply',
      onClick: () => rootEl()?.querySelector('#soc-reply-draft')?.focus(),
    }),
  );
  icons.push(
    createAgentBtn({
      title: 'Write with agent',
      label: 'Write with agent',
      onClick: () => void writeSocialReplyWithAgent(item, rootEl()?.querySelector('#soc-reply-agent')),
    }),
  );

  pane.appendChild(
    createPaneHeader({
      back: { label: 'Back to feed', onClick: () => clearSocialDetail() },
      title,
      icons,
    }).root,
  );

  const detail = document.createElement('div');
  detail.className = 'soc-detail em-detail';
  const demoNote = item.live
    ? ''
    : `<p class="em-hint">Sample activity for the saved ${escHtml(item.platformLabel)} profile. Connect the account under Socials when you want live posts and comments.</p>`;
  const reviewNote =
    item.source === 'review'
      ? `<p class="em-hint">Draft here, then open ${escHtml(item.platformLabel)} to post the reply. Mark responded when it’s live.</p>`
      : `<p class="em-hint">Replies are not posted into ${escHtml(item.platformLabel)} from Reave yet — copy or open the link and reply there.</p>`;

  detail.innerHTML =
    `<div class="soc-detail-meta">` +
      platformIcon(item.platform) +
      `<span class="soc-detail-kind">${escHtml(item.platformLabel)} · ${escHtml(KIND_LABELS[item.kind] || item.kind)}</span>` +
      (item.kind === 'review' ? starsHtml(item.rating) : '') +
      `<span class="soc-detail-date">${escHtml(formatSocialDate(item.createdAt))}</span>` +
      (item.live ? '' : '<span class="soc-chip soc-chip--demo">Sample</span>') +
    `</div>` +
    `<h2 class="soc-detail-author">${escHtml(item.authorName)}</h2>` +
    `<div class="em-detail-body">${escHtml(item.text)}</div>` +
    demoNote +
    reviewNote +
    (item.url
      ? `<p><a class="soc-detail-link" href="${escHtml(item.url)}" target="_blank" rel="noopener">Open on ${escHtml(item.platformLabel)} ↗</a></p>`
      : '') +
    `<label class="prof-field">` +
      `<span class="prof-label soc-compose-label">Reply draft <button type="button" class="em-compose-agent" id="soc-reply-agent">Write with agent</button></span>` +
      `<textarea id="soc-reply-draft" class="em-compose-textarea soc-compose-text" rows="5" placeholder="Write a reply…">${escHtml(item.replyDraft || '')}</textarea>` +
    `</label>` +
    `<label class="prof-field">` +
      `<span class="prof-label">Posted reply <span class="prof-hint">(paste what you published, optional)</span></span>` +
      `<textarea id="soc-reply-text" class="em-compose-textarea soc-compose-text" rows="3" placeholder="What you posted on the network…">${escHtml(item.replyText || '')}</textarea>` +
    `</label>` +
    `<div class="soc-detail-actions" id="soc-item-actions"></div>`;

  pane.appendChild(detail);
  detail.querySelector('#soc-reply-agent')?.addEventListener('click', (ev) => {
    void writeSocialReplyWithAgent(item, ev.currentTarget);
  });
  const actions = detail.querySelector('#soc-item-actions');
  if (!actions) return;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'de-btn de-btn--secondary';
  saveBtn.textContent = 'Save draft';
  saveBtn.addEventListener('click', async () => {
    try {
      await saveReply(item);
      shell.osAlert?.('Draft saved.', 'success');
    } catch (e) {
      shell.osAlert?.(e.message || 'Save failed', 'error');
    }
  });
  actions.appendChild(saveBtn);

  if (item.url) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'de-btn';
    openBtn.textContent = `Reply on ${item.platformLabel}`;
    openBtn.addEventListener('click', async () => {
      const draft = rootEl()?.querySelector('#soc-reply-draft')?.value.trim() || '';
      if (draft) {
        try {
          await navigator.clipboard.writeText(draft);
        } catch {
          /* open anyway */
        }
      }
      try {
        await saveReply(item);
      } catch {
        /* still open */
      }
      openExternal(item.url);
    });
    actions.appendChild(openBtn);
  }

  if (item.source === 'review') {
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'de-btn de-btn--secondary';
    doneBtn.textContent = item.status === 'responded' ? 'Responded' : 'Mark responded';
    doneBtn.disabled = item.status === 'responded';
    doneBtn.addEventListener('click', async () => {
      try {
        await saveReply(item, { status: 'responded' });
        shell.osAlert?.('Marked responded.', 'success');
        renderSocialPane();
      } catch (e) {
        shell.osAlert?.(e.message || 'Update failed', 'error');
      }
    });
    actions.appendChild(doneBtn);
  }
}

function renderSocialPane() {
  const root = rootEl();
  if (!root) return;
  if (!root.querySelector('.ch-sidebar')) {
    renderSocialPanel();
    return;
  }
  root.querySelector('.ch-pane')?.remove();

  const pane = document.createElement('div');
  pane.className = 'ch-pane';

  if (socialState.composing) {
    renderSocialComposePane(pane);
    root.appendChild(pane);
    root.classList.add('soc-pane-active');
    return;
  }

  const item = activeItem();
  if (!item) {
    if (typeof shell.appendEmptyDetailPane === 'function') {
      shell.appendEmptyDetailPane(pane, {
        mapKey: 'social',
        iconName: 'message',
        bodyHtml:
          '<p>Select an item or write a new post.</p>' +
          '<p class="em-hint">Tabs are networks with a profile under Socials. Google and Yelp reviews land in this same inbox.</p>',
        btnLabel: 'New post',
        onCreate: () => startCompose(),
      });
    } else {
      pane.innerHTML = `<div class="de-pane-empty-body"><p>Select an item or write a new post.</p></div>`;
    }
    root.appendChild(pane);
    root.classList.remove('soc-pane-active');
    return;
  }

  renderSocialDetailPane(pane, item);
  root.appendChild(pane);
  root.classList.add('soc-pane-active');
}

function renderSocialPanel(opts = {}) {
  const root = rootEl();
  if (!root) return;
  const savedFilterScroll = captureFilterTabsScroll(root);

  if (opts.preserveSidebar && root.querySelector('.ch-sidebar')) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list && !opts.skipList) fillSocialSidebarList(list);
    syncSocialSidebarActive();
  } else {
    root.innerHTML = '';
    root.appendChild(renderSocialSidebar(savedFilterScroll));
    initSidebarLayout();
    scanPanelSidebars();
  }

  if (!opts.preservePane) renderSocialPane();
  syncAdminSplitView('social');
}

async function refreshSocialFeed() {
  if (socialState.refreshing) return;
  socialState.refreshing = true;
  rootEl()?.querySelector('.em-filter-tab--refresh')?.classList.add('em-filter-tab--refreshing');
  try {
    const data = await apiGet();
    if (!data.ok) throw new Error(data.error || 'Failed to load feed');
    applyFeed(data.feed);
    renderSocialPanel({ preservePane: Boolean(socialState.activeId || socialState.composing) });
  } catch (e) {
    console.warn('[social] refresh failed', e);
  } finally {
    socialState.refreshing = false;
    rootEl()?.querySelector('.em-filter-tab--refresh')?.classList.remove('em-filter-tab--refreshing');
  }
}

export async function loadSocialTab() {
  const root = rootEl();
  if (!root) return;
  if (!root.querySelector('.ch-sidebar')) {
    mountPanelSkeleton(root, 'list', 'Loading social feed…', {
      contentSelector: '.ch-list',
      wrapper: (sk) => `<div class="ch-sidebar">${sk}</div><div class="ch-pane"></div>`,
    });
  }
  try {
    const data = await apiGet();
    if (!data.ok) throw new Error(data.error || 'Failed to load feed');
    applyFeed(data.feed);
    renderSocialPanel();
  } catch (e) {
    root.innerHTML =
      `<div class="social-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Social</h1>` +
        `<p class="dash-empty">Could not load social inbox: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}
