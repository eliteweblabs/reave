import { MAPS, SYSTEM_MAP_KEYS, SYSTEM_TAB_SLOT, CHAT_MAP_KEYS, CHAT_TAB_SLOT } from '/admin/os-map-data.js';

const GRID = 12;
const STORE = 'os-map-pos-v2';
const MAP_STORE = 'os-map-active-v1';
const TAB_ORDER_STORE = 'os-map-tab-order-v1';
const SYSTEM_MAP_SET = new Set(SYSTEM_MAP_KEYS);
const CHAT_MAP_SET = new Set(CHAT_MAP_KEYS);
const MOBILE_TABS_MQ = window.matchMedia('(max-width: 639px)');
const COMPACT_TABS_MQ = window.matchMedia('(max-width: 1280px)');
const userId = document.body?.dataset?.userId?.trim() || '';
const SVGNS = 'http://www.w3.org/2000/svg';
const PINCH_ZOOM = true;

// Real brand logos via Simple Icons (https://simpleicons.org), pinned to a
// major version. We render the SVG as a CSS mask so each glyph can be tinted to
// its node's hue, keeping the full-spectrum look on the dark canvas.
const ICON_CDN = (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/${slug}.svg`;

function chipHtml(n) {
  if (n.brand) {
    return `<span class="chip brand"><i class="bi" style="--icon:url('${ICON_CDN(n.brand)}')"></i></span>`;
  }
  return `<span class="chip">${n.icon ?? '•'}</span>`;
}

const wrap = document.getElementById('wrap');
const world = document.getElementById('world');
const edgesSvg = document.getElementById('edges');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap = (v) => Math.round(v / GRID) * GRID;

let z = 1;
let panX = 0;
let panY = 0;

// ---- live health (System tab only) ----
const HEALTH_URL = '/api/health';
const HEALTH_INTERVAL_MS = 20000;
const STATUS_LABELS = {
  up: 'Online',
  down: 'Down',
  degraded: 'Degraded',
  configured: 'Configured',
  unconfigured: 'Not set',
  unknown: 'Unknown',
};
let healthTimer = null;
let healthAbort = null;
let lastChecked = null;

// ---- active map state (rebuilt on tab switch) ----
let activeKey = loadActiveKey();
let MAP = MAPS[activeKey];
let byId = new Map();
let nodeEls = new Map();
let edgeEls = [];
let labelEls = [];
let groupEls = new Map();

function storeKey() {
  return `${STORE}:${activeKey}`;
}

// ---- build the active map into the world ----
function buildMap() {
  byId = new Map();
  nodeEls = new Map();
  edgeEls = [];
  labelEls = [];
  groupEls = new Map();

  // Clear everything except the persistent <svg id="edges">.
  for (const child of Array.from(world.children)) {
    if (child !== edgesSvg) world.removeChild(child);
  }
  while (edgesSvg.firstChild) edgesSvg.removeChild(edgesSvg.firstChild);

  MAP.nodes.forEach((n) => byId.set(n.id, { ...n }));
  loadPositions();

  // groups
  for (const g of MAP.groups) {
    const el = document.createElement('div');
    el.className = 'group';
    el.style.setProperty('--h', g.hue);
    const label = document.createElement('div');
    label.className = 'g-label';
    label.textContent = g.title;
    el.appendChild(label);
    world.appendChild(el);
    groupEls.set(g.id, el);
    attachGroupDrag(g, label);
  }

  // edges (paths + labels)
  for (const e of MAP.edges) {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', `edge${e.dashed ? '' : ' solid'}`);
    const hue = (byId.get(e.from) || {}).hue ?? 210;
    path.setAttribute('stroke', `hsl(${hue} 80% 62% / ${e.ghost ? 0.4 : 0.9})`);
    edgesSvg.appendChild(path);
    edgeEls.push({ e, path });

    if (e.label) {
      const lab = document.createElement('div');
      lab.className = 'elabel';
      lab.textContent = e.label;
      world.appendChild(lab);
      labelEls.push({ e, lab });
    }
  }

  // nodes
  for (const n of byId.values()) {
    const el = document.createElement('div');
    el.className = `node${n.ghost ? ' ghost' : ''}${n.cls ? ` ${n.cls}` : ''}`;
    el.style.setProperty('--h', n.hue);
    if (n.wide) el.style.width = `${n.wide}px`;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.innerHTML = `
      ${n.badge ? `<div class="rule-badge">${n.badge}</div>` : ''}
      <div class="row">
        ${chipHtml(n)}
        <span class="ttl">${n.title}</span>
      </div>
      ${n.sub ? `<div class="sub${n.subMultiline ? ' sub-multi' : ''}">${n.sub}</div>` : ''}
      ${n.status ? `<div class="status st-checking" data-st="${n.id}">Checking…</div>` : ''}
    `;
    world.appendChild(el);
    nodeEls.set(n.id, el);
    attachDrag(n, el);
  }

  buildLegend();
  syncModelNodeLabels();
}

function setActiveMap(key, opts = {}) {
  const force = opts.force === true;
  if (!MAPS[key]) return;
  if (key === activeKey && !force) {
    updateTabs();
    return;
  }
  activeKey = key;
  MAP = MAPS[key];
  saveActiveKey();
  closeTabDropdowns();
  updateTabs();
  syncCanvasVisibility();
  syncModelSelectorVisibility();
  activateMapPanel(opts);
  syncHealthLifecycle();
  syncEmailPoll();
}

function isPanelMapKey(key) {
  const t = MAPS[key]?.type;
  return (
    t === 'documents' ||
    t === 'knowledge' ||
    t === 'work' ||
    t === 'clients' ||
    t === 'chats' ||
    t === 'email' ||
    t === 'todo' ||
    t === 'rules'
  );
}

function activateMapPanel(opts = {}) {
  if (MAP.type === 'documents') {
    loadDocumentsTab();
  } else if (MAP.type === 'knowledge') {
    loadKnowledgeTab();
  } else if (MAP.type === 'work') {
    loadWorkTab();
  } else if (MAP.type === 'clients') {
    loadClientsTab();
  } else if (MAP.type === 'chats') {
    loadChatsTab({ keepSession: opts.keepChatSession === true });
  } else if (MAP.type === 'email') {
    markInboxSeenAndClearBadge();
    loadEmailTab();
  } else {
    buildMap();
    finishMapLayout();
    if (MAP.type === 'todo') loadAndBuildTodoNodes();
    if (MAP.type === 'rules') loadAndBuildRuleNodes();
  }
}

function isPanelTab() {
  return MAP.type === 'documents' || MAP.type === 'knowledge' || MAP.type === 'work' || MAP.type === 'clients' || MAP.type === 'chats' || MAP.type === 'email';
}

function setPanelDisplay(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

function syncCanvasVisibility() {
  const isPanel = isPanelTab();
  wrap.style.display = isPanel ? 'none' : '';
  setPanelDisplay('tools', isPanel ? 'none' : '');
  setPanelDisplay('legend', isPanel ? 'none' : '');
  setPanelDisplay('doc-editor', MAP.type === 'documents' ? 'flex' : 'none');
  setPanelDisplay('knowledge-editor', MAP.type === 'knowledge' ? 'flex' : 'none');
  setPanelDisplay('work-editor', MAP.type === 'work' ? 'flex' : 'none');
  setPanelDisplay('clients-editor', MAP.type === 'clients' ? 'flex' : 'none');
  setPanelDisplay('chat-panel', MAP.type === 'chats' ? 'flex' : 'none');
  setPanelDisplay('email-panel', MAP.type === 'email' ? 'flex' : 'none');
  setPanelDisplay('rule-editor', MAP.type === 'rules' ? 'flex' : 'none');
  syncRulesToolbar();
}

function syncRulesToolbar() {
  const tools = document.getElementById('tools');
  if (!tools) return;
  let addBtn = document.getElementById('rules-add-btn');
  if (MAP.type !== 'rules') {
    addBtn?.remove();
    return;
  }
  if (!addBtn) {
    addBtn = document.createElement('button');
    addBtn.id = 'rules-add-btn';
    addBtn.dataset.act = 'rules-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add email rule';
    tools.insertBefore(addBtn, tools.firstChild);
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startNewRule();
    });
  }
}

// ---- health polling ----
function syncHealthLifecycle() {
  startHealth();
  updateChecked();
}

function startHealth() {
  stopHealth();
  pollHealth();
  healthTimer = setInterval(pollHealth, HEALTH_INTERVAL_MS);
}

function stopHealth() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (healthAbort) {
    healthAbort.abort();
    healthAbort = null;
  }
}

async function pollHealth() {
  try {
    healthAbort = new AbortController();
    const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: healthAbort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastChecked = data.checkedAt ? new Date(data.checkedAt) : new Date();
    applyHealth(data.services || {});
  } catch {
    // Network/abort errors are non-fatal; leave the last known state in place.
  } finally {
    healthAbort = null;
  }
}

function applyHealth(services) {
  for (const [id, probe] of Object.entries(services)) {
    const el = world.querySelector(`[data-st="${id}"]`);
    if (!el) continue;
    const status = probe && probe.status ? probe.status : 'unknown';
    el.className = `status st-${status}`;
    el.textContent = STATUS_LABELS[status] || status;
    const bits = [];
    if (probe && probe.mode) bits.push(probe.mode);
    if (probe && probe.detail) bits.push(probe.detail);
    if (probe && typeof probe.ms === 'number') bits.push(`${probe.ms}ms`);
    el.title = bits.join(' · ');
  }
  drawGroups();
  drawEdges();
  updateChecked();
}

function updateChecked() {
  const el = document.getElementById('health-checked');
  if (!el) return;
  if (!lastChecked) {
    el.style.opacity = '0.35';
    el.dataset.tooltip = '';
    return;
  }
  el.style.opacity = '1';
  el.dataset.tooltip = `Health checked at ${lastChecked.toLocaleTimeString()}`;
}

// ---- agent model picker (System / Chats / Telegram) ----
const MODEL_TABS = new Set(['system', 'chats', 'telegram']);
const MODEL_NODE_IDS = ['anthropic', 'tc_claude', 'tc_svc_anthropic'];

let agentModelState = {
  model: 'claude-sonnet-4-6',
  source: 'default',
  options: [],
  loading: true,
  saving: false,
  anthropicBalance: null,
};

function formatBalanceUsd(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

function anthropicBalanceLabel() {
  const b = agentModelState.anthropicBalance;
  if (!b) return null;
  const usd = formatBalanceUsd(b.balanceUsd);
  if (usd) return usd;
  if (b.source === 'error' && b.detail) return '—';
  return null;
}

function anthropicBalanceTitle() {
  const b = agentModelState.anthropicBalance;
  if (!b) return '';
  const usd = formatBalanceUsd(b.balanceUsd);
  if (usd) {
    const src = b.source === 'live' ? 'Anthropic prepaid credits' : 'manual balance';
    return `${usd} available (${src})`;
  }
  if (b.detail) return b.detail;
  return 'Anthropic balance not configured';
}

function modelSelectEl() {
  return document.getElementById('model-select');
}

function syncModelSelectorVisibility() {
  const el = modelSelectEl();
  if (!el) return;
  el.style.display = MODEL_TABS.has(activeKey) ? '' : 'none';
}

function modelBaseLabel(opt) {
  return opt.label || opt.id;
}

function modelOptionLabel(opt) {
  const base = modelBaseLabel(opt);
  const bal = anthropicBalanceLabel();
  return bal ? `${base} · ${bal}` : base;
}

function renderModelSelectOptions() {
  const el = modelSelectEl();
  if (!el) return;
  el.innerHTML = '';
  for (const opt of agentModelState.options) {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = modelOptionLabel(opt);
    el.appendChild(option);
  }
  if (agentModelState.model && !agentModelState.options.some((o) => o.id === agentModelState.model)) {
    const option = document.createElement('option');
    option.value = agentModelState.model;
    option.textContent = agentModelState.model;
    el.appendChild(option);
  }
  el.value = agentModelState.model;
  el.disabled = agentModelState.loading || agentModelState.saving;
  const balTitle = anthropicBalanceTitle();
  el.title = agentModelState.loading
    ? 'Loading model…'
    : balTitle
      ? `${balTitle} — chat, Telegram, dashboard agent`
      : `Claude model (${agentModelState.source}) — chat, Telegram, dashboard agent`;
}

function syncModelNodeLabels() {
  if (!agentModelState.model) return;
  const label = modelBaseLabel(
    agentModelState.options.find((o) => o.id === agentModelState.model) || { id: agentModelState.model },
  );
  const bits = [`${label}`, agentModelState.source];
  const bal = anthropicBalanceLabel();
  if (bal) bits.push(bal);
  const sub = bits.join(' · ');
  for (const id of MODEL_NODE_IDS) {
    const node = byId.get(id);
    if (node) node.sub = sub;
    const el = nodeEls.get(id);
    const subEl = el?.querySelector('.sub');
    if (subEl) subEl.textContent = sub;
  }
}

async function loadAgentModel() {
  agentModelState.loading = true;
  renderModelSelectOptions();
  try {
    const res = await fetch('/api/agent/model', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    agentModelState.model = data.model || agentModelState.model;
    agentModelState.source = data.source || 'default';
    agentModelState.options = data.options || [];
    agentModelState.anthropicBalance = data.anthropicBalance || null;
  } catch (e) {
    console.warn('[model] load failed:', e);
  } finally {
    agentModelState.loading = false;
    renderModelSelectOptions();
    syncModelNodeLabels();
  }
}

async function saveAgentModel(model) {
  if (!model || agentModelState.saving) return;
  agentModelState.saving = true;
  renderModelSelectOptions();
  try {
    const res = await fetch('/api/agent/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    agentModelState.model = data.model;
    agentModelState.source = data.source || 'stored';
    agentModelState.options = data.options || agentModelState.options;
    agentModelState.anthropicBalance = data.anthropicBalance || agentModelState.anthropicBalance;
    syncModelNodeLabels();
    if (activeKey === 'system') pollHealth();
  } catch (e) {
    alert(`Could not save model: ${e.message}`);
    renderModelSelectOptions();
  } finally {
    agentModelState.saving = false;
    renderModelSelectOptions();
  }
}

function initModelSelector() {
  const el = modelSelectEl();
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('change', () => {
    if (el.value && el.value !== agentModelState.model) saveAgentModel(el.value);
  });
  loadAgentModel();
  syncModelSelectorVisibility();
}

// ---- rendering ----
const NODE_W = 210;
const NODE_H = 96;
const NODE_H_COMPACT = 72;
const NODE_GAP = GRID * 2;

function defaultNodeSize(n) {
  return {
    w: n.wide || NODE_W,
    h: n.status ? NODE_H : NODE_H_COMPACT,
  };
}

function rect(n) {
  const el = nodeEls.get(n.id);
  const fallback = defaultNodeSize(n);
  return {
    x: n.x,
    y: n.y,
    w: el?.offsetWidth || fallback.w,
    h: el?.offsetHeight || fallback.h,
  };
}

function nodeBounds(n) {
  const r = rect(n);
  return { x: r.x, y: r.y, w: r.w, h: r.h, right: r.x + r.w, bottom: r.y + r.h };
}

function boxesOverlap(a, b, gap = NODE_GAP) {
  return a.x < b.right + gap && a.right + gap > b.x && a.y < b.bottom + gap && a.bottom + gap > b.y;
}

function separateNodes(a, b, gap = NODE_GAP) {
  const ra = nodeBounds(a);
  const rb = nodeBounds(b);
  if (!boxesOverlap(ra, rb, gap)) return false;

  const overlapX = Math.min(ra.right + gap - rb.x, rb.right + gap - ra.x);
  const overlapY = Math.min(ra.bottom + gap - rb.y, rb.bottom + gap - ra.y);

  if (overlapX < overlapY) {
    if (ra.x + ra.w / 2 <= rb.x + rb.w / 2) b.x = snap(ra.right + gap);
    else a.x = snap(rb.right + gap);
  } else if (ra.y + ra.h / 2 <= rb.y + rb.h / 2) b.y = snap(ra.bottom + gap);
  else a.y = snap(rb.bottom + gap);

  return true;
}

function applyNodePositions() {
  for (const n of byId.values()) {
    const el = nodeEls.get(n.id);
    if (!el) continue;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
  }
}

/** Push overlapping nodes apart after layout; returns true if anything moved. */
function resolveOverlaps() {
  const nodes = [...byId.values()];
  if (nodes.length < 2) return false;

  let changed = false;
  const maxPass = Math.max(24, nodes.length * 4);

  for (let pass = 0; pass < maxPass; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (separateNodes(nodes[i], nodes[j])) moved = true;
      }
    }
    if (!moved) break;
    changed = true;
    applyNodePositions();
  }
  return changed;
}

function finishMapLayout({ persist = true } = {}) {
  requestAnimationFrame(() => {
    const fixed = resolveOverlaps();
    redraw();
    fit();
    if (fixed && persist) savePositions();
  });
}

function anchors(a, b) {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? [{ x: a.x + a.w, y: acy, h: true }, { x: b.x, y: bcy, h: true }]
      : [{ x: a.x, y: acy, h: true }, { x: b.x + b.w, y: bcy, h: true }];
  }
  return dy >= 0
    ? [{ x: acx, y: a.y + a.h, h: false }, { x: bcx, y: b.y, h: false }]
    : [{ x: acx, y: a.y, h: false }, { x: bcx, y: b.y + b.h, h: false }];
}

function roundedPath(pts, r) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1;
    const l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1x = cx - ((cx - px) / l1) * rr;
    const p1y = cy - ((cy - py) / l1) * rr;
    const p2x = cx + ((nx - cx) / l2) * rr;
    const p2y = cy + ((ny - cy) / l2) * rr;
    d += ` L ${p1x} ${p1y} Q ${cx} ${cy} ${p2x} ${p2y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

function drawEdges() {
  for (const { e, path } of edgeEls) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [s, t] = anchors(rect(a), rect(b));
    let pts;
    if (s.h) {
      const mx = (s.x + t.x) / 2;
      pts = [[s.x, s.y], [mx, s.y], [mx, t.y], [t.x, t.y]];
    } else {
      const my = (s.y + t.y) / 2;
      pts = [[s.x, s.y], [s.x, my], [t.x, my], [t.x, t.y]];
    }
    path.setAttribute('d', roundedPath(pts, 10));
  }
  for (const { e, lab } of labelEls) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [s, t] = anchors(rect(a), rect(b));
    lab.style.left = `${(s.x + t.x) / 2}px`;
    lab.style.top = `${(s.y + t.y) / 2}px`;
  }
}

function drawGroups() {
  for (const g of MAP.groups) {
    const ms = g.members.map((id) => byId.get(id)).filter(Boolean);
    if (!ms.length) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of ms) {
      const r = rect(n);
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const pad = 22;
    const el = groupEls.get(g.id);
    el.style.left = `${minX - pad}px`;
    el.style.top = `${minY - pad}px`;
    el.style.width = `${maxX - minX + pad * 2}px`;
    el.style.height = `${maxY - minY + pad * 2}px`;
  }
}

function applyWorld() {
  world.style.transform = `translate(${panX}px, ${panY}px) scale(${z})`;
  wrap.style.backgroundSize = `${GRID * 2 * z}px ${GRID * 2 * z}px`;
  wrap.style.backgroundPosition = `${panX}px ${panY}px`;
}

function redraw() {
  drawGroups();
  drawEdges();
  applyWorld();
}

// ---- node dragging ----
function attachDrag(n, el) {
  el.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    try { el.setPointerCapture(ev.pointerId); } catch {}
    el.classList.add('dragging');
    const start = toWorld(ev.clientX, ev.clientY);
    const offX = start.x - n.x;
    const offY = start.y - n.y;

    const move = (e) => {
      const p = toWorld(e.clientX, e.clientY);
      n.x = snap(p.x - offX);
      n.y = snap(p.y - offY);
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      drawGroups();
      drawEdges();
    };
    const up = () => {
      el.classList.remove('dragging');
      try { el.releasePointerCapture(ev.pointerId); } catch {}
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      savePositions();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}

// ---- group dragging (move every member node together, Railway-style) ----
function attachGroupDrag(g, handle) {
  handle.addEventListener('pointerdown', (ev) => {
    const members = g.members.map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) return;
    ev.stopPropagation();
    try { handle.setPointerCapture(ev.pointerId); } catch {}
    handle.classList.add('dragging');
    const start = toWorld(ev.clientX, ev.clientY);
    const origins = members.map((n) => ({ n, x: n.x, y: n.y }));

    const move = (e) => {
      const p = toWorld(e.clientX, e.clientY);
      const dx = snap(p.x - start.x);
      const dy = snap(p.y - start.y);
      for (const o of origins) {
        o.n.x = o.x + dx;
        o.n.y = o.y + dy;
        const el = nodeEls.get(o.n.id);
        el.style.left = `${o.n.x}px`;
        el.style.top = `${o.n.y}px`;
      }
      drawGroups();
      drawEdges();
    };
    const up = () => {
      handle.classList.remove('dragging');
      try { handle.releasePointerCapture(ev.pointerId); } catch {}
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      savePositions();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

// ---- pan + pinch-zoom ----
// _canvasPtrs tracks all active pointers on the canvas background so the
// single-pointer pan handler can yield to a two-finger pinch when PINCH_ZOOM
// is true. Flip the constant to false to disable pinch gestures entirely.
const _canvasPtrs = new Map(); // pointerId → current { x, y }
let _pinchDist = null;         // baseline finger distance when a pinch begins

wrap.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.node')) return;
  _canvasPtrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

  if (_canvasPtrs.size === 1) {
    wrap.classList.add('panning');
    const sx = ev.clientX - panX;
    const sy = ev.clientY - panY;
    const move = (e) => {
      if (_canvasPtrs.size >= 2) return; // yield to pinch
      panX = e.clientX - sx;
      panY = e.clientY - sy;
      applyWorld();
    };
    const up = () => {
      wrap.classList.remove('panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  } else if (PINCH_ZOOM && _canvasPtrs.size === 2) {
    wrap.classList.remove('panning');
    const pts = [..._canvasPtrs.values()];
    _pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }
});

wrap.addEventListener('pointermove', (ev) => {
  if (!PINCH_ZOOM || !_canvasPtrs.has(ev.pointerId) || _canvasPtrs.size < 2) return;
  _canvasPtrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!_pinchDist) return;
  const pts = [..._canvasPtrs.values()];
  const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const factor = clamp(newDist / _pinchDist, 0.85, 1.15);
  const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  zoomAt(factor, mid.x, mid.y);
  _pinchDist = newDist;
});

wrap.addEventListener('pointerup', (ev) => {
  _canvasPtrs.delete(ev.pointerId);
  if (_canvasPtrs.size < 2) _pinchDist = null;
});

wrap.addEventListener('pointercancel', (ev) => {
  _canvasPtrs.delete(ev.pointerId);
  if (_canvasPtrs.size < 2) _pinchDist = null;
});

// ---- zoom ----
function toWorld(clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  return { x: (clientX - r.left - panX) / z, y: (clientY - r.top - panY) / z };
}
function zoomAt(factor, clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  const nz = clamp(z * factor, 0.2, 2.5);
  panX = x - (x - panX) * (nz / z);
  panY = y - (y - panY) * (nz / z);
  z = nz;
  applyWorld();
}
wrap.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    // Proportional, gentle zoom: smooth for trackpads, slower for mouse wheels.
    // Clamp per-event so a single big wheel tick can't jump too far.
    const factor = clamp(Math.exp(-e.deltaY * 0.0004), 0.95, 1.05);
    zoomAt(factor, e.clientX, e.clientY);
  },
  { passive: false }
);

function fit() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of byId.values()) {
    const r = rect(n);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const pad = 60;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const vw = wrap.clientWidth;
  const vh = wrap.clientHeight;
  z = clamp(Math.min(vw / cw, vh / ch), 0.2, 2.5);
  panX = (vw - cw * z) / 2 - (minX - pad) * z;
  panY = (vh - ch * z) / 2 - (minY - pad) * z;
  applyWorld();
}

// ---- toolbar ----
document.querySelectorAll('#tools button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const act = btn.dataset.act;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    if (act === 'in') zoomAt(1.2, cx + wrap.getBoundingClientRect().left, cy + wrap.getBoundingClientRect().top);
    else if (act === 'out') zoomAt(1 / 1.2, cx + wrap.getBoundingClientRect().left, cy + wrap.getBoundingClientRect().top);
    else if (act === 'fit') fit();
  });
});
document.getElementById('reset')?.addEventListener('click', () => {
  localStorage.removeItem(storeKey());
  for (const n of byId.values()) {
    const orig = MAP.nodes.find((d) => d.id === n.id);
    if (!orig) continue;
    n.x = orig.x;
    n.y = orig.y;
    const el = nodeEls.get(n.id);
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
  }
  finishMapLayout();
});

// ---- tabs ----
let tabDragMoved = false;
let tabOrderSaveTimer = null;

function tabOrderStoreKey() {
  return userId ? `${TAB_ORDER_STORE}:${userId}` : TAB_ORDER_STORE;
}

function isMobileTabs() {
  return MOBILE_TABS_MQ.matches;
}

function isCompactTabs() {
  return COMPACT_TABS_MQ.matches;
}

/** Expand mobile-only dropdown slots back to persisted tab keys. */
function storedTabOrderKeys(keys) {
  const out = [];
  for (const raw of keys) {
    if (raw === CHAT_TAB_SLOT) {
      out.push('chats', 'knowledge');
    } else {
      out.push(raw);
    }
  }
  return normalizeTabOrderKeys(out);
}

/** Collapse Chats+Knowledge into one slot on phone only; hide Finance on mobile. */
function effectiveTabOrder(order) {
  const normalized = normalizeTabOrderKeys(order);
  if (!isMobileTabs()) return normalized;

  const out = [];
  let chatSlot = false;
  for (const key of normalized) {
    if (key === 'knowledge' || key === 'chats') {
      if (!chatSlot) {
        out.push(CHAT_TAB_SLOT);
        chatSlot = true;
      }
      continue;
    }
    if (key === 'finance') continue;
    out.push(key);
  }
  return out;
}

function defaultTabKeys() {
  const keys = Object.keys(MAPS).filter((k) => !SYSTEM_MAP_SET.has(k));
  return [SYSTEM_TAB_SLOT, ...keys];
}

function normalizeTabOrderKeys(saved) {
  if (!Array.isArray(saved)) return defaultTabKeys();

  const result = [];
  let systemSlot = false;

  for (const raw of saved) {
    if (typeof raw !== 'string') continue;
    if (SYSTEM_MAP_SET.has(raw) || raw === SYSTEM_TAB_SLOT) {
      if (!systemSlot) {
        result.push(SYSTEM_TAB_SLOT);
        systemSlot = true;
      }
      continue;
    }
    if (MAPS[raw] && !result.includes(raw)) result.push(raw);
  }

  if (!systemSlot) result.unshift(SYSTEM_TAB_SLOT);
  for (const k of defaultTabKeys()) {
    if (!result.includes(k)) result.push(k);
  }
  return result;
}

function loadTabOrderFromLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(tabOrderStoreKey()) || 'null');
    return normalizeTabOrderKeys(saved);
  } catch {
    return defaultTabKeys();
  }
}

async function fetchTabOrderFromServer() {
  if (!userId) return null;
  try {
    const res = await fetch('/api/os-map/tab-order', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.tabOrder) ? normalizeTabOrderKeys(data.tabOrder) : null;
  } catch {
    return null;
  }
}

async function resolveTabOrder() {
  const server = await fetchTabOrderFromServer();
  if (server) {
    try {
      localStorage.setItem(tabOrderStoreKey(), JSON.stringify(server));
    } catch {}
    return server;
  }
  return loadTabOrderFromLocal();
}

function saveTabOrder(keys) {
  const normalized = storedTabOrderKeys(keys);
  try {
    localStorage.setItem(tabOrderStoreKey(), JSON.stringify(normalized));
  } catch {}
  if (!userId) return;
  clearTimeout(tabOrderSaveTimer);
  tabOrderSaveTimer = setTimeout(() => {
    fetch('/api/os-map/tab-order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabOrder: normalized }),
    }).catch(() => {});
  }, 500);
}

function currentTabOrderFromDom() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return defaultTabKeys();
  const raw = [...tabs.querySelectorAll(':scope > [data-tab-key]')]
    .map((el) => el.dataset.tabKey)
    .filter(Boolean);
  return storedTabOrderKeys(raw);
}

function clearTabDropHints() {
  document.querySelectorAll('#tabs .tab-drop-before, #tabs .tab-drop-after').forEach((el) => {
    el.classList.remove('tab-drop-before', 'tab-drop-after');
  });
}

function tabSiblings(tabs, el) {
  return [...tabs.querySelectorAll(':scope > [data-tab-key]')].filter((node) => node !== el);
}

function repositionTabByPointer(el, pointerX) {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;

  clearTabDropHints();
  const siblings = tabSiblings(tabs, el);
  if (!siblings.length) return;

  for (const sib of siblings) {
    const rect = sib.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (pointerX < mid) {
      tabs.insertBefore(el, sib);
      sib.classList.add('tab-drop-before');
      return;
    }
  }

  tabs.appendChild(el);
  siblings[siblings.length - 1]?.classList.add('tab-drop-after');
}

function attachTabPointerReorder(el) {
  const grip = el.querySelector('.tab-grip');
  if (!grip) return;

  grip.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    tabDragMoved = false;
    el.classList.add('tab-dragging');

    function onMove(moveEv) {
      tabDragMoved = true;
      repositionTabByPointer(el, moveEv.clientX);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('tab-dragging');
      clearTabDropHints();
      if (tabDragMoved) saveTabOrder(currentTabOrderFromDom());
      setTimeout(() => { tabDragMoved = false; }, 0);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function tabInnerHtml(m) {
  const label = m.icon
    ? `<span class="tab-icon">${m.icon}</span><span class="tab-label">${m.title}</span>`
    : m.title;
  return `<span class="tab-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>${label}`;
}

function resetMobileTabDropdown(wrap) {
  const menu = wrap?.querySelector('.tab-dropdown-menu');
  if (!menu) return;
  menu.style.position = '';
  menu.style.top = '';
  menu.style.left = '';
  menu.style.right = '';
  menu.style.zIndex = '';
}

function positionTabDropdownMenu(wrap) {
  const menu = wrap.querySelector('.tab-dropdown-menu');
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!menu || !trigger) return;
  requestAnimationFrame(() => {
    const rect = trigger.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.right = 'auto';
    menu.style.zIndex = '10000';
  });
}

function closeTabDropdowns(except) {
  document.querySelectorAll('.tab-dropdown.open').forEach((dd) => {
    if (dd !== except) {
      dd.classList.remove('open');
      resetMobileTabDropdown(dd);
    }
  });
}

/** Dropdown tab: go to default sub-tab, reload if already there, else open sub-menu. */
function attachDropdownTriggerClick(wrap, mapSet, defaultKey) {
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (tabDragMoved) return;

    if (!mapSet.has(activeKey)) {
      setActiveMap(defaultKey);
      return;
    }
    if (activeKey === defaultKey) {
      setActiveMap(defaultKey, { force: true });
      closeTabDropdowns();
      return;
    }

    const willOpen = !wrap.classList.contains('open');
    closeTabDropdowns(willOpen ? wrap : null);
    wrap.classList.toggle('open', willOpen);
    if (willOpen) positionTabDropdownMenu(wrap);
    else resetMobileTabDropdown(wrap);
  });
}

function buildSystemDropdownTab() {
  const wrap = document.createElement('div');
  wrap.className = 'tab-item tab-dropdown';
  wrap.dataset.tabKey = SYSTEM_TAB_SLOT;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tab-dropdown-trigger';
  trigger.innerHTML = `${tabInnerHtml(MAPS.system)}<span class="tab-caret" aria-hidden="true">▾</span>`;
  trigger.title = 'System — runtime, MCP & CLI, Telegram';

  const menu = document.createElement('div');
  menu.className = 'tab-dropdown-menu';
  menu.setAttribute('role', 'menu');

  for (const key of SYSTEM_MAP_KEYS) {
    const m = MAPS[key];
    if (!m) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tab-dropdown-item';
    item.dataset.map = key;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = m.icon
      ? `<span class="tab-icon">${m.icon}</span><span class="tab-label">${m.title}</span>`
      : m.title;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActiveMap(key);
      closeTabDropdowns();
    });
    menu.appendChild(item);
  }

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  attachDropdownTriggerClick(wrap, SYSTEM_MAP_SET, 'system');
  attachTabPointerReorder(wrap);
  return wrap;
}

function buildChatDropdownTab() {
  const wrap = document.createElement('div');
  wrap.className = 'tab-item tab-dropdown tab-dropdown--chat';
  wrap.dataset.tabKey = CHAT_TAB_SLOT;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tab-dropdown-trigger';
  trigger.innerHTML = `${tabInnerHtml(MAPS.chats)}<span class="tab-caret" aria-hidden="true">▾</span>`;
  trigger.title = 'Chats — tap to open; hold for Chats & Knowledge menu';

  const menu = document.createElement('div');
  menu.className = 'tab-dropdown-menu';
  menu.setAttribute('role', 'menu');

  for (const key of CHAT_MAP_KEYS) {
    const m = MAPS[key];
    if (!m) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tab-dropdown-item';
    item.dataset.map = key;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = m.icon
      ? `<span class="tab-icon">${m.icon}</span><span class="tab-label">${m.title}</span>`
      : m.title;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActiveMap(key);
      closeTabDropdowns();
    });
    menu.appendChild(item);
  }

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  attachChatDropdownTriggerClick(wrap);
  attachTabPointerReorder(wrap);
  return wrap;
}

/** Phone-only merged tab: tap always opens Chats; long-press opens Chats/Knowledge menu. */
function attachChatDropdownTriggerClick(wrap) {
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!trigger) return;

  let longPressTimer = null;
  let longPressFired = false;

  function openSubmenu() {
    const willOpen = !wrap.classList.contains('open');
    closeTabDropdowns(willOpen ? wrap : null);
    wrap.classList.toggle('open', willOpen);
    if (willOpen) positionTabDropdownMenu(wrap);
    else resetMobileTabDropdown(wrap);
  }

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (tabDragMoved || longPressFired) {
      longPressFired = false;
      return;
    }
    setActiveMap('chats', { force: activeKey === 'chats' });
    closeTabDropdowns();
  });

  trigger.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    longPressFired = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      openSubmenu();
    }, 500);
  });

  function cancelLongPress() {
    clearTimeout(longPressTimer);
  }
  trigger.addEventListener('pointerup', cancelLongPress);
  trigger.addEventListener('pointerleave', cancelLongPress);
  trigger.addEventListener('pointercancel', cancelLongPress);
}

function buildMapTab(key, m) {
  const item = document.createElement('div');
  item.className = 'tab-item';
  item.dataset.tabKey = key;
  item.dataset.map = key;
  item.innerHTML = tabInnerHtml(m);
  item.title = `${m.title} — drag ⋮⋮ to reorder`;
  item.addEventListener('click', (ev) => {
    if (tabDragMoved || ev.target.closest('.tab-grip')) return;
    setActiveMap(key, { force: key === activeKey && isPanelMapKey(key) });
  });
  attachTabPointerReorder(item);
  return item;
}

function buildLinkTab(key, m) {
  const item = document.createElement('div');
  item.className = 'tab-item tab-link';
  item.dataset.tabKey = key;

  const a = document.createElement('a');
  a.href = m.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.innerHTML = tabInnerHtml(m);
  a.title = `${m.title} — drag ⋮⋮ to reorder`;
  a.addEventListener('click', (ev) => {
    if (tabDragMoved) ev.preventDefault();
  });

  item.appendChild(a);
  attachTabPointerReorder(item);
  return item;
}

function buildTabs(order) {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  tabs.title = isCompactTabs()
    ? 'Tabs — scroll sideways if needed'
    : 'Drag ⋮⋮ on a tab to reorder';

  for (const key of effectiveTabOrder(order)) {
    if (key === SYSTEM_TAB_SLOT) {
      tabs.appendChild(buildSystemDropdownTab());
      continue;
    }
    if (key === CHAT_TAB_SLOT) {
      tabs.appendChild(buildChatDropdownTab());
      continue;
    }
    const m = MAPS[key];
    if (!m) continue;
    tabs.appendChild(m.link ? buildLinkTab(key, m) : buildMapTab(key, m));
  }
  updateTabs();
}

function updateTabs() {
  document.querySelectorAll('#tabs .tab-item[data-map]').forEach((el) => {
    el.classList.toggle('active', el.dataset.map === activeKey);
  });

  document.querySelectorAll('#tabs .tab-dropdown').forEach((dropdown) => {
    const slot = dropdown.dataset.tabKey;
    dropdown.querySelectorAll('.tab-dropdown-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.map === activeKey);
    });

    const trigger = dropdown.querySelector('.tab-dropdown-trigger');
    if (!trigger) return;

    if (slot === SYSTEM_TAB_SLOT) {
      dropdown.classList.toggle('active', SYSTEM_MAP_SET.has(activeKey));
      trigger.innerHTML = `${tabInnerHtml(MAPS.system)}<span class="tab-caret" aria-hidden="true">▾</span>`;
      return;
    }

    if (slot === CHAT_TAB_SLOT) {
      dropdown.classList.toggle('active', CHAT_MAP_SET.has(activeKey));
      const head = CHAT_MAP_SET.has(activeKey) ? MAPS[activeKey] : MAPS.chats;
      trigger.innerHTML = `${tabInnerHtml(head)}<span class="tab-caret" aria-hidden="true">▾</span>`;
    }
  });

  document.querySelectorAll('#topbar-tools-menu .topbar-dropdown-item[data-map]').forEach((item) => {
    item.classList.toggle('active', item.dataset.map === activeKey);
  });
}

/** Flat tab keys for the mobile wrench menu (all sections, no collapsed slots). */
function wrenchMenuTabKeys(order) {
  const out = [];
  for (const key of normalizeTabOrderKeys(order)) {
    if (key === SYSTEM_TAB_SLOT) {
      for (const k of SYSTEM_MAP_KEYS) {
        if (!out.includes(k)) out.push(k);
      }
      continue;
    }
    if (MAPS[key] && !out.includes(key)) out.push(key);
  }
  return out;
}

function closeTopbarMenus(exceptMenu) {
  const toolsMenu = document.getElementById('topbar-tools-menu');
  const profileMenu = document.getElementById('topbar-profile-menu');
  if (toolsMenu && toolsMenu !== exceptMenu) {
    toolsMenu.classList.remove('open');
    document.getElementById('topbar-tools-toggle')?.setAttribute('aria-expanded', 'false');
  }
  if (profileMenu && profileMenu !== exceptMenu) {
    profileMenu.classList.remove('open');
    document.getElementById('topbar-profile-toggle')?.setAttribute('aria-expanded', 'false');
  }
}

function toggleTopbarMenu(menuEl, toggleEl) {
  if (!menuEl || !toggleEl) return;
  const willOpen = !menuEl.classList.contains('open');
  closeTopbarMenus(null);
  if (willOpen) {
    menuEl.classList.add('open');
    toggleEl.setAttribute('aria-expanded', 'true');
  }
}

async function buildMobileToolsMenu(order) {
  const menu = document.getElementById('topbar-tools-menu');
  if (!menu) return;
  menu.innerHTML = '';

  for (const key of wrenchMenuTabKeys(order)) {
    const m = MAPS[key];
    if (!m) continue;

    if (m.link) {
      const a = document.createElement('a');
      a.className = 'topbar-dropdown-item';
      a.href = m.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('role', 'menuitem');
      a.innerHTML = m.icon
        ? `<span class="topbar-dropdown-icon">${m.icon}</span><span>${escHtml(m.title)}</span>`
        : escHtml(m.title);
      a.addEventListener('click', () => closeTopbarMenus());
      menu.appendChild(a);
      continue;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topbar-dropdown-item';
    btn.dataset.map = key;
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = m.icon
      ? `<span class="topbar-dropdown-icon">${m.icon}</span><span>${escHtml(m.title)}</span>`
      : escHtml(m.title);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActiveMap(key, { force: key === activeKey && isPanelMapKey(key) });
      closeTopbarMenus();
    });
    menu.appendChild(btn);
  }

  updateTabs();
}

function syncTopbarInboxBadge(count) {
  const badge = document.getElementById('topbar-inbox-badge');
  const btn = document.getElementById('topbar-tools-toggle');
  if (!badge) return;
  const n = Math.max(0, Number(count) || 0);
  if (n > 0) {
    badge.hidden = false;
    badge.textContent = n > 99 ? '99+' : String(n);
    btn?.classList.add('has-badge');
  } else {
    badge.hidden = true;
    badge.textContent = '0';
    btn?.classList.remove('has-badge');
  }
}

function initTopbarMenus() {
  const toolsToggle = document.getElementById('topbar-tools-toggle');
  const toolsMenu = document.getElementById('topbar-tools-menu');
  toolsToggle?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleTopbarMenu(toolsMenu, toolsToggle);
  });

  const profileToggle = document.getElementById('topbar-profile-toggle');
  const profileMenu = document.getElementById('topbar-profile-menu');
  profileToggle?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleTopbarMenu(profileMenu, profileToggle);
  });

  document.getElementById('topbar-sign-out')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    closeTopbarMenus();
    const { Clerk } = window;
    if (Clerk) {
      await Clerk.signOut();
      window.location.href = '/';
    } else {
      window.location.href = '/sign-out';
    }
  });

  if (!document.documentElement.dataset.topbarMenuBound) {
    document.documentElement.dataset.topbarMenuBound = '1';
    document.addEventListener('click', () => closeTopbarMenus());
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeTopbarMenus();
    });
  }
}

document.addEventListener('click', () => closeTabDropdowns());

// ---- legend ----
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  for (const g of MAP.groups) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span class="dot" style="background:hsl(${g.hue} 75% 58%)"></span>${g.title}`;
    legend.appendChild(chip);
  }

  if (activeKey === 'rules') {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = '<span class="dot" style="background:hsl(165 75% 58%)"></span>First match wins · click a card to edit';
    legend.appendChild(chip);
  }

  // Status key (only meaningful on the live System map).
  if (activeKey === 'system') {
    const states = [
      ['up', 'Online'],
      ['down', 'Down'],
      ['configured', 'Configured'],
      ['unconfigured', 'Not set'],
      ['unknown', 'Unknown'],
    ];
    for (const [s, label] of states) {
      const chip = document.createElement('span');
      chip.className = `chip st-key st-${s}`;
      chip.innerHTML = `<span class="dot st-dot"></span>${label}`;
      legend.appendChild(chip);
    }
  }
}

// ---- rules tab (todo-style cards + editor) ----

let ruleState = {
  rules: [],
  notifyOnUnmatched: true,
  storage: 'files',
  activeId: null,
  dirty: false,
};

function getRuleEditor() {
  return document.getElementById('rule-editor');
}

function ruleSubline(rule) {
  const bits = [];
  if (rule.status) bits.push(rule.status);
  bits.push(rule.notify ? 'Telegram' : 'Silent');
  if (!rule.enabled) bits.push('Off');
  return bits.join(' · ');
}

async function loadAndBuildRuleNodes() {
  closeRuleEditor(false);
  let data;
  try {
    const res = await fetch('/api/email/rules', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error('[rules] fetch failed:', e);
    return;
  }

  ruleState.rules = data.rules || [];
  ruleState.notifyOnUnmatched = !!data.notifyOnUnmatched;
  ruleState.storage = data.storage || 'files';

  const nodes = [];
  const groups = [];
  const COL_W = 280;
  const ROW_H = 132;
  const MARGIN = 60;
  let colX = MARGIN;
  let rowY = MARGIN;
  const perCol = 6;

  const ordered = [...ruleState.rules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  ordered.forEach((rule, i) => {
    if (i > 0 && i % perCol === 0) {
      colX += COL_W;
      rowY = MARGIN;
    }
    const id = `er_${rule.id}`;
    nodes.push({
      id,
      title: rule.title || rule.status,
      sub: ruleSubline(rule),
      icon: rule.notify ? '🔔' : '📧',
      hue: rule.enabled === false ? 115 : rule.notify ? 0 : 210,
      ghost: rule.enabled === false,
      cls: 'rule-card',
      x: colX,
      y: rowY,
      _ruleId: rule.id,
    });
    rowY += ROW_H;
  });

  if (nodes.length) {
    groups.push({
      id: 'grp_email_rules',
      title: 'Email rules',
      hue: 165,
      members: nodes.map((n) => n.id),
    });
  }

  MAP.nodes = nodes;
  MAP.groups = groups;
  MAP.edges = [];

  buildMap();
  finishMapLayout();
  buildLegend();
  renderRuleEditorShell();

  for (const n of nodes) {
    const el = nodeEls.get(n.id);
    if (!el) continue;
    attachRuleNodeOpen(n, el);
  }
}

function attachRuleNodeOpen(n, el) {
  let downX = 0;
  let downY = 0;
  let moved = false;
  el.addEventListener('pointerdown', (ev) => {
    downX = ev.clientX;
    downY = ev.clientY;
    moved = false;
  });
  el.addEventListener('pointermove', (ev) => {
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) moved = true;
  });
  el.addEventListener('click', (ev) => {
    if (moved) return;
    ev.stopPropagation();
    openRuleEditor(n._ruleId);
  });
}

function renderRuleEditorShell() {
  const root = getRuleEditor();
  if (!root) return;
  if (ruleState.activeId) return;
  root.classList.remove('re-pane-active');
  root.innerHTML = `
    <div class="re-idle">
      <p>Click a rule card to edit, or use <strong>+</strong> to add one.</p>
      <label class="re-check">
        <input type="checkbox" id="re-notify-unmatched" ${ruleState.notifyOnUnmatched ? 'checked' : ''} />
        Notify Telegram when no rule matches
      </label>
      ${ruleState.storage === 'files' ? '<p class="re-warn">Using local file storage — set DATABASE_URL on Railway for production.</p>' : ''}
    </div>`;
  root.querySelector('#re-notify-unmatched')?.addEventListener('change', async (e) => {
    const notifyOnUnmatched = e.target.checked;
    try {
      const res = await fetch('/api/email/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyOnUnmatched }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ruleState.notifyOnUnmatched = notifyOnUnmatched;
    } catch (err) {
      e.target.checked = !notifyOnUnmatched;
      alert(`Could not save setting: ${err.message}`);
    }
  });
}

function openRuleEditor(id) {
  if (ruleState.dirty && ruleState.activeId && ruleState.activeId !== id) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  ruleState.activeId = id;
  ruleState.dirty = false;
  renderRuleEditorForm();
  getRuleEditor()?.classList.add('re-pane-active');
}

function closeRuleEditor(checkDirty = true) {
  if (checkDirty && ruleState.dirty && !confirm('Discard unsaved changes?')) return;
  ruleState.activeId = null;
  ruleState.dirty = false;
  getRuleEditor()?.classList.remove('re-pane-active');
  renderRuleEditorShell();
}

function renderRuleEditorForm() {
  const root = getRuleEditor();
  const rule = ruleState.rules.find((r) => r.id === ruleState.activeId);
  if (!root || !rule) return;

  root.innerHTML = '';
  root.classList.add('re-pane-active');

  const head = document.createElement('div');
  head.className = 're-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'de-btn de-btn-ghost';
  back.textContent = '← Rules';
  back.addEventListener('click', () => closeRuleEditor());
  head.appendChild(back);
  root.appendChild(head);

  const form = document.createElement('div');
  form.className = 're-form';

  const mkField = (label, el) => {
    const wrap = document.createElement('label');
    wrap.className = 're-field';
    wrap.innerHTML = `<span class="re-label">${label}</span>`;
    wrap.appendChild(el);
    return wrap;
  };

  const titleIn = document.createElement('input');
  titleIn.type = 'text';
  titleIn.value = rule.title || '';
  titleIn.addEventListener('input', () => { ruleState.dirty = true; });

  const statusIn = document.createElement('input');
  statusIn.type = 'text';
  statusIn.value = rule.status || '';
  statusIn.placeholder = 'DOWN, RECEIPT, …';
  statusIn.addEventListener('input', () => { ruleState.dirty = true; });

  const descIn = document.createElement('textarea');
  descIn.rows = 2;
  descIn.value = rule.description || '';
  descIn.addEventListener('input', () => { ruleState.dirty = true; });

  const phrasesIn = document.createElement('textarea');
  phrasesIn.rows = 5;
  phrasesIn.placeholder = 'One keyword or phrase per line';
  phrasesIn.value = (rule.phrases || []).join('\n');
  phrasesIn.addEventListener('input', () => { ruleState.dirty = true; });

  const matchSel = document.createElement('select');
  matchSel.innerHTML = '<option value="any">Any phrase matches</option><option value="all">All phrases must match</option>';
  matchSel.value = rule.matchMode === 'all' ? 'all' : 'any';
  matchSel.addEventListener('change', () => { ruleState.dirty = true; });

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 're-checks';
  const fieldSet = new Set(rule.fields || ['subject', 'body']);
  for (const [val, lab] of [['subject', 'Subject'], ['body', 'Body'], ['from', 'From']]) {
    const lb = document.createElement('label');
    lb.className = 're-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = val;
    cb.checked = fieldSet.has(val);
    cb.addEventListener('change', () => { ruleState.dirty = true; });
    lb.append(cb, document.createTextNode(` ${lab}`));
    fieldsWrap.appendChild(lb);
  }

  const notifyLb = document.createElement('label');
  notifyLb.className = 're-check';
  const notifyCb = document.createElement('input');
  notifyCb.type = 'checkbox';
  notifyCb.checked = !!rule.notify;
  notifyCb.addEventListener('change', () => { ruleState.dirty = true; });
  notifyLb.append(notifyCb, document.createTextNode(' Send Telegram alert'));

  const enabledLb = document.createElement('label');
  enabledLb.className = 're-check';
  const enabledCb = document.createElement('input');
  enabledCb.type = 'checkbox';
  enabledCb.checked = rule.enabled !== false;
  enabledCb.addEventListener('change', () => { ruleState.dirty = true; });
  enabledLb.append(enabledCb, document.createTextNode(' Rule enabled'));

  form.append(
    mkField('Title', titleIn),
    mkField('Status tag', statusIn),
    mkField('Description', descIn),
    mkField('Keywords / phrases', phrasesIn),
    mkField('Match mode', matchSel),
    mkField('Search in', fieldsWrap),
    notifyLb,
    enabledLb
  );
  root.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 're-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'de-btn de-btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () =>
    saveRule(rule.id, {
      titleIn,
      statusIn,
      descIn,
      phrasesIn,
      matchSel,
      fieldsWrap,
      notifyCb,
      enabledCb,
      saveBtn,
    })
  );
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'de-btn de-btn-danger';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => deleteRule(rule.id));
  actions.append(saveBtn, delBtn);
  root.appendChild(actions);
}

function collectRulePayload(inputs) {
  const fields = [];
  inputs.fieldsWrap.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    if (cb.checked) fields.push(cb.value);
  });
  return {
    title: inputs.titleIn.value.trim(),
    status: inputs.statusIn.value.trim(),
    description: inputs.descIn.value.trim(),
    phrases: inputs.phrasesIn.value.split('\n').map((s) => s.trim()).filter(Boolean),
    matchMode: inputs.matchSel.value,
    fields: fields.length ? fields : ['subject', 'body'],
    notify: inputs.notifyCb.checked,
    enabled: inputs.enabledCb.checked,
  };
}

async function saveRule(id, inputs) {
  const payload = collectRulePayload(inputs);
  if (!payload.title || !payload.status) {
    alert('Title and status tag are required.');
    return;
  }
  inputs.saveBtn.disabled = true;
  inputs.saveBtn.textContent = 'Saving…';
  try {
    const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.dirty = false;
    await loadAndBuildRuleNodes();
    openRuleEditor(id);
    inputs.saveBtn.textContent = 'Saved ✓';
  } catch (e) {
    inputs.saveBtn.textContent = 'Save';
    inputs.saveBtn.disabled = false;
    alert(`Save failed: ${e.message}`);
  }
}

async function deleteRule(id) {
  const rule = ruleState.rules.find((r) => r.id === id);
  if (!confirm(`Delete "${rule?.title || 'this rule'}"?`)) return;
  try {
    const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ruleState.dirty = false;
    closeRuleEditor(false);
    await loadAndBuildRuleNodes();
  } catch (e) {
    alert(`Delete failed: ${e.message}`);
  }
}

async function startNewRule() {
  if (ruleState.dirty && !confirm('Discard unsaved changes?')) return;
  try {
    const res = await fetch('/api/email/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New rule',
        status: 'CUSTOM',
        description: '',
        phrases: [],
        matchMode: 'any',
        fields: ['subject', 'body'],
        notify: true,
        enabled: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadAndBuildRuleNodes();
    openRuleEditor(data.rule.id);
  } catch (e) {
    alert(`Could not create rule: ${e.message}`);
  }
}

// ---- todo tab (node/canvas approach) ----

/**
 * Fetch /api/todo, convert sections → MAP nodes + groups, rebuild the canvas.
 * Each file = one group. Each checkbox item = one draggable node.
 * Click the chip icon to toggle done/undone. Drag to reprioritize.
 * Positions are persisted to localStorage like every other map tab.
 */
async function loadAndBuildTodoNodes() {
  let sections;
  try {
    const res = await fetch('/api/todo', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sections = await res.json();
  } catch (e) {
    console.error('[todo] fetch failed:', e);
    return;
  }

  const nodes = [];
  const groups = [];
  const COL_W = 280;
  const ROW_H = 132;
  const MARGIN = 60;

  let colX = MARGIN;
  for (const section of sections) {
    const memberIds = [];
    // Unchecked first, then checked (ghost) at bottom
    const ordered = [
      ...section.items.filter((i) => !i.checked),
      ...section.items.filter((i) => i.checked),
    ];

    let rowY = MARGIN;
    for (const item of ordered) {
      const id = `td_${section.slug}_${item.lineIndex}`;
      memberIds.push(id);
      const label = item.text.length > 44 ? item.text.slice(0, 43) + '…' : item.text;
      nodes.push({
        id,
        title: label,
        sub: section.title,
        icon: item.checked ? '✅' : '☐',
        hue: item.checked ? 115 : 220,
        ghost: item.checked,
        x: colX,
        y: rowY,
        // private: not part of MAP schema, used by toggle handler below
        _slug: section.slug,
        _lineIndex: item.lineIndex,
        _checked: item.checked,
        _fullText: item.text,
      });
      rowY += ROW_H;
    }

    if (memberIds.length > 0) {
      groups.push({
        id: `grp_${section.slug}`,
        title: section.title,
        hue: 220,
        members: memberIds,
      });
    }
    colX += COL_W;
  }

  // Swap MAP content in-place so the existing position store key ('todo') still applies.
  MAP.nodes = nodes;
  MAP.groups = groups;
  MAP.edges = [];

  buildMap();
  finishMapLayout();
  buildLegend();

  // Wire up click-to-toggle on each node's chip after the DOM is built.
  for (const n of nodes) {
    const el = nodeEls.get(n.id);
    if (!el) continue;
    if (n._fullText && n._fullText !== n.title) el.title = n._fullText;
    el.classList.toggle('todo-done', n._checked);
    const chip = el.querySelector('.chip');
    if (!chip) continue;
    chip.style.cursor = 'pointer';
    chip.title = n._checked ? 'Mark as undone' : 'Mark as done';
    // Prevent drag start when clicking the chip.
    chip.addEventListener('pointerdown', (e) => e.stopPropagation());
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const newChecked = !n._checked;
      // Optimistic DOM update
      n._checked = newChecked;
      n.icon = newChecked ? '✅' : '☐';
      chip.textContent = n.icon;
      chip.title = newChecked ? 'Mark as undone' : 'Mark as done';
      el.classList.toggle('ghost', newChecked);
      el.classList.toggle('todo-done', newChecked);
      el.style.setProperty('--h', newChecked ? 115 : 220);
      // Persist to file
      fetch('/api/todo/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: n._slug, lineIndex: n._lineIndex, checked: newChecked }),
      }).catch((err) => {
        // Revert on network error
        n._checked = !newChecked;
        n.icon = !newChecked ? '✅' : '☐';
        chip.textContent = n.icon;
        chip.title = !newChecked ? 'Mark as undone' : 'Mark as done';
        el.classList.toggle('ghost', !newChecked);
        el.classList.toggle('todo-done', !newChecked);
        el.style.setProperty('--h', !newChecked ? 115 : 220);
        console.error('[todo] toggle error:', err);
      });
    });
  }
}

// ---- documents tab ----

let docState = {
  templates: [],    // [{ slug, title }]
  shortcodes: [],   // [{ code, token, label, description, category }]
  activeSlug: null,
  dirty: false,
  paneMode: 'edit', // 'edit' | 'view'
};

function getDocEditor() { return document.getElementById('doc-editor'); }

async function loadDocumentsTab() {
  const root = getDocEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading templates…</div>';
  try {
    const [templatesRes, shortcodesRes] = await Promise.all([
      fetch('/api/documents', { cache: 'no-store' }),
      fetch('/api/documents/shortcodes', { cache: 'no-store' }),
    ]);
    if (!templatesRes.ok) throw new Error(`HTTP ${templatesRes.status}`);
    docState.templates = await templatesRes.json();
    docState.shortcodes = shortcodesRes.ok ? await shortcodesRes.json() : [];
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load templates: ${e.message}</div>`;
    return;
  }
  docState.activeSlug = null;
  docState.dirty = false;
  getDocEditor()?.classList.remove('de-pane-active');
  renderDocEditor();
}

function renderDocEditor() {
  const root = getDocEditor();
  if (!root) return;
  const { templates, activeSlug, dirty } = docState;

  root.innerHTML = '';

  // ── Sidebar ──
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const toolbar = document.createElement('div');
  toolbar.className = 'ch-toolbar';
  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn ch-new-btn';
  newBtn.textContent = '+ New Document';
  newBtn.addEventListener('click', () => startNewDocument());
  toolbar.appendChild(newBtn);
  sidebar.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const tpl of templates) {
    list.appendChild(createDocumentSwipeRow(tpl));
  }
  if (templates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'No templates yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);

  // ── Shortcodes directory ──
  const shortcodes = docState.shortcodes || [];
  if (shortcodes.length > 0) {
    const scDir = document.createElement('div');
    scDir.className = 'de-sc-dir';

    const scHdr = document.createElement('div');
    scHdr.className = 'de-sc-dir-hdr';
    scHdr.innerHTML = '<span>Shortcodes</span><span class="de-sc-dir-hint">type { to insert</span>';
    scDir.appendChild(scHdr);

    const scBody = document.createElement('div');
    scBody.className = 'de-sc-dir-body';

    const categories = [...new Set(shortcodes.map((s) => s.category))];
    for (const cat of categories) {
      const catLabel = document.createElement('div');
      catLabel.className = 'de-sc-dir-cat';
      catLabel.textContent = cat;
      scBody.appendChild(catLabel);

      for (const sc of shortcodes.filter((s) => s.category === cat)) {
        const item = document.createElement('div');
        item.className = 'de-sc-dir-item';
        item.title = sc.description;
        item.innerHTML = `<code class="de-sc-token">${escHtml(sc.token)}</code><span class="de-sc-lbl">${escHtml(sc.label)}</span>`;
        // Click-to-copy
        item.addEventListener('click', () => {
          navigator.clipboard?.writeText(sc.token).catch(() => {});
          item.classList.add('de-sc-copied');
          setTimeout(() => item.classList.remove('de-sc-copied'), 1200);
        });
        scBody.appendChild(item);
      }
    }

    scDir.appendChild(scBody);
    sidebar.appendChild(scDir);
  }

  root.appendChild(sidebar);

  // ── Editor pane ──
  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeSlug === '__new__') {
    renderNewForm(pane);
  } else if (activeSlug) {
    renderEditForm(pane);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'de-placeholder';
    placeholder.innerHTML = `<div class="de-placeholder-icon">📄</div><p>Select a template to edit, or create a new one.</p>`;
    pane.appendChild(placeholder);
  }

  root.appendChild(pane);
}

function renderNewForm(pane) {
  pane.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'de-header';
  const backBtn = document.createElement('button');
  backBtn.className = 'de-back-btn';
  backBtn.innerHTML = '‹ Back';
  backBtn.addEventListener('click', () => backToList());
  header.appendChild(backBtn);
  const nameEl = document.createElement('span');
  nameEl.className = 'de-doc-name';
  nameEl.textContent = 'New Document';
  header.appendChild(nameEl);
  pane.appendChild(header);

  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const slugLabel = document.createElement('label');
  slugLabel.className = 'de-label';
  slugLabel.textContent = 'Filename (slug)';
  const slugInput = document.createElement('input');
  slugInput.className = 'de-input';
  slugInput.type = 'text';
  slugInput.placeholder = 'e.g. service-agreement';
  slugInput.pattern = '[a-zA-Z0-9_-]+';
  slugInput.id = 'de-new-slug';
  slugLabel.appendChild(slugInput);
  fields.appendChild(slugLabel);
  pane.appendChild(fields);

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.id = 'de-new-html';
  ta.spellcheck = false;
  ta.placeholder = '<!-- title: My Document -->\n<h1>Title</h1>\n<p>Content…</p>';
  attachShortcodePopover(ta);
  pane.appendChild(ta);

  const actions = document.createElement('div');
  actions.className = 'de-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'de-btn de-btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    docState.activeSlug = null;
    docState.dirty = false;
    renderDocEditor();
  });
  const createBtn = document.createElement('button');
  createBtn.className = 'de-btn de-btn-primary';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => createDocument(slugInput.value.trim(), ta.value));
  actions.appendChild(cancelBtn);
  actions.appendChild(createBtn);
  pane.appendChild(actions);
}

function renderEditForm(pane) {
  const slug = docState.activeSlug;
  const tpl = docState.templates.find((t) => t.slug === slug);
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/documents/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ html }) => {
      pane.innerHTML = '';

      // ── Header ──
      const header = document.createElement('div');
      header.className = 'de-header';

      const backBtn2 = document.createElement('button');
      backBtn2.className = 'de-back-btn';
      backBtn2.innerHTML = '‹ Back';
      backBtn2.addEventListener('click', () => backToList());
      header.appendChild(backBtn2);

      const nameEl2 = document.createElement('span');
      nameEl2.className = 'de-doc-name';
      nameEl2.textContent = tpl?.title ?? slug;
      header.appendChild(nameEl2);

      const slugEl = document.createElement('span');
      slugEl.className = 'de-doc-slug';
      slugEl.textContent = `${slug}.html`;
      header.appendChild(slugEl);

      // Edit / View toggle
      const headerSpacer = document.createElement('span');
      headerSpacer.style.flex = '1';
      header.appendChild(headerSpacer);

      const modeTabs = document.createElement('div');
      modeTabs.className = 'de-mode-tabs';

      const editTab = document.createElement('button');
      editTab.className = 'de-mode-tab' + (docState.paneMode !== 'view' ? ' active' : '');
      editTab.textContent = 'Edit';

      const viewTab = document.createElement('button');
      viewTab.className = 'de-mode-tab' + (docState.paneMode === 'view' ? ' active' : '');
      viewTab.textContent = 'View';

      modeTabs.appendChild(editTab);
      modeTabs.appendChild(viewTab);
      header.appendChild(modeTabs);
      pane.appendChild(header);

      // ── Textarea (edit mode) ──
      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.id = `de-edit-${slug}`;
      ta.spellcheck = false;
      ta.value = html;
      ta.addEventListener('input', () => { docState.dirty = true; updateSaveBtn(); });
      attachShortcodePopover(ta);

      // ── Preview iframe (view mode, sandboxed — no scripts) ──
      const preview = document.createElement('iframe');
      preview.className = 'de-preview';
      preview.setAttribute('sandbox', 'allow-same-origin');
      preview.srcdoc = html;
      preview.title = 'Document preview';

      if (docState.paneMode === 'view') {
        ta.style.display = 'none';
      } else {
        preview.style.display = 'none';
      }

      pane.appendChild(ta);
      pane.appendChild(preview);

      // ── Actions bar (hidden in view mode) ──
      const actions = document.createElement('div');
      actions.className = 'de-actions';
      if (docState.paneMode === 'view') actions.style.display = 'none';

      const delBtn = document.createElement('button');
      delBtn.className = 'de-btn de-btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteDocument(slug));

      const spacer = document.createElement('span');
      spacer.style.flex = '1';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'de-btn de-btn-primary';
      saveBtn.id = 'de-save-btn';
      saveBtn.textContent = 'Save';
      saveBtn.disabled = !docState.dirty;
      saveBtn.addEventListener('click', () => saveDocument(slug, ta.value, saveBtn));

      actions.appendChild(delBtn);
      actions.appendChild(spacer);
      actions.appendChild(saveBtn);
      pane.appendChild(actions);

      // ── Tab switching ──
      editTab.addEventListener('click', () => {
        docState.paneMode = 'edit';
        editTab.classList.add('active');
        viewTab.classList.remove('active');
        ta.style.display = '';
        preview.style.display = 'none';
        actions.style.display = '';
      });

      viewTab.addEventListener('click', () => {
        docState.paneMode = 'view';
        viewTab.classList.add('active');
        editTab.classList.remove('active');
        preview.srcdoc = ta.value;
        ta.style.display = 'none';
        preview.style.display = '';
        actions.style.display = 'none';
      });
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">Failed to load: ${e.message}</div>`;
    });
}

function updateSaveBtn() {
  const btn = document.getElementById('de-save-btn');
  if (btn) btn.disabled = !docState.dirty;
}

async function openDocument(slug) {
  if (docState.dirty && !confirm('Discard unsaved changes?')) return;
  docState.activeSlug = slug;
  docState.dirty = false;
  docState.paneMode = 'edit';
  renderDocEditor();
  getDocEditor()?.classList.add('de-pane-active');
}

function startNewDocument() {
  if (docState.dirty && !confirm('Discard unsaved changes?')) return;
  docState.activeSlug = '__new__';
  docState.dirty = false;
  renderDocEditor();
  getDocEditor()?.classList.add('de-pane-active');
}

function backToList() {
  if (docState.dirty && !confirm('Discard unsaved changes?')) return;
  docState.activeSlug = null;
  docState.dirty = false;
  getDocEditor()?.classList.remove('de-pane-active');
  renderDocEditor();
}

async function createDocument(slug, html) {
  if (!slug) { alert('Please enter a filename (slug).'); return; }
  if (!/^[a-z0-9_-]+$/i.test(slug)) { alert('Slug may only contain letters, numbers, hyphens, and underscores.'); return; }
  if (!html.trim()) { alert('HTML content cannot be empty.'); return; }
  try {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, html }),
    });
    if (res.status === 409) { alert('A template with that slug already exists.'); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.dirty = false;
    await loadDocumentsTab();
    docState.activeSlug = slug;
    renderDocEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveDocument(slug, html, btn) {
  btn.textContent = 'Saving…';
  btn.disabled = true;
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.dirty = false;
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Save'; btn.disabled = true; }, 1800);
    // Refresh title in sidebar in case <!-- title: --> changed
    const newTitle = html.match(/<!--\s*title:\s*(.+?)\s*-->/i)?.[1]?.trim()
      ?? slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const tpl = docState.templates.find((t) => t.slug === slug);
    if (tpl) tpl.title = newTitle;
    document.querySelector(`.ch-list-item[data-slug="${CSS.escape(slug)}"] .ch-item-title`)
      ?.replaceWith(Object.assign(document.createElement('span'), { className: 'ch-item-title', textContent: newTitle }));
  } catch (e) {
    btn.textContent = 'Save';
    btn.disabled = false;
    alert(`Failed to save: ${e.message}`);
  }
}

async function deleteDocument(slug) {
  closeOpenSwipeRow();
  const tpl = docState.templates.find((t) => t.slug === slug);
  if (!confirm(`Delete "${tpl?.title ?? slug}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.activeSlug = null;
    docState.dirty = false;
    getDocEditor()?.classList.remove('de-pane-active');
    await loadDocumentsTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

// ---- shortcode popover ----

let _scPop = null;          // singleton popover element
let _scTriggerIdx = -1;     // textarea index where { or [ was typed
let _scTa = null;           // active textarea
let _scItems = [];          // currently shown shortcodes
let _scSel = 0;             // selected row index

function _getScPop() {
  if (!_scPop) {
    _scPop = document.createElement('div');
    _scPop.className = 'de-sc-pop';
    _scPop.setAttribute('role', 'listbox');
    document.body.appendChild(_scPop);
  }
  return _scPop;
}

// Canvas-based monospace cursor X measurement.
let _scCanvas = null;
function _caretPixelPos(ta) {
  const computed = window.getComputedStyle(ta);
  const rect = ta.getBoundingClientRect();
  const lh = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.5;
  const pt = parseFloat(computed.paddingTop) || 0;
  const pl = parseFloat(computed.paddingLeft) || 0;

  const textBefore = ta.value.slice(0, ta.selectionStart);
  const lines = textBefore.split('\n');
  const lineIdx = lines.length - 1;
  const col = lines[lineIdx];

  if (!_scCanvas) _scCanvas = document.createElement('canvas');
  const ctx = _scCanvas.getContext('2d');
  ctx.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  const colW = ctx.measureText(col).width;

  const rawX = rect.left + pl + colW - ta.scrollLeft;
  const rawY = rect.top + pt + lineIdx * lh - ta.scrollTop + lh + 4;

  // Clamp so popover stays in viewport
  const popW = 280;
  const popMaxH = 260;
  const x = Math.min(Math.max(rawX, 8), window.innerWidth - popW - 8);
  const y = rawY + popMaxH > window.innerHeight
    ? rawY - popMaxH - lh - 8
    : rawY;

  return { x, y };
}

function _renderScPop(ta, query) {
  const all = docState.shortcodes || [];
  const q = (query || '').toLowerCase();
  _scItems = q
    ? all.filter((sc) => sc.code.toLowerCase().includes(q) || sc.label.toLowerCase().includes(q))
    : all;
  _scSel = 0;

  const pop = _getScPop();

  if (_scItems.length === 0) { pop.style.display = 'none'; return; }

  pop.innerHTML = '';
  for (let i = 0; i < _scItems.length; i++) {
    const sc = _scItems[i];
    const row = document.createElement('div');
    row.className = 'de-sc-pop-row' + (i === 0 ? ' active' : '');
    row.setAttribute('role', 'option');
    row.innerHTML = `<code class="de-sc-pop-token">${escHtml(sc.token)}</code><span class="de-sc-pop-lbl">${escHtml(sc.label)}</span>`;
    row.addEventListener('mousedown', (e) => { e.preventDefault(); _insertSc(ta, sc.token); });
    pop.appendChild(row);
  }

  const { x, y } = _caretPixelPos(ta);
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  pop.style.display = 'block';
}

function _hideScPop() {
  if (_scPop) _scPop.style.display = 'none';
  _scTriggerIdx = -1;
  _scTa = null;
}

function _moveSc(delta) {
  if (!_scItems.length) return;
  _scSel = (_scSel + delta + _scItems.length) % _scItems.length;
  const rows = _scPop?.querySelectorAll('.de-sc-pop-row') || [];
  rows.forEach((r, i) => r.classList.toggle('active', i === _scSel));
  rows[_scSel]?.scrollIntoView({ block: 'nearest' });
}

function _insertSc(ta, token) {
  const start = _scTriggerIdx;
  const end = ta.selectionStart;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  ta.value = before + token + after;
  ta.selectionStart = ta.selectionEnd = start + token.length;
  ta.dispatchEvent(new Event('input'));
  _hideScPop();
  ta.focus();
}

function attachShortcodePopover(ta) {
  ta.addEventListener('keydown', (e) => {
    if (_scTriggerIdx < 0 || _scPop?.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _moveSc(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _moveSc(-1); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const sc = _scItems[_scSel];
      if (sc) { e.preventDefault(); _insertSc(ta, sc.token); }
    } else if (e.key === 'Escape') { _hideScPop(); }
  });

  ta.addEventListener('input', () => {
    const pos = ta.selectionStart;
    const text = ta.value;

    // Walk backwards from cursor to find an open { or [ with no closing bracket/newline between
    let trigIdx = -1;
    for (let i = pos - 1; i >= Math.max(0, pos - 80); i--) {
      const ch = text[i];
      if (ch === '{' || ch === '[') { trigIdx = i; break; }
      if (ch === '}' || ch === ']' || ch === '\n') break;
    }

    if (trigIdx >= 0) {
      _scTriggerIdx = trigIdx;
      _scTa = ta;
      _renderScPop(ta, text.slice(trigIdx + 1, pos));
    } else {
      _hideScPop();
    }
  });

  ta.addEventListener('blur', () => setTimeout(_hideScPop, 160));
  ta.addEventListener('scroll', () => {
    if (_scTriggerIdx >= 0 && _scPop?.style.display !== 'none') {
      const { x, y } = _caretPixelPos(ta);
      if (_scPop) { _scPop.style.left = `${x}px`; _scPop.style.top = `${y}px`; }
    }
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- knowledge tab ----

let knowledgeState = {
  entries: [],
  activeSlug: null,
  dirty: false,
  content: '',
};

function getKnowledgeEditor() { return document.getElementById('knowledge-editor'); }

async function loadKnowledgeTab() {
  const root = getKnowledgeEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading knowledge…</div>';
  try {
    const res = await fetch('/api/knowledge', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.entries = data.entries || [];
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }
  knowledgeState.activeSlug = null;
  knowledgeState.dirty = false;
  knowledgeState.content = '';
  getKnowledgeEditor()?.classList.remove('de-pane-active');
  renderKnowledgeEditor();
}

function renderKnowledgeEditor() {
  const root = getKnowledgeEditor();
  if (!root) return;
  const { entries, activeSlug, dirty } = knowledgeState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const toolbar = document.createElement('div');
  toolbar.className = 'ch-toolbar';
  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn ch-new-btn';
  newBtn.textContent = '+ New Doc';
  newBtn.addEventListener('click', () => {
    knowledgeState.activeSlug = '__new__';
    knowledgeState.dirty = false;
    renderKnowledgeEditor();
  });
  toolbar.appendChild(newBtn);
  sidebar.appendChild(toolbar);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.65rem 0.5rem';
  hint.textContent = 'Markdown in src/knowledge/ · bot reads on deploy';
  sidebar.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const entry of entries) {
    list.appendChild(createKnowledgeSwipeRow(entry));
  }
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'No knowledge files yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeSlug === '__new__') {
    renderNewKnowledgeForm(pane);
  } else if (activeSlug) {
    renderEditKnowledgeForm(pane);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'de-placeholder';
    placeholder.innerHTML = '<div class="de-placeholder-icon">📚</div><p>Select a doc to edit, or create a new one.</p>';
    pane.appendChild(placeholder);
  }

  root.appendChild(pane);
}

function renderNewKnowledgeForm(pane) {
  pane.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'de-header';
  const backBtn = document.createElement('button');
  backBtn.className = 'de-back-btn';
  backBtn.textContent = '← Docs';
  backBtn.addEventListener('click', () => {
    knowledgeState.activeSlug = null;
    getKnowledgeEditor()?.classList.remove('de-pane-active');
    renderKnowledgeEditor();
  });
  header.appendChild(backBtn);
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name';
  titleEl.textContent = 'New knowledge doc';
  header.appendChild(titleEl);
  pane.appendChild(header);

  const fields = document.createElement('div');
  fields.className = 'de-fields';
  const slugLabel = document.createElement('label');
  slugLabel.className = 'de-label';
  slugLabel.textContent = 'Slug (filename)';
  const slugInput = document.createElement('input');
  slugInput.className = 'de-input';
  slugInput.placeholder = 'e.g. billing-notes';
  slugLabel.appendChild(slugInput);
  fields.appendChild(slugLabel);
  pane.appendChild(fields);

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.spellcheck = false;
  ta.placeholder = '# Title\n\nMarkdown content for the Telegram agent…';
  pane.appendChild(ta);

  const actions = document.createElement('div');
  actions.className = 'de-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'de-btn de-btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    knowledgeState.activeSlug = null;
    renderKnowledgeEditor();
  });
  const createBtn = document.createElement('button');
  createBtn.className = 'de-btn de-btn-primary';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => createKnowledge(slugInput.value.trim(), ta.value));
  actions.appendChild(cancelBtn);
  actions.appendChild(createBtn);
  pane.appendChild(actions);
  getKnowledgeEditor()?.classList.add('de-pane-active');
}

function renderEditKnowledgeForm(pane) {
  const slug = knowledgeState.activeSlug;
  const entry = knowledgeState.entries.find((e) => e.slug === slug);
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/knowledge/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      knowledgeState.content = data.content;
      knowledgeState.dirty = false;
      pane.innerHTML = '';

      const header = document.createElement('div');
      header.className = 'de-header';
      const backBtn = document.createElement('button');
      backBtn.className = 'de-back-btn';
      backBtn.textContent = '← Docs';
      backBtn.addEventListener('click', () => {
        if (knowledgeState.dirty && !confirm('Discard unsaved changes?')) return;
        knowledgeState.activeSlug = null;
        knowledgeState.dirty = false;
        getKnowledgeEditor()?.classList.remove('de-pane-active');
        renderKnowledgeEditor();
      });
      header.appendChild(backBtn);
      const titleEl = document.createElement('span');
      titleEl.className = 'de-doc-name';
      titleEl.textContent = data.title || entry?.title || slug;
      header.appendChild(titleEl);
      const slugEl = document.createElement('span');
      slugEl.className = 'de-doc-slug';
      slugEl.textContent = slug;
      header.appendChild(slugEl);
      pane.appendChild(header);

      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.spellcheck = false;
      ta.value = data.content;
      ta.addEventListener('input', () => {
        knowledgeState.dirty = ta.value !== knowledgeState.content;
      });
      pane.appendChild(ta);

      const actions = document.createElement('div');
      actions.className = 'de-actions';
      const delBtn = document.createElement('button');
      delBtn.className = 'de-btn de-btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteKnowledge(slug));
      const saveBtn = document.createElement('button');
      saveBtn.className = 'de-btn de-btn-primary';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => saveKnowledge(slug, ta.value));
      actions.appendChild(delBtn);
      actions.appendChild(saveBtn);
      pane.appendChild(actions);
      getKnowledgeEditor()?.classList.add('de-pane-active');
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    });
}

async function openKnowledge(slug) {
  if (knowledgeState.dirty && knowledgeState.activeSlug && !confirm('Discard unsaved changes?')) return;
  knowledgeState.activeSlug = slug;
  knowledgeState.dirty = false;
  renderKnowledgeEditor();
}

async function createKnowledge(slug, content) {
  if (!slug) { alert('Enter a slug.'); return; }
  if (!/^[a-z0-9._-]+$/i.test(slug)) { alert('Slug may only contain letters, numbers, dots, hyphens, and underscores.'); return; }
  if (!content.trim()) { alert('Content cannot be empty.'); return; }
  try {
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, content }),
    });
    const data = await res.json();
    if (res.status === 409) { alert('That slug already exists.'); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadKnowledgeTab();
    knowledgeState.activeSlug = slug;
    renderKnowledgeEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveKnowledge(slug, content) {
  if (!content.trim()) { alert('Content cannot be empty.'); return; }
  try {
    const res = await fetch(`/api/knowledge/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.content = content;
    knowledgeState.dirty = false;
    await loadKnowledgeTab();
    knowledgeState.activeSlug = slug;
    renderKnowledgeEditor();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

async function deleteKnowledge(slug) {
  closeOpenSwipeRow();
  if (!confirm(`Delete "${slug}.md"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/knowledge/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.activeSlug = null;
    knowledgeState.dirty = false;
    await loadKnowledgeTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

// ---- work tab ----

const WORK_STATUS_LABELS = {
  inquiry: 'Inquiry',
  active: 'Active',
  done: 'Done',
  archived: 'Archived',
};

const WORK_PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const WORK_SOURCE_SUGGESTIONS = ['instagram', 'email', 'referral', 'phone'];

let workState = {
  jobs: [],
  statuses: ['inquiry', 'active', 'done', 'archived'],
  priorities: ['low', 'normal', 'high', 'urgent'],
  activeSlug: null,
  dirty: false,
  draft: null,
};

function getWorkEditor() { return document.getElementById('work-editor'); }

function workStatusClass(status) {
  return `wk-status wk-status-${status || 'inquiry'}`;
}

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function loadWorkTab() {
  const root = getWorkEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading work…</div>';
  try {
    const res = await fetch('/api/work', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    workState.jobs = data.jobs || [];
    workState.statuses = data.statuses || workState.statuses;
    workState.priorities = data.priorities || workState.priorities;
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }
  workState.activeSlug = null;
  workState.dirty = false;
  workState.draft = null;
  getWorkEditor()?.classList.remove('de-pane-active');
  renderWorkEditor();
}

function renderWorkEditor() {
  const root = getWorkEditor();
  if (!root) return;
  const { jobs, activeSlug } = workState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const toolbar = document.createElement('div');
  toolbar.className = 'ch-toolbar';
  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn ch-new-btn';
  newBtn.textContent = '+ New Job';
  newBtn.addEventListener('click', () => {
    workState.activeSlug = '__new__';
    workState.dirty = false;
    workState.draft = {
      title: '',
      contact_uid: '',
      contact_name: '',
      status: 'inquiry',
      priority: 'normal',
      due_date: '',
      value: '',
      tags: '',
      source: '',
      body: '',
    };
    renderWorkEditor();
  });
  toolbar.appendChild(newBtn);
  sidebar.appendChild(toolbar);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.65rem 0.5rem';
  hint.textContent = 'Jobs in src/knowledge/jobs/ · pick or add a client';
  sidebar.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const job of jobs) {
    list.appendChild(createWorkSwipeRow(job));
  }
  if (jobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'No jobs yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeSlug === '__new__') {
    renderNewWorkForm(pane);
  } else if (activeSlug) {
    renderEditWorkForm(pane);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'de-placeholder';
    placeholder.innerHTML = '<div class="de-placeholder-icon">💼</div><p>Select a job to edit, or create a new one.</p>';
    pane.appendChild(placeholder);
  }

  root.appendChild(pane);
}

function buildStatusSelect(value) {
  const select = document.createElement('select');
  select.className = 'de-input';
  for (const s of workState.statuses) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = WORK_STATUS_LABELS[s] || s;
    if (s === value) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

function buildPrioritySelect(value) {
  const select = document.createElement('select');
  select.className = 'de-input';
  for (const p of workState.priorities) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = WORK_PRIORITY_LABELS[p] || p;
    if (p === (value || 'normal')) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

function appendWorkMetaFields(fields, draft, markDirty) {
  const priorityLabel = document.createElement('label');
  priorityLabel.className = 'de-label';
  priorityLabel.textContent = 'Priority';
  const prioritySelect = buildPrioritySelect(draft?.priority || 'normal');
  priorityLabel.appendChild(prioritySelect);
  fields.appendChild(priorityLabel);

  const dueLabel = document.createElement('label');
  dueLabel.className = 'de-label';
  dueLabel.textContent = 'Due date';
  const dueInput = document.createElement('input');
  dueInput.className = 'de-input';
  dueInput.type = 'date';
  dueInput.value = draft?.due_date || '';
  dueLabel.appendChild(dueInput);
  fields.appendChild(dueLabel);

  const valueLabel = document.createElement('label');
  valueLabel.className = 'de-label';
  valueLabel.textContent = 'Value ($)';
  const valueInput = document.createElement('input');
  valueInput.className = 'de-input';
  valueInput.type = 'number';
  valueInput.min = '0';
  valueInput.step = '0.01';
  valueInput.placeholder = '0.00';
  valueInput.value = draft?.value != null && draft?.value !== '' ? String(draft.value) : '';
  valueLabel.appendChild(valueInput);
  fields.appendChild(valueLabel);

  const tagsLabel = document.createElement('label');
  tagsLabel.className = 'de-label';
  tagsLabel.textContent = 'Tags';
  const tagsInput = document.createElement('input');
  tagsInput.className = 'de-input';
  tagsInput.placeholder = 'web-design, seo, hosting';
  tagsInput.value = Array.isArray(draft?.tags) ? draft.tags.join(', ') : (draft?.tags || '');
  tagsLabel.appendChild(tagsInput);
  fields.appendChild(tagsLabel);

  const sourceLabel = document.createElement('label');
  sourceLabel.className = 'de-label';
  sourceLabel.textContent = 'Lead source';
  const sourceInput = document.createElement('input');
  sourceInput.className = 'de-input';
  sourceInput.placeholder = 'instagram, email, referral, phone';
  sourceInput.setAttribute('list', 'wk-source-suggestions');
  sourceInput.value = draft?.source || '';
  sourceLabel.appendChild(sourceInput);
  fields.appendChild(sourceLabel);
  let datalist = document.getElementById('wk-source-suggestions');
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = 'wk-source-suggestions';
    for (const s of WORK_SOURCE_SUGGESTIONS) {
      const opt = document.createElement('option');
      opt.value = s;
      datalist.appendChild(opt);
    }
    document.body.appendChild(datalist);
  }

  if (markDirty) {
    prioritySelect.addEventListener('change', markDirty);
    dueInput.addEventListener('input', markDirty);
    valueInput.addEventListener('input', markDirty);
    tagsInput.addEventListener('input', markDirty);
    sourceInput.addEventListener('input', markDirty);
  }

  return {
    getPayload() {
      const valueRaw = valueInput.value.trim();
      return {
        priority: prioritySelect.value,
        due_date: dueInput.value.trim() || null,
        value: valueRaw === '' ? null : Number(valueRaw),
        tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
        source: sourceInput.value.trim(),
      };
    },
  };
}

let workClientSearchTimer = null;

function workClientSubline(c) {
  return c.email || c.company || c.phone || c.uid.slice(0, 8) + '…';
}

/**
 * Client combobox: search existing contacts, pick one, or add new inline.
 * Returns { getPayload, isValid } — save uses contact_uid (no resolve on save).
 */
function mountWorkClientPicker(parent, initial, onChange) {
  let selected = initial?.contact_uid
    ? { uid: initial.contact_uid, name: initial.contact_name || initial.client || '' }
    : null;
  let changing = false;
  let showingNew = false;

  const wrap = document.createElement('div');
  wrap.className = 'wk-client-picker';

  const label = document.createElement('span');
  label.className = 'de-label';
  label.textContent = 'Client';
  wrap.appendChild(label);

  const selectedEl = document.createElement('div');
  selectedEl.className = 'wk-client-selected';
  const selectedName = document.createElement('span');
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'de-btn de-btn-ghost';
  changeBtn.textContent = 'Change';
  selectedEl.appendChild(selectedName);
  selectedEl.appendChild(changeBtn);
  wrap.appendChild(selectedEl);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search clients…';
  searchInput.autocomplete = 'off';
  searchWrap.appendChild(searchInput);
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(dropdown);
  wrap.appendChild(searchWrap);

  const newForm = document.createElement('div');
  newForm.className = 'wk-client-new';
  newForm.style.display = 'none';
  newForm.innerHTML = '<span class="de-label">New client</span>';
  const newName = document.createElement('input');
  newName.className = 'de-input';
  newName.placeholder = 'Full name (required)';
  const newEmail = document.createElement('input');
  newEmail.className = 'de-input';
  newEmail.type = 'email';
  newEmail.placeholder = 'Email (optional)';
  const newActions = document.createElement('div');
  newActions.className = 'wk-client-new-actions';
  const newCancel = document.createElement('button');
  newCancel.type = 'button';
  newCancel.className = 'de-btn de-btn-ghost';
  newCancel.textContent = 'Cancel';
  const newSave = document.createElement('button');
  newSave.type = 'button';
  newSave.className = 'de-btn de-btn-primary';
  newSave.textContent = 'Create client';
  newActions.appendChild(newCancel);
  newActions.appendChild(newSave);
  newForm.appendChild(newName);
  newForm.appendChild(newEmail);
  newForm.appendChild(newActions);
  wrap.appendChild(newForm);

  parent.appendChild(wrap);

  function syncView() {
    const has = !!selected?.uid;
    selectedEl.style.display = has && !showingNew && !changing ? 'flex' : 'none';
    searchWrap.style.display = showingNew ? 'none' : changing || !has ? 'block' : 'none';
    newForm.style.display = showingNew ? 'flex' : 'none';
    if (has) selectedName.textContent = selected.name;
  }

  function exitChangeMode() {
    changing = false;
    searchInput.value = '';
    dropdown.style.display = 'none';
    syncView();
  }

  function pick(client) {
    const prevUid = selected?.uid || '';
    selected = { uid: client.uid, name: client.name };
    showingNew = false;
    changing = false;
    dropdown.style.display = 'none';
    searchInput.value = '';
    syncView();
    if (client.uid !== prevUid) onChange?.();
  }

  function renderDropdown(clients, query) {
    dropdown.innerHTML = '';
    for (const c of clients) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      btn.innerHTML = `${escHtml(c.name)}<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      btn.addEventListener('click', () => pick(c));
      dropdown.appendChild(btn);
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'wk-client-option wk-client-add';
    addBtn.textContent = query.trim() ? `+ Add "${query.trim()}" as new client` : '+ Add new client';
    addBtn.addEventListener('click', () => {
      showingNew = true;
      newName.value = query.trim();
      newEmail.value = '';
      dropdown.style.display = 'none';
      syncView();
      newName.focus();
    });
    dropdown.appendChild(addBtn);
    dropdown.style.display = 'block';
  }

  async function fetchClients(q) {
    const params = new URLSearchParams();
    if (q?.trim()) params.set('q', q.trim());
    params.set('limit', '20');
    const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.clients || [];
  }

  function scheduleSearch() {
    clearTimeout(workClientSearchTimer);
    workClientSearchTimer = setTimeout(async () => {
      try {
        const clients = await fetchClients(searchInput.value);
        renderDropdown(clients, searchInput.value);
      } catch (e) {
        dropdown.innerHTML = `<div class="de-empty">${escHtml(e.message)}</div>`;
        dropdown.style.display = 'block';
      }
    }, 250);
  }

  changeBtn.addEventListener('click', () => {
    showingNew = false;
    changing = true;
    syncView();
    searchInput.focus();
    scheduleSearch();
  });

  searchInput.addEventListener('focus', () => scheduleSearch());
  searchInput.addEventListener('input', () => scheduleSearch());
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!wrap.contains(document.activeElement) && changing && !showingNew) exitChangeMode();
    }, 0);
  });

  newCancel.addEventListener('click', () => {
    showingNew = false;
    changing = !selected?.uid;
    syncView();
    if (changing) searchInput.focus();
  });

  newSave.addEventListener('click', async () => {
    const name = newName.value.trim();
    if (!name) { alert('Enter a client name.'); return; }
    newSave.disabled = true;
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: newEmail.value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      pick({ uid: data.uid, name: data.name });
    } catch (e) {
      alert(`Failed to create client: ${e.message}`);
    } finally {
      newSave.disabled = false;
    }
  });

  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) {
      dropdown.style.display = 'none';
      if (changing && !showingNew) exitChangeMode();
    }
  });

  syncView();

  return {
    getPayload() {
      if (!selected?.uid) return null;
      return { contact_uid: selected.uid, contact_name: selected.name };
    },
    isValid: () => !!selected?.uid,
    getSelectedUid: () => selected?.uid || '',
  };
}

function renderNewWorkForm(pane) {
  pane.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'de-header';
  const backBtn = document.createElement('button');
  backBtn.className = 'de-back-btn';
  backBtn.textContent = '← Jobs';
  backBtn.addEventListener('click', () => {
    workState.activeSlug = null;
    workState.draft = null;
    getWorkEditor()?.classList.remove('de-pane-active');
    renderWorkEditor();
  });
  header.appendChild(backBtn);
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name';
  titleEl.textContent = 'New job';
  header.appendChild(titleEl);
  pane.appendChild(header);

  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const titleLabel = document.createElement('label');
  titleLabel.className = 'de-label';
  titleLabel.textContent = 'Title';
  const titleInput = document.createElement('input');
  titleInput.className = 'de-input';
  titleInput.placeholder = 'e.g. New website for Acme';
  titleInput.value = workState.draft?.title || '';
  titleLabel.appendChild(titleInput);
  fields.appendChild(titleLabel);

  let clientPicker;
  clientPicker = mountWorkClientPicker(fields, workState.draft, () => { workState.dirty = true; });

  const statusLabel = document.createElement('label');
  statusLabel.className = 'de-label';
  statusLabel.textContent = 'Status';
  const statusSelect = buildStatusSelect(workState.draft?.status || 'inquiry');
  statusLabel.appendChild(statusSelect);
  fields.appendChild(statusLabel);

  const metaFields = appendWorkMetaFields(fields, workState.draft, null);

  pane.appendChild(fields);

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.spellcheck = false;
  ta.placeholder = '# Job details\n\nScope, notes, links…';
  ta.value = workState.draft?.body || '';
  pane.appendChild(ta);

  const actions = document.createElement('div');
  actions.className = 'de-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'de-btn de-btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    workState.activeSlug = null;
    workState.draft = null;
    renderWorkEditor();
  });
  const createBtn = document.createElement('button');
  createBtn.className = 'de-btn de-btn-primary';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    const slug = slugifyTitle(title);
    const client = clientPicker.getPayload();
    if (!client) { alert('Select a client, or add a new one.'); return; }
    createWork(slug, {
      title,
      ...client,
      status: statusSelect.value,
      ...metaFields.getPayload(),
      body: ta.value,
    });
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(createBtn);
  pane.appendChild(actions);
  getWorkEditor()?.classList.add('de-pane-active');
}

function mountWorkCommentsSection(pane, slug) {
  const wrap = document.createElement('div');
  wrap.className = 'wk-comments-section';
  wrap.innerHTML = '<div class="de-loading">Loading comments…</div>';
  pane.appendChild(wrap);

  fetch(`/api/work/${encodeURIComponent(slug)}/comments`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      wrap.innerHTML = '';
      const label = document.createElement('div');
      label.className = 'de-label';
      label.textContent = 'Client comments';
      wrap.appendChild(label);

      const list = document.createElement('div');
      list.className = 'wk-comment-list';
      const comments = data.comments || [];

      if (comments.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'de-empty';
        empty.style.padding = '0.5rem 0';
        empty.textContent = 'No comments yet.';
        list.appendChild(empty);
      } else {
        for (const c of comments) {
          const row = document.createElement('div');
          row.className = `wk-comment wk-comment-${c.author}`;
          const when = c.createdAt ? new Date(c.createdAt).toLocaleString() : '';
          row.innerHTML =
            `<div class="wk-comment-head">` +
            `<span class="wk-comment-author">${escHtml(c.authorName || (c.author === 'staff' ? 'Team' : 'Client'))}</span>` +
            `<span class="wk-comment-time">${escHtml(when)}</span>` +
            `</div>` +
            `<div class="wk-comment-text">${escHtml(c.text)}</div>`;
          list.appendChild(row);
        }
      }
      wrap.appendChild(list);

      const replyLabel = document.createElement('label');
      replyLabel.className = 'de-label';
      replyLabel.textContent = 'Reply (visible on client portal)';
      const replyTa = document.createElement('textarea');
      replyTa.className = 'de-textarea wk-comment-reply';
      replyTa.rows = 3;
      replyTa.maxLength = 4000;
      replyTa.placeholder = 'Write a reply to the client…';
      replyLabel.appendChild(replyTa);
      wrap.appendChild(replyLabel);

      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'de-btn de-btn-primary';
      replyBtn.textContent = 'Post reply';
      replyBtn.addEventListener('click', async () => {
        const text = replyTa.value.trim();
        if (!text) { replyTa.focus(); return; }
        replyBtn.disabled = true;
        replyBtn.textContent = 'Posting…';
        try {
          const res = await fetch(`/api/work/${encodeURIComponent(slug)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          const payload = await res.json();
          if (!res.ok || !payload.ok) throw new Error(payload.error || `HTTP ${res.status}`);
          replyTa.value = '';
          const parent = wrap.parentElement;
          wrap.remove();
          if (parent) mountWorkCommentsSection(parent, slug);
        } catch (e) {
          alert(`Failed to post reply: ${e.message}`);
        } finally {
          replyBtn.disabled = false;
          replyBtn.textContent = 'Post reply';
        }
      });
      wrap.appendChild(replyBtn);
    })
    .catch(() => {
      wrap.innerHTML = '';
    });
}

function renderEditWorkForm(pane) {
  const slug = workState.activeSlug;
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/work/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      workState.draft = {
        title: data.title,
        status: data.status || 'inquiry',
        priority: data.priority || 'normal',
        due_date: data.due_date || '',
        value: data.value ?? '',
        tags: data.tags || [],
        source: data.source || '',
        body: data.body || '',
        contact_uid: data.contact_uid,
        contact_name: data.contact_name || data.client,
      };
      workState.dirty = false;
      pane.innerHTML = '';

      const header = document.createElement('div');
      header.className = 'de-header';
      const backBtn = document.createElement('button');
      backBtn.className = 'de-back-btn';
      backBtn.textContent = '← Jobs';
      backBtn.addEventListener('click', () => {
        if (workState.dirty && !confirm('Discard unsaved changes?')) return;
        workState.activeSlug = null;
        workState.draft = null;
        getWorkEditor()?.classList.remove('de-pane-active');
        renderWorkEditor();
      });
      header.appendChild(backBtn);
      const titleEl = document.createElement('span');
      titleEl.className = 'de-doc-name';
      titleEl.textContent = data.title;
      header.appendChild(titleEl);

      if (data.contact_uid) {
        appendPortalShareBtn(header, data.contact_uid, {
          tab: 'work',
          title: `${data.contact_name || data.client || 'Client'} — Work`,
        });
      }

      pane.appendChild(header);

      const fields = document.createElement('div');
      fields.className = 'de-fields';

      const titleLabel = document.createElement('label');
      titleLabel.className = 'de-label';
      titleLabel.textContent = 'Title';
      const titleInput = document.createElement('input');
      titleInput.className = 'de-input';
      titleInput.value = workState.draft.title;
      titleLabel.appendChild(titleInput);
      fields.appendChild(titleLabel);

      pane.appendChild(fields);

      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.spellcheck = false;
      ta.value = workState.draft.body;

      let clientPicker;
      let metaFields;
      const markDirty = () => {
        const client = clientPicker.getPayload();
        const meta = metaFields.getPayload();
        workState.dirty =
          titleInput.value !== workState.draft.title ||
          (client?.contact_uid || '') !== (workState.draft.contact_uid || '') ||
          statusSelect.value !== workState.draft.status ||
          meta.priority !== (workState.draft.priority || 'normal') ||
          (meta.due_date || '') !== (workState.draft.due_date || '') ||
          String(meta.value ?? '') !== String(workState.draft.value ?? '') ||
          meta.tags.join(', ') !== (Array.isArray(workState.draft.tags) ? workState.draft.tags.join(', ') : '') ||
          meta.source !== (workState.draft.source || '') ||
          ta.value !== workState.draft.body;
      };
      clientPicker = mountWorkClientPicker(fields, workState.draft, markDirty);

      const statusLabel = document.createElement('label');
      statusLabel.className = 'de-label';
      statusLabel.textContent = 'Status';
      const statusSelect = buildStatusSelect(workState.draft.status);
      statusLabel.appendChild(statusSelect);
      fields.appendChild(statusLabel);

      metaFields = appendWorkMetaFields(fields, workState.draft, markDirty);

      titleInput.addEventListener('input', markDirty);
      statusSelect.addEventListener('change', markDirty);
      ta.addEventListener('input', markDirty);
      pane.appendChild(ta);
      mountWorkCommentsSection(pane, slug);

      const actions = document.createElement('div');
      actions.className = 'de-actions';
      const delBtn = document.createElement('button');
      delBtn.className = 'de-btn de-btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteWork(slug));
      const saveBtn = document.createElement('button');
      saveBtn.className = 'de-btn de-btn-primary';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => {
        const client = clientPicker.getPayload();
        if (!client) { alert('Select a client, or add a new one.'); return; }
        saveWork(slug, {
          title: titleInput.value.trim(),
          ...client,
          status: statusSelect.value,
          ...metaFields.getPayload(),
          body: ta.value,
        });
      });
      actions.appendChild(delBtn);
      actions.appendChild(saveBtn);
      pane.appendChild(actions);
      getWorkEditor()?.classList.add('de-pane-active');
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    });
}

async function openWork(slug) {
  if (workState.dirty && workState.activeSlug && !confirm('Discard unsaved changes?')) return;
  workState.activeSlug = slug;
  workState.dirty = false;
  renderWorkEditor();
}

async function createWork(slug, payload) {
  if (!payload.title) { alert('Enter a title.'); return; }
  if (!payload.contact_uid) { alert('Select a client.'); return; }
  if (!slug) { alert('Could not derive a slug from the title.'); return; }
  try {
    const res = await fetch('/api/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ...payload }),
    });
    const data = await res.json();
    if (res.status === 409) { alert('A job with that slug already exists.'); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadWorkTab();
    workState.activeSlug = slug;
    renderWorkEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveWork(slug, payload) {
  if (!payload.title) { alert('Title is required.'); return; }
  if (!payload.contact_uid) { alert('Select a client.'); return; }
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    workState.dirty = false;
    await loadWorkTab();
    workState.activeSlug = slug;
    renderWorkEditor();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

async function deleteWork(slug) {
  closeOpenSwipeRow();
  if (!confirm(`Delete "${slug}.md"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    workState.activeSlug = null;
    workState.dirty = false;
    workState.draft = null;
    await loadWorkTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

// ---- clients tab ----

let clientState = {
  clients: [],
  total: 0,
  search: '',
  activeUid: null,
  dirty: false,
  draft: null,
};
let clientSearchTimer = null;

function getClientsEditor() { return document.getElementById('clients-editor'); }

function clientSubline(c) {
  return c.email || c.company || c.phone || c.uid.slice(0, 8) + '…';
}

async function fetchClientsList() {
  const params = new URLSearchParams();
  if (clientState.search.trim()) params.set('q', clientState.search.trim());
  const qs = params.toString();
  const res = await fetch(`/api/clients${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  clientState.clients = data.clients || [];
  clientState.total = data.total ?? clientState.clients.length;
}

async function loadClientsTab() {
  const root = getClientsEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading clients…</div>';
  try {
    await fetchClientsList();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }
  clientState.activeUid = null;
  clientState.dirty = false;
  clientState.draft = null;
  getClientsEditor()?.classList.remove('de-pane-active');
  renderClientsEditor();
}

function scheduleClientSearch() {
  clearTimeout(clientSearchTimer);
  clientSearchTimer = setTimeout(async () => {
    try {
      await fetchClientsList();
      renderClientsEditor();
    } catch (e) {
      alert(`Search failed: ${e.message}`);
    }
  }, 300);
}

function renderClientsEditor() {
  const root = getClientsEditor();
  if (!root) return;
  const { clients, activeUid, total } = clientState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const toolbar = document.createElement('div');
  toolbar.className = 'ch-toolbar';
  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn ch-new-btn';
  newBtn.textContent = '+ New Client';
  newBtn.addEventListener('click', () => {
    clientState.activeUid = '__new__';
    clientState.dirty = false;
    clientState.draft = { name: '', email: '', phone: '', company: '', notes: '' };
    renderClientsEditor();
  });
  toolbar.appendChild(newBtn);
  sidebar.appendChild(toolbar);

  const search = document.createElement('input');
  search.className = 'cl-search';
  search.type = 'search';
  search.placeholder = 'Search clients…';
  search.value = clientState.search;
  search.addEventListener('input', (e) => {
    clientState.search = e.target.value;
    scheduleClientSearch();
  });
  sidebar.appendChild(search);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.65rem 0.5rem';
  hint.textContent = `contact-api · ${total} total`;
  sidebar.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const c of clients) {
    list.appendChild(createClientSwipeRow(c));
  }
  if (clients.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = clientState.search.trim() ? 'No matches.' : 'No clients yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeUid === '__new__') {
    renderNewClientForm(pane);
  } else if (activeUid) {
    renderEditClientForm(pane);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'de-placeholder';
    placeholder.innerHTML = '<div class="de-placeholder-icon">👥</div><p>Select a client to edit, or add a new one.</p>';
    pane.appendChild(placeholder);
  }

  root.appendChild(pane);
}

function appendClientField(parent, label, input) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = label;
  wrap.appendChild(input);
  parent.appendChild(wrap);
}

function renderNewClientForm(pane) {
  pane.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'de-header';
  const backBtn = document.createElement('button');
  backBtn.className = 'de-back-btn';
  backBtn.textContent = '← Clients';
  backBtn.addEventListener('click', () => {
    clientState.activeUid = null;
    clientState.draft = null;
    getClientsEditor()?.classList.remove('de-pane-active');
    renderClientsEditor();
  });
  header.appendChild(backBtn);
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name';
  titleEl.textContent = 'New client';
  header.appendChild(titleEl);
  pane.appendChild(header);

  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const nameInput = document.createElement('input');
  nameInput.className = 'de-input';
  nameInput.placeholder = 'Full name';
  nameInput.value = clientState.draft?.name || '';
  appendClientField(fields, 'Name', nameInput);

  const emailInput = document.createElement('input');
  emailInput.className = 'de-input';
  emailInput.type = 'email';
  emailInput.placeholder = 'email@example.com';
  emailInput.value = clientState.draft?.email || '';
  appendClientField(fields, 'Email', emailInput);

  const phoneInput = document.createElement('input');
  phoneInput.className = 'de-input';
  phoneInput.placeholder = '+1 …';
  phoneInput.value = clientState.draft?.phone || '';
  appendClientField(fields, 'Phone', phoneInput);

  const companyInput = document.createElement('input');
  companyInput.className = 'de-input';
  companyInput.placeholder = 'Company';
  companyInput.value = clientState.draft?.company || '';
  appendClientField(fields, 'Company', companyInput);

  pane.appendChild(fields);

  const notesLabel = document.createElement('label');
  notesLabel.className = 'de-label';
  notesLabel.textContent = 'Notes (internal)';
  const notesTa = document.createElement('textarea');
  notesTa.className = 'de-textarea';
  notesTa.spellcheck = false;
  notesTa.placeholder = 'Private notes — never shown on client portal';
  notesTa.value = clientState.draft?.notes || '';
  notesLabel.appendChild(notesTa);
  pane.appendChild(notesLabel);

  const actions = document.createElement('div');
  actions.className = 'de-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'de-btn de-btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    clientState.activeUid = null;
    clientState.draft = null;
    renderClientsEditor();
  });
  const createBtn = document.createElement('button');
  createBtn.className = 'de-btn de-btn-primary';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () =>
    createClient({
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      company: companyInput.value.trim(),
      notes: notesTa.value.trim(),
    }),
  );
  actions.appendChild(cancelBtn);
  actions.appendChild(createBtn);
  pane.appendChild(actions);
  getClientsEditor()?.classList.add('de-pane-active');
}

function renderEditClientForm(pane) {
  const uid = clientState.activeUid;
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/clients/${encodeURIComponent(uid)}`, { cache: 'no-store' })
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      const contact = data.contact ?? data;
      clientState.draft = {
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        notes: contact.notes || '',
        portal_url: contact.portal_url ?? data.portal_url,
        createdAt: contact.createdAt ?? data.createdAt,
        archived: contact.archived ?? data.archived,
      };
      clientState.dirty = false;
      pane.innerHTML = '';

      const header = document.createElement('div');
      header.className = 'de-header';
      const backBtn = document.createElement('button');
      backBtn.className = 'de-back-btn';
      backBtn.textContent = '← Clients';
      backBtn.addEventListener('click', () => {
        if (clientState.dirty && !confirm('Discard unsaved changes?')) return;
        clientState.activeUid = null;
        clientState.draft = null;
        getClientsEditor()?.classList.remove('de-pane-active');
        renderClientsEditor();
      });
      header.appendChild(backBtn);
      const titleEl = document.createElement('span');
      titleEl.className = 'de-doc-name';
      titleEl.textContent = clientState.draft.name || 'Client';
      header.appendChild(titleEl);
      pane.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'cl-readonly';
      meta.style.padding = '0 1rem 0.5rem';
      meta.innerHTML =
        `UID: ${escHtml(uid)}` +
        (data.portal_url ? `<br>Portal: <a href="${escHtml(data.portal_url)}" target="_blank" rel="noopener">${escHtml(data.portal_url)}</a>` : '') +
        (data.createdAt ? `<br>Created: ${escHtml(new Date(data.createdAt).toLocaleString())}` : '');
      pane.appendChild(meta);

      const portalActions = document.createElement('div');
      portalActions.className = 'cl-portal-actions';
      portalActions.style.padding = '0 1rem 0.75rem';
      appendPortalShareBtn(portalActions, uid, { title: `${clientState.draft.name || 'Client'} — portal` });
      if (portalActions.childElementCount) pane.appendChild(portalActions);

      const jobsWrap = document.createElement('div');
      jobsWrap.className = 'cl-jobs-section';
      jobsWrap.innerHTML = '<div class="de-loading">Loading jobs…</div>';
      pane.appendChild(jobsWrap);
      fetch(`/api/work?contact_uid=${encodeURIComponent(uid)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((jobData) => {
          const jobs = (jobData.jobs || []).filter((j) => j.status !== 'archived');
          jobsWrap.innerHTML = '';
          const jobsLabel = document.createElement('div');
          jobsLabel.className = 'de-label';
          jobsLabel.textContent = `Work (${jobs.length})`;
          jobsWrap.appendChild(jobsLabel);
          if (jobs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'de-empty';
            empty.style.padding = '0.5rem 0';
            empty.textContent = 'No active jobs for this client.';
            jobsWrap.appendChild(empty);
          } else {
            const list = document.createElement('div');
            list.className = 'cl-jobs-list';
            for (const job of jobs) {
              const row = document.createElement('button');
              row.type = 'button';
              row.className = 'cl-job-row';
              row.innerHTML =
                `<span class="de-item-title">${escHtml(job.title)}</span>` +
                `<span class="wk-meta-row">` +
                `<span class="${workStatusClass(job.status)}">${escHtml(WORK_STATUS_LABELS[job.status] || job.status)}</span>` +
                (job.due_date ? `<span class="wk-contact">Due ${escHtml(job.due_date)}</span>` : '') +
                `</span>`;
              row.addEventListener('click', async () => {
                setActiveMap('work');
                await loadWorkTab();
                openWork(job.slug);
              });
              list.appendChild(row);
            }
            jobsWrap.appendChild(list);
          }
        })
        .catch(() => {
          jobsWrap.innerHTML = '';
        });

      const fields = document.createElement('div');
      fields.className = 'de-fields';

      const nameInput = document.createElement('input');
      nameInput.className = 'de-input';
      nameInput.value = clientState.draft.name || '';
      appendClientField(fields, 'Name', nameInput);

      const emailInput = document.createElement('input');
      emailInput.className = 'de-input';
      emailInput.type = 'email';
      emailInput.value = clientState.draft.email || '';
      appendClientField(fields, 'Email', emailInput);

      const phoneInput = document.createElement('input');
      phoneInput.className = 'de-input';
      phoneInput.value = clientState.draft.phone || '';
      appendClientField(fields, 'Phone', phoneInput);

      const companyInput = document.createElement('input');
      companyInput.className = 'de-input';
      companyInput.value = clientState.draft.company || '';
      appendClientField(fields, 'Company', companyInput);

      pane.appendChild(fields);

      const notesLabel = document.createElement('label');
      notesLabel.className = 'de-label';
      notesLabel.textContent = 'Notes (internal)';
      const notesTa = document.createElement('textarea');
      notesTa.className = 'de-textarea';
      notesTa.spellcheck = false;
      notesTa.value = clientState.draft.notes || '';
      notesLabel.appendChild(notesTa);
      pane.appendChild(notesLabel);

      const markDirty = () => {
        clientState.dirty =
          nameInput.value !== clientState.draft.name ||
          emailInput.value !== clientState.draft.email ||
          phoneInput.value !== clientState.draft.phone ||
          companyInput.value !== clientState.draft.company ||
          notesTa.value !== clientState.draft.notes;
      };
      nameInput.addEventListener('input', markDirty);
      emailInput.addEventListener('input', markDirty);
      phoneInput.addEventListener('input', markDirty);
      companyInput.addEventListener('input', markDirty);
      notesTa.addEventListener('input', markDirty);

      const actions = document.createElement('div');
      actions.className = 'de-actions';
      const delBtn = document.createElement('button');
      delBtn.className = 'de-btn de-btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteClient(uid, clientState.draft?.name || 'Client'));
      const saveBtn = document.createElement('button');
      saveBtn.className = 'de-btn de-btn-primary';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () =>
        saveClient(uid, {
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          phone: phoneInput.value.trim(),
          company: companyInput.value.trim(),
          notes: notesTa.value.trim(),
        }),
      );
      actions.appendChild(delBtn);
      actions.appendChild(saveBtn);
      pane.appendChild(actions);
      getClientsEditor()?.classList.add('de-pane-active');
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    });
}

async function openClient(uid) {
  if (clientState.dirty && clientState.activeUid && !confirm('Discard unsaved changes?')) return;
  clientState.activeUid = uid;
  clientState.dirty = false;
  renderClientsEditor();
}

async function createClient(payload) {
  if (!payload.name) { alert('Enter a name.'); return; }
  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadClientsTab();
    clientState.activeUid = data.uid;
    renderClientsEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveClient(uid, payload) {
  if (!payload.name) { alert('Name is required.'); return; }
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    clientState.dirty = false;
    await loadClientsTab();
    clientState.activeUid = uid;
    renderClientsEditor();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

async function fetchClientDeletePreview(uid) {
  const res = await fetch(`/api/clients/${encodeURIComponent(uid)}?preview=delete`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function osDialog(opts) {
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
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (ev) => {
      if (ev.key === 'Escape' && opts.showCancel) finish(false);
    };

    titleEl.textContent = opts.title || '';
    bodyEl.innerHTML = opts.bodyHtml || '';
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
      opts.danger ? 'os-dialog-btn--danger' : '',
      true,
    );

    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', onKey);
    primary.focus();
  });
}

function osConfirm(opts) {
  return osDialog({ ...opts, showCancel: true });
}

function osAlert(opts) {
  return osDialog({ ...opts, showCancel: false, confirmLabel: opts.confirmLabel || 'OK' });
}

function buildClientDeleteConfirmHtml(name, preview) {
  const parts = [];
  const projectCount = preview.project_count ?? preview.job_count ?? 0;
  if (projectCount > 0) {
    const titles = (preview.projects || []).map((p) => escHtml(p.title)).slice(0, 8);
    const extra = projectCount > titles.length ? ` (+${projectCount - titles.length} more)` : '';
    parts.push(
      `<p><strong>${escHtml(name)}</strong> has ${projectCount} attached project${projectCount === 1 ? '' : 's'}${titles.length ? `: ${titles.join(', ')}${extra}` : '.'}</p>`,
    );
    parts.push('<p class="os-dialog-warn">Deleting this client will permanently delete all attached projects.</p>');
  } else {
    parts.push(`<p>Delete <strong>${escHtml(name)}</strong>? This cannot be undone.</p>`);
  }
  const inv = preview.invoice_count ?? 0;
  const est = preview.estimate_count ?? 0;
  if (inv > 0) {
    parts.push(
      `<p class="os-dialog-note">${inv} linked Crater invoice${inv === 1 ? '' : 's'} — the client will be removed; invoice records stay in billing.</p>`,
    );
  }
  if (est > 0) {
    parts.push(
      `<p class="os-dialog-note">${est} linked Crater estimate${est === 1 ? '' : 's'} — the client will be removed; estimate records stay in billing.</p>`,
    );
  }
  return parts.join('');
}

async function performClientDelete(uid, force) {
  const qs = force ? '?force=true' : '';
  const res = await fetch(`/api/clients/${encodeURIComponent(uid)}${qs}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  return { res, data };
}

async function deleteClient(uid, name) {
  closeOpenSwipeRow();
  let preview;
  try {
    preview = await fetchClientDeletePreview(uid);
  } catch (e) {
    await osAlert({ title: 'Could not verify', bodyHtml: `<p>${escHtml(e.message)}</p>` });
    return;
  }

  const projectCount = preview.project_count ?? preview.job_count ?? 0;

  const confirmed = await osConfirm({
    title: projectCount > 0 ? 'Delete client and projects?' : 'Delete client?',
    bodyHtml: buildClientDeleteConfirmHtml(name, preview),
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    danger: true,
  });
  if (!confirmed) return;

  try {
    let { res, data } = await performClientDelete(uid, true);

    if (res.status === 409) {
      const retry = await osConfirm({
        title: 'Confirm delete',
        bodyHtml: `<p>${escHtml(data.error || data.warning || 'This client has linked records.')}</p>`,
        confirmLabel: 'Delete anyway',
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!retry) return;
      ({ res, data } = await performClientDelete(uid, true));
    }

    if (!res.ok) throw new Error(data.error || data.warning || `HTTP ${res.status}`);

    clientState.activeUid = null;
    clientState.dirty = false;
    clientState.draft = null;
    await loadClientsTab();
  } catch (e) {
    await osAlert({ title: 'Delete failed', bodyHtml: `<p>${escHtml(e.message)}</p>` });
  }
}

// ---- chats tab ----

/** SF Symbol–style icons (square.and.arrow.up, doc.on.doc, etc.) for iOS-native toolbar affordances. */
const IOS_ICONS = {
  copy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
};
const CH_MSG_ICONS = IOS_ICONS;

const CHAT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const CHAT_MAX_IMAGES = 5;
const CHAT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function parseChatMsgContent(content) {
  if (typeof content !== 'string' || !content.startsWith('{"v":')) {
    return { text: content || '', images: [] };
  }
  try {
    const parsed = JSON.parse(content);
    if (parsed?.v === 1) {
      const images = Array.isArray(parsed.images)
        ? parsed.images.filter((img) => img?.mediaType && img?.data)
        : [];
      return { text: String(parsed.text ?? ''), images };
    }
  } catch (_) {}
  return { text: content, images: [] };
}

function chatMsgPlainText(content) {
  const { text, images } = parseChatMsgContent(content);
  if (images.length && !text.trim()) {
    return images.length === 1 ? '[Image]' : `[${images.length} images]`;
  }
  if (images.length && text.trim()) {
    return `${text}\n[${images.length} image${images.length === 1 ? '' : 's'} attached]`;
  }
  return text;
}

function serializeChatMsgContent(text, images) {
  if (!images?.length) return text;
  return JSON.stringify({
    v: 1,
    text,
    images: images.map(({ mediaType, data }) => ({ mediaType, data })),
  });
}

function fileToChatImage(file) {
  return new Promise((resolve, reject) => {
    if (!CHAT_IMAGE_TYPES.has(file.type)) {
      reject(new Error(`Unsupported image type: ${file.type || 'unknown'}`));
      return;
    }
    if (file.size > CHAT_MAX_IMAGE_BYTES) {
      reject(new Error('Image too large (max 5 MB)'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve({
        mediaType: file.type,
        data: comma >= 0 ? result.slice(comma + 1) : result,
        previewUrl: result,
        name: file.name || 'image',
      });
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

async function collectChatImageFiles(files) {
  const out = [];
  for (const file of files) {
    if (!file?.type?.startsWith('image/')) continue;
    try {
      out.push(await fileToChatImage(file));
    } catch (e) {
      showChatToast(e.message);
    }
  }
  return out;
}

function appendChatMessageImages(bubble, images, beforeEl) {
  if (!images.length) return;
  const gallery = document.createElement('div');
  gallery.className = 'ch-msg-images';
  for (const img of images) {
    const el = document.createElement('img');
    el.className = 'ch-msg-img';
    el.src = `data:${img.mediaType};base64,${img.data}`;
    el.alt = 'Attached image';
    el.loading = 'lazy';
    gallery.appendChild(el);
  }
  bubble.insertBefore(gallery, beforeEl);
}

let _chToastTimer = null;

function showChatToast(message, nearEl) {
  let toast = document.getElementById('ch-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ch-toast';
    toast.className = 'ch-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('ch-toast-visible');
  if (nearEl) {
    const r = nearEl.getBoundingClientRect();
    toast.style.left = `${Math.min(window.innerWidth - 120, Math.max(12, r.left))}px`;
    toast.style.top = `${Math.max(12, r.top - 36)}px`;
  } else {
    toast.style.left = '';
    toast.style.top = '';
  }
  clearTimeout(_chToastTimer);
  _chToastTimer = setTimeout(() => toast.classList.remove('ch-toast-visible'), 1800);
}

async function copyChatText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showChatToast('Copied', btn);
    if (btn) {
      const prev = btn.getAttribute('aria-label');
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(() => btn.setAttribute('aria-label', prev || 'Copy'), 1500);
    }
    return true;
  } catch {
    showChatToast('Copy failed — check browser permissions');
    return false;
  }
}

async function shareChatText(text, role, btn) {
  const label = role === 'user' ? 'You' : 'Assistant';
  const payload = { text, title: `${label} — Reave chat` };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const ok = await copyChatText(text, btn);
  if (ok) showChatToast('Copied — paste to share');
  return ok;
}

function clientPortalShareUrl(uid, tab) {
  if (!uid) return '';
  const base = `${window.location.origin}/c/${encodeURIComponent(uid)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

async function sharePortalLink(url, title, btn) {
  if (!url) return false;
  const pageTitle = title || 'Client page';
  const payload = {
    title: pageTitle,
    text: pageTitle,
    url,
  };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const ok = await copyChatText(url, btn);
  if (ok) showChatToast('Link copied — paste to share');
  return ok;
}

function createIosIconBtn(opts = {}) {
  const { iconKey, label, className = 'ios-icon-btn', onClick } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS[iconKey] || '';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick?.(btn);
  });
  return btn;
}

function appendPortalShareBtn(parent, uid, opts = {}) {
  const { tab, title, className = 'ios-icon-btn de-share-btn' } = opts;
  if (!uid) return null;
  const btn = createIosIconBtn({
    iconKey: 'share',
    label: 'Share client portal link',
    className,
    onClick: () => sharePortalLink(clientPortalShareUrl(uid, tab), title || 'Your client page', btn),
  });
  parent.appendChild(btn);
  return btn;
}

function pasteIntoChatInput(input) {
  if (!input || input.disabled) return;
  const insert = (text) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText().then(insert).catch(() => {
      showChatToast('Paste blocked — use ⌘V / Ctrl+V');
    });
  } else {
    showChatToast('Paste with ⌘V / Ctrl+V');
    input.focus();
  }
}

function insertChatDraft(input, text) {
  if (!input || input.disabled) return;
  input.value = text;
  input.selectionStart = input.selectionEnd = text.length;
  input.focus();
  showChatToast('Message loaded — edit and send');
}

function createChatMsgAction(label, iconKey, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ch-msg-action';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = CH_MSG_ICONS[iconKey] || '';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

function bindChatMessageContextMenu(row, message, composeInput, onEdit) {
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const items = [
      { label: 'Copy', action: () => copyChatText(message.content) },
      { label: 'Share', action: () => shareChatText(message.content, message.role) },
    ];
    if (message.role === 'user' && onEdit) {
      items.push({ label: 'Edit message', action: onEdit });
    }
    if (composeInput) {
      items.push({ label: 'Paste into message', action: () => pasteIntoChatInput(composeInput) });
    }
    showChatContextMenu(e.clientX, e.clientY, items);
  });
}

let _chCtxMenu = null;

function showChatContextMenu(x, y, items) {
  _chCtxMenu?.remove();
  const menu = document.createElement('div');
  menu.className = 'ch-context-menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ch-context-item';
    btn.textContent = item.label;
    btn.setAttribute('role', 'menuitem');
    btn.addEventListener('click', () => {
      menu.remove();
      _chCtxMenu = null;
      item.action();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  _chCtxMenu = menu;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  const close = (ev) => {
    if (menu.contains(ev.target)) return;
    menu.remove();
    _chCtxMenu = null;
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') close({ target: document.body });
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}

let chatState = {
  threads: [],
  activeId: null,
  messages: [],
  title: '',
  sending: false,
  pendingDraft: null,
  pendingAutoSend: false,
  showArchived: false,
};

function getChatPanel() { return document.getElementById('chat-panel'); }

function formatChatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

async function loadChatsTab(opts = {}) {
  const root = getChatPanel();
  if (!root) return;
  const keepSession = opts.keepSession === true && chatState.activeId;
  const savedActiveId = keepSession ? chatState.activeId : null;
  const savedTitle = keepSession ? chatState.title : '';
  const savedMessages = keepSession ? chatState.messages : [];
  const savedDraft = keepSession ? chatState.pendingDraft : null;
  const savedAutoSend = keepSession ? chatState.pendingAutoSend : false;

  root.innerHTML = '<div class="de-loading">Loading chats…</div>';
  const archivedQ = chatState.showArchived ? '?archived=1' : '';
  try {
    const res = await fetch(`/api/chats${archivedQ}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    chatState.threads = data.threads || [];
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    return;
  }

  if (savedActiveId) {
    if (!chatState.threads.some((t) => t.id === savedActiveId)) {
      chatState.threads.unshift({ id: savedActiveId, title: savedTitle || 'Chat' });
    }
    chatState.activeId = savedActiveId;
    chatState.title = savedTitle;
    chatState.messages = savedMessages;
    chatState.pendingDraft = savedDraft;
    chatState.pendingAutoSend = savedAutoSend;
  } else {
    chatState.activeId = null;
    chatState.messages = [];
    chatState.title = '';
    chatState.pendingAutoSend = false;
    getChatPanel()?.classList.remove('ch-pane-active');
  }
  renderChatPanel();
}

function createSidebarChatTitle(title) {
  const titleEl = document.createElement('span');
  titleEl.className = 'ch-item-title';
  titleEl.textContent = title;
  return titleEl;
}

function syncSidebarChatTitle(threadId, title) {
  const el = getChatPanel()?.querySelector(
    `.ch-list-item[data-id="${CSS.escape(threadId)}"] .ch-item-title`,
  );
  if (el) el.textContent = title;
}

function createHeaderChatTitle(threadId, title) {
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name ch-header-title';
  titleEl.textContent = title;
  titleEl.title = 'Click to rename';
  titleEl.setAttribute('role', 'button');
  titleEl.tabIndex = 0;

  const openEdit = (e) => {
    e.stopPropagation();
    startChatTitleEdit(titleEl, threadId, titleEl.textContent);
  };
  titleEl.addEventListener('click', openEdit);
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openEdit(e);
    }
  });
  return titleEl;
}

async function readApiJson(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? 'Invalid server response' : `HTTP ${res.status}`);
    }
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function saveChatTitle(threadId, title) {
  const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const data = await readApiJson(res);
  return data.title || title;
}

function startChatTitleEdit(titleEl, threadId, originalTitle) {
  if (titleEl.dataset.editing === '1') return;
  titleEl.dataset.editing = '1';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ch-header-title-input';
  input.value = originalTitle;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let cancelled = false;

  const finish = async (save) => {
    if (input.dataset.finishing === '1') return;
    input.dataset.finishing = '1';

    const nextTitle = input.value.trim() || 'New chat';
    let displayTitle = originalTitle;

    if (save && nextTitle !== originalTitle) {
      try {
        displayTitle = await saveChatTitle(threadId, nextTitle);
        const thread = chatState.threads.find((t) => t.id === threadId);
        if (thread) thread.title = displayTitle;
        if (chatState.activeId === threadId) chatState.title = displayTitle;
        syncSidebarChatTitle(threadId, displayTitle);
      } catch (e) {
        alert(`Could not rename chat: ${e.message}`);
      }
    }

    input.replaceWith(createHeaderChatTitle(threadId, displayTitle));
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelled = true;
      input.blur();
    }
  });
  input.addEventListener('blur', () => finish(!cancelled));
}

function createChatListItem(t) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (t.id === chatState.activeId ? ' active' : '');
  item.dataset.id = t.id;
  item.innerHTML =
    `<span class="ch-item-row">` +
      `<span class="ch-item-title">${escHtml(t.title || 'New chat')}</span>` +
      `<span class="ch-item-date">${escHtml(formatChatDate(t.updated_at))}</span>` +
    `</span>` +
    (t.archived ? `<span class="ch-item-archived">Archived</span>` : '');
  item.addEventListener('click', () => openChat(t.id));
  return item;
}

function createChatSwipeRow(t) {
  return createSwipeRow(createChatListItem(t), [
    {
      label: t.archived ? 'Unarchive' : 'Archive',
      className: 'swipe-act swipe-act-archive',
      onClick: () => archiveChat(t),
    },
    {
      label: 'Delete',
      className: 'swipe-act swipe-act-delete',
      onClick: () => deleteChat(t.id, t.title),
    },
  ]);
}

function renderChatSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const toolbar = document.createElement('div');
  toolbar.className = 'ch-toolbar';
  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn ch-new-btn';
  newBtn.textContent = '+ New Chat';
  newBtn.addEventListener('click', () => startNewChat());
  toolbar.appendChild(newBtn);

  const archivedBtn = document.createElement('button');
  archivedBtn.className = 'ch-refresh';
  archivedBtn.textContent = chatState.showArchived ? 'Hide archived' : 'Show archived';
  archivedBtn.addEventListener('click', () => {
    chatState.showArchived = !chatState.showArchived;
    loadChatsTab();
  });
  toolbar.appendChild(archivedBtn);
  sidebar.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const t of chatState.threads) {
    list.appendChild(createChatSwipeRow(t));
  }
  if (chatState.threads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = chatState.showArchived ? 'No archived chats.' : 'No chats yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  return sidebar;
}

function renderChatMessages(container, composeInput) {
  container.innerHTML = '';
  if (chatState.messages.length === 0 && !chatState.sending) {
    const ph = document.createElement('div');
    ph.className = 'de-placeholder';
    ph.innerHTML = '<div class="de-placeholder-icon">💬</div>Send a message to start.';
    container.appendChild(ph);
    return;
  }
  for (const m of chatState.messages) {
    const row = document.createElement('div');
    row.className = 'ch-msg-row ' + (m.role === 'user' ? 'ch-msg-row-user' : 'ch-msg-row-assistant');

    const bubble = document.createElement('div');
    bubble.className = 'ch-msg ' + (m.role === 'user' ? 'ch-msg-user' : 'ch-msg-assistant');

    const parsed = parseChatMsgContent(m.content);
    const plainText = chatMsgPlainText(m.content);

    const body = document.createElement('div');
    body.className = 'ch-msg-body';
    if (parsed.text) body.textContent = parsed.text;
    appendChatMessageImages(bubble, parsed.images, body);
    if (!parsed.text && parsed.images.length) body.hidden = true;
    bubble.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'ch-msg-actions';
    actions.appendChild(
      createChatMsgAction('Copy', 'copy', (btn) => copyChatText(plainText, btn)),
    );
    actions.appendChild(
      createChatMsgAction('Share', 'share', (btn) => shareChatText(plainText, m.role, btn)),
    );
    if (m.role === 'user' && composeInput) {
      actions.appendChild(
        createChatMsgAction('Edit message', 'edit', () => insertChatDraft(composeInput, parsed.text)),
      );
    }
    bubble.appendChild(actions);
    row.appendChild(bubble);

    bindChatMessageContextMenu(
      row,
      { ...m, content: plainText },
      composeInput,
      composeInput ? () => insertChatDraft(composeInput, parsed.text) : null,
    );

    container.appendChild(row);
  }
  if (chatState.sending) {
    const thinking = document.createElement('div');
    thinking.className = 'ch-thinking';
    thinking.textContent = 'Thinking…';
    container.appendChild(thinking);
  }
  const bottom = document.createElement('div');
  bottom.className = 'ch-scroll-anchor';
  bottom.setAttribute('aria-hidden', 'true');
  container.appendChild(bottom);
  scrollChatToBottom(container);
}

function scrollChatToBottom(container, smooth = true) {
  if (!container) return;
  const run = () => {
    const anchor = container.querySelector('.ch-scroll-anchor');
    if (anchor) {
      anchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function renderChatPanel() {
  const root = getChatPanel();
  if (!root) return;
  root.innerHTML = '';

  root.appendChild(renderChatSidebar());

  const pane = document.createElement('div');
  pane.className = 'ch-pane';

  if (!chatState.activeId) {
    const ph = document.createElement('div');
    ph.className = 'de-placeholder';
    ph.innerHTML = '<div class="de-placeholder-icon">💬</div>Select a chat or start a new one.';
    pane.appendChild(ph);
    root.appendChild(pane);
    return;
  }

  const header = document.createElement('div');
  header.className = 'de-header';
  const backBtn = document.createElement('button');
  backBtn.className = 'de-back-btn';
  backBtn.textContent = '← Chats';
  backBtn.addEventListener('click', () => {
    chatState.activeId = null;
    getChatPanel()?.classList.remove('ch-pane-active');
    renderChatPanel();
  });
  header.appendChild(backBtn);
  header.appendChild(createHeaderChatTitle(chatState.activeId, chatState.title || 'Chat'));
  const modelBadge = document.createElement('span');
  modelBadge.className = 'ch-model-badge';
  modelBadge.textContent = modelOptionLabel(
    agentModelState.options.find((o) => o.id === agentModelState.model) || { id: agentModelState.model },
  );
  modelBadge.title = `Agent model (${agentModelState.source}) — change in top bar`;
  header.appendChild(modelBadge);
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'ch-delete-btn';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteChat(chatState.activeId, chatState.title));
  header.appendChild(deleteBtn);
  const chatTranscript = () =>
    chatState.messages.map((m) => `${m.role === 'user' ? 'You' : 'Assistant'}:\n${chatMsgPlainText(m.content)}`).join('\n\n');
  const copyChatBtn = createIosIconBtn({
    iconKey: 'copy',
    label: 'Copy entire conversation',
    className: 'ios-icon-btn ch-copy-chat-btn',
    onClick: (btn) => copyChatText(chatTranscript(), btn),
  });
  const shareChatBtn = createIosIconBtn({
    iconKey: 'share',
    label: 'Share entire conversation',
    className: 'ios-icon-btn ch-share-chat-btn',
    onClick: (btn) => shareChatText(chatTranscript(), 'assistant', btn),
  });
  header.insertBefore(shareChatBtn, deleteBtn);
  header.insertBefore(copyChatBtn, shareChatBtn);
  pane.appendChild(header);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'ch-messages';

  const compose = document.createElement('div');
  compose.className = 'ch-compose';

  const composeMain = document.createElement('div');
  composeMain.className = 'ch-compose-main';

  const attachmentsEl = document.createElement('div');
  attachmentsEl.className = 'ch-attachments';
  attachmentsEl.hidden = true;

  const input = document.createElement('textarea');
  input.className = 'ch-input';
  input.placeholder = 'Message the agent…';
  input.rows = 1;
  input.disabled = chatState.sending;

  composeMain.appendChild(attachmentsEl);
  composeMain.appendChild(input);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'ch-send';
  sendBtn.textContent = 'Send';
  sendBtn.disabled = chatState.sending;

  let pendingImages = [];

  function renderPendingAttachments() {
    attachmentsEl.innerHTML = '';
    attachmentsEl.hidden = pendingImages.length === 0;
    for (const img of pendingImages) {
      const wrap = document.createElement('div');
      wrap.className = 'ch-attachment';
      const thumb = document.createElement('img');
      thumb.src = img.previewUrl;
      thumb.alt = img.name || 'Attached image';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ch-attachment-remove';
      rm.setAttribute('aria-label', 'Remove image');
      rm.textContent = '×';
      rm.addEventListener('click', () => {
        pendingImages = pendingImages.filter((item) => item !== img);
        renderPendingAttachments();
        syncSendState();
      });
      wrap.appendChild(thumb);
      wrap.appendChild(rm);
      attachmentsEl.appendChild(wrap);
    }
  }

  function syncSendState() {
    const canSend = Boolean(
      (input.value.trim() || pendingImages.length) && !chatState.sending && chatState.activeId,
    );
    sendBtn.disabled = !canSend;
  }

  async function addPendingImages(files) {
    if (chatState.sending || !files?.length) return;
    const room = CHAT_MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
      showChatToast(`Max ${CHAT_MAX_IMAGES} images per message`);
      return;
    }
    const slice = Array.from(files).slice(0, room);
    const added = await collectChatImageFiles(slice);
    if (!added.length) return;
    pendingImages.push(...added);
    if (files.length > room) showChatToast(`Only ${CHAT_MAX_IMAGES} images per message`);
    renderPendingAttachments();
    syncSendState();
    input.focus();
  }

  compose.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (chatState.sending) return;
    compose.classList.add('ch-compose-drag');
  });
  compose.addEventListener('dragleave', (e) => {
    if (!compose.contains(e.relatedTarget)) compose.classList.remove('ch-compose-drag');
  });
  compose.addEventListener('drop', (e) => {
    e.preventDefault();
    compose.classList.remove('ch-compose-drag');
    if (chatState.sending) return;
    addPendingImages([...(e.dataTransfer?.files || [])]);
  });
  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    addPendingImages(files);
  });
  input.addEventListener('input', syncSendState);

  renderChatMessages(messagesEl, input);
  pane.appendChild(messagesEl);

  async function doSend() {
    const text = input.value.trim();
    const images = pendingImages.map(({ mediaType, data }) => ({ mediaType, data }));
    if ((!text && !images.length) || chatState.sending || !chatState.activeId) return;
    const userContent = serializeChatMsgContent(text, images);
    chatState.sending = true;
    input.value = '';
    pendingImages = [];
    renderPendingAttachments();
    input.disabled = true;
    sendBtn.disabled = true;
    chatState.messages.push({ role: 'user', content: userContent });
    renderChatMessages(messagesEl, input);

    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatState.activeId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, images }),
      });
      const data = await readApiJson(res);
      chatState.messages.push({ role: 'assistant', content: data.assistantMessage.content });
      if (data.title) {
        chatState.title = data.title;
        const thread = chatState.threads.find((t) => t.id === chatState.activeId);
        if (thread) thread.title = data.title;
      }
    } catch (e) {
      chatState.messages.push({ role: 'assistant', content: `Error: ${e.message}` });
    } finally {
      chatState.sending = false;
      input.disabled = false;
      sendBtn.disabled = false;
      renderChatPanel();
      const newInput = getChatPanel()?.querySelector('.ch-input');
      newInput?.focus();
    }
  }

  sendBtn.addEventListener('click', doSend);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  compose.appendChild(composeMain);
  compose.appendChild(sendBtn);
  pane.appendChild(compose);

  root.appendChild(pane);
  getChatPanel()?.classList.add('ch-pane-active');
  syncSendState();
  if (chatState.pendingDraft) {
    input.value = chatState.pendingDraft;
    chatState.pendingDraft = null;
    syncSendState();
    if (chatState.pendingAutoSend) {
      chatState.pendingAutoSend = false;
      void doSend();
      return;
    }
  }
  input.focus();
}

async function startNewChat() {
  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await readApiJson(res);
    const thread = data.thread;
    chatState.threads.unshift(thread);
    chatState.activeId = thread.id;
    chatState.title = thread.title;
    chatState.messages = [];
    renderChatPanel();
  } catch (e) {
    alert(`Could not create chat: ${e.message}`);
  }
}

async function openChat(id) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    chatState.activeId = id;
    chatState.title = data.thread.title;
    chatState.messages = data.thread.messages || [];
    renderChatPanel();
  } catch (e) {
    alert(`Could not load chat: ${e.message}`);
  }
}

async function deleteChat(id, title) {
  if (!id) return;
  const label = (title || 'this chat').trim() || 'this chat';
  const ok = await osConfirm({
    title: 'Delete chat?',
    bodyHtml: `<p>Permanently delete <strong>${escHtml(label.slice(0, 80))}</strong> and all messages?</p>`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status !== 404) await readApiJson(res);
    chatState.threads = chatState.threads.filter((t) => t.id !== id);
    if (chatState.activeId === id) {
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      getChatPanel()?.classList.remove('ch-pane-active');
    }
    renderChatPanel();
  } catch (e) {
    osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}

async function archiveChat(t) {
  closeOpenSwipeRow();
  const unarchive = !!t.archived;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(t.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !unarchive }),
    });
    await readApiJson(res);
    if (!chatState.showArchived && !unarchive) {
      chatState.threads = chatState.threads.filter((e) => e.id !== t.id);
      if (chatState.activeId === t.id) {
        chatState.activeId = null;
        chatState.messages = [];
        chatState.title = '';
        getChatPanel()?.classList.remove('ch-pane-active');
      }
    } else {
      const idx = chatState.threads.findIndex((e) => e.id === t.id);
      if (idx !== -1) chatState.threads[idx] = { ...chatState.threads[idx], archived: !unarchive };
    }
    renderChatPanel();
  } catch (e) {
    osAlert({
      title: unarchive ? 'Could not restore chat' : 'Could not archive chat',
      bodyHtml: escHtml(e.message),
    });
  }
}

// ---- email tab (inbox summaries) ----
let emailState = {
  events: [],
  activeId: null,
  storage: 'files',
  digest: null,
  showJunk: false,
  pushConfigured: false,
};
let emailPollTimer = null;
let inboxBadgeTimer = null;

const INBOX_LAST_SEEN_KEY = 'reave-inbox-last-seen';
const BADGE_CACHE = 'reave-badge-v1';
const BADGE_URL = '/badge-count';

function getEmailPanel() { return document.getElementById('email-panel'); }

function inboxLastSeenIso() {
  try {
    return localStorage.getItem(INBOX_LAST_SEEN_KEY) || '';
  } catch {
    return '';
  }
}

function markInboxLastSeen() {
  try {
    localStorage.setItem(INBOX_LAST_SEEN_KEY, new Date().toISOString());
  } catch {}
}

async function clearCachedBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.delete(BADGE_URL);
  } catch {}
}

async function setAppIconBadge(n) {
  if (!('setAppBadge' in navigator)) return;
  try {
    if (n > 0) await navigator.setAppBadge(n);
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch (e) {
    console.warn('[badge]', e);
  }
}

function unreadInboxCount(events) {
  const last = inboxLastSeenIso() ? new Date(inboxLastSeenIso()).getTime() : 0;
  return (events || []).filter((ev) => {
    if (ev.category === 'junk') return false;
    return new Date(ev.receivedAt).getTime() > last;
  }).length;
}

async function readCachedBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const res = await cache.match(BADGE_URL);
    if (!res) return 0;
    return parseInt(await res.text(), 10) || 0;
  } catch {
    return 0;
  }
}

async function syncInboxAppBadge(events) {
  if (MAP.type === 'email') {
    markInboxLastSeen();
    await clearCachedBadgeCount();
    await setAppIconBadge(0);
    syncTopbarInboxBadge(0);
    return;
  }
  const cached = await readCachedBadgeCount();
  const unread = unreadInboxCount(events);
  const n = Math.max(unread, cached);
  await setAppIconBadge(n);
  syncTopbarInboxBadge(n);
}

async function markInboxSeenAndClearBadge() {
  markInboxLastSeen();
  await clearCachedBadgeCount();
  await setAppIconBadge(0);
  syncTopbarInboxBadge(0);
}

async function refreshInboxBadgeQuiet() {
  if (MAP.type === 'email') {
    await markInboxSeenAndClearBadge();
    return;
  }
  try {
    const res = await fetch('/api/email/inbox?limit=100', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) return;
    const events = data.events || [];
    syncTopbarInboxBadge(Math.max(unreadInboxCount(events), await readCachedBadgeCount()));
    await syncInboxAppBadge(events);
  } catch {}
}

function stopInboxBadgePoll() {
  if (inboxBadgeTimer) {
    clearInterval(inboxBadgeTimer);
    inboxBadgeTimer = null;
  }
}

function syncInboxBadgePoll() {
  stopInboxBadgePoll();
  if (!document.hidden) {
    refreshInboxBadgeQuiet();
    inboxBadgeTimer = setInterval(refreshInboxBadgeQuiet, 60000);
  }
}

function emailCategoryClass(cat) {
  const key = String(cat || 'review').toLowerCase();
  const known = new Set(['junk', 'client', 'alert', 'internal', 'review']);
  return known.has(key) ? `em-cat-${key}` : 'em-cat-review';
}

function formatEmailAction(ev) {
  const bits = [ev.action];
  if (ev.jobTitle) bits.push(ev.jobTitle);
  if (ev.routeNote && !ev.jobTitle) bits.push(ev.routeNote);
  return bits.join(' · ');
}

// ---- swipe rows (iOS-style list actions) ----
let openSwipeRow = null;

function closeOpenSwipeRow() {
  if (openSwipeRow) {
    openSwipeRow.snap(false);
    openSwipeRow = null;
  }
}

function bindSwipeListScroll(listEl) {
  listEl.addEventListener('scroll', closeOpenSwipeRow, { passive: true });
}

function createSwipeRow(contentEl, actions) {
  const row = document.createElement('div');
  row.className = 'swipe-row';
  if (contentEl.dataset?.id) row.dataset.id = contentEl.dataset.id;
  if (contentEl.dataset?.slug) row.dataset.slug = contentEl.dataset.slug;

  const actionsEl = document.createElement('div');
  actionsEl.className = 'swipe-actions';
  for (const act of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = act.className || 'swipe-act';
    btn.textContent = act.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.onClick();
    });
    actionsEl.appendChild(btn);
  }

  const content = document.createElement('div');
  content.className = 'swipe-content';
  content.appendChild(contentEl);
  row.appendChild(actionsEl);
  row.appendChild(content);

  requestAnimationFrame(() => {
    const revealPx = actionsEl.offsetWidth || Math.max(72 * actions.length, 72);
    attachSwipeRow(row, content, revealPx);
  });
  return row;
}

function attachSwipeRow(row, contentEl, revealPx) {
  let startX = 0;
  let baseX = 0;
  let dragging = false;
  let moved = false;
  let open = false;

  function currentTx() {
    const m = contentEl.style.transform.match(/translate3d\(([-\d.]+)px/);
    return m ? parseFloat(m[1]) : 0;
  }

  function setTranslate(x, animate) {
    contentEl.style.transition = animate ? 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none';
    contentEl.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function snap(shouldOpen) {
    open = shouldOpen;
    row.classList.toggle('swipe-open', open);
    setTranslate(open ? -revealPx : 0, true);
    if (open) {
      if (openSwipeRow && openSwipeRow !== api) openSwipeRow.snap(false);
      openSwipeRow = api;
    } else if (openSwipeRow === api) {
      openSwipeRow = null;
    }
  }

  function onStart(clientX) {
    if (openSwipeRow && openSwipeRow !== api) closeOpenSwipeRow();
    startX = clientX;
    baseX = open ? -revealPx : 0;
    dragging = true;
    moved = false;
    contentEl.style.transition = 'none';
  }

  function onMove(clientX, prevent) {
    if (!dragging) return;
    const dx = clientX - startX;
    if (Math.abs(dx) > 6) moved = true;
    let next = baseX + dx;
    next = Math.min(0, Math.max(-revealPx, next));
    setTranslate(next, false);
    if (Math.abs(dx) > 8 && prevent) prevent();
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    const tx = currentTx();
    snap(tx <= -revealPx * 0.35);
  }

  contentEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      onStart(e.touches[0].clientX);
    },
    { passive: true },
  );
  contentEl.addEventListener(
    'touchmove',
    (e) => onMove(e.touches[0].clientX, () => e.preventDefault()),
    { passive: false },
  );
  contentEl.addEventListener('touchend', onEnd);
  contentEl.addEventListener('touchcancel', onEnd);

  contentEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    onStart(e.clientX);
    const onMouseMove = (ev) => onMove(ev.clientX, null);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onEnd();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  contentEl.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );

  const api = { snap, row, moved: () => moved };
  return api;
}

document.addEventListener('click', (e) => {
  if (!openSwipeRow) return;
  if (openSwipeRow.row.contains(e.target)) return;
  closeOpenSwipeRow();
});

async function askAgentWithPrompt(prompt) {
  closeOpenSwipeRow();
  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await readApiJson(res);
    const thread = data.thread;
    chatState.threads.unshift(thread);
    chatState.activeId = thread.id;
    chatState.title = thread.title;
    chatState.messages = [];
    chatState.pendingDraft = prompt;
    chatState.pendingAutoSend = true;

    if (activeKey === 'chats') {
      renderChatPanel();
    } else {
      setActiveMap('chats', { force: true, keepChatSession: true });
    }
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

function buildAgentContentPrompt(intro, metaLines, body) {
  const lines = [intro, '', ...metaLines];
  const trimmed = (body || '').trim();
  if (trimmed) lines.push('', '---', trimmed.slice(0, 12000));
  return lines.join('\n');
}

async function askAgentAboutKnowledge(entry) {
  try {
    const res = await fetch(`/api/knowledge/${encodeURIComponent(entry.slug)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    const prompt = buildAgentContentPrompt(
      'Help me work with this knowledge doc:',
      [`Title: ${entry.title}`, `Slug: ${entry.slug}`],
      data.content,
    );
    await askAgentWithPrompt(prompt);
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

async function askAgentAboutDocument(tpl) {
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(tpl.slug)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    const prompt = buildAgentContentPrompt(
      'Help me work with this document template:',
      [`Title: ${tpl.title}`, `Slug: ${tpl.slug}`],
      data.content || data.html,
    );
    await askAgentWithPrompt(prompt);
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

async function askAgentAboutWork(job) {
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(job.slug)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    const meta = [`Title: ${job.title}`, `Slug: ${job.slug}`];
    if (job.contact_name || job.client) meta.push(`Client: ${job.contact_name || job.client}`);
    if (job.status) meta.push(`Status: ${WORK_STATUS_LABELS[job.status] || job.status}`);
    const prompt = buildAgentContentPrompt('Help me work with this job:', meta, data.content || data.body);
    await askAgentWithPrompt(prompt);
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

function createDocumentListItem(tpl) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (tpl.slug === docState.activeSlug ? ' active' : '');
  item.dataset.slug = tpl.slug;
  item.innerHTML =
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(tpl.title)}</span></span>` +
    `<span class="ch-item-sub ch-item-slug">${escHtml(tpl.slug)}</span>`;
  item.addEventListener('click', () => openDocument(tpl.slug));
  return item;
}

function createDocumentSwipeRow(tpl) {
  return createSwipeRow(createDocumentListItem(tpl), [
    {
      label: 'Agent',
      className: 'swipe-act swipe-act-agent',
      onClick: () => askAgentAboutDocument(tpl),
    },
    {
      label: 'Delete',
      className: 'swipe-act swipe-act-delete',
      onClick: () => deleteDocument(tpl.slug),
    },
  ]);
}

function createKnowledgeListItem(entry) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (entry.slug === knowledgeState.activeSlug ? ' active' : '');
  item.dataset.slug = entry.slug;
  item.innerHTML =
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(entry.title)}</span></span>` +
    `<span class="ch-item-sub ch-item-slug">${escHtml(entry.slug)}</span>`;
  item.addEventListener('click', () => openKnowledge(entry.slug));
  return item;
}

function createKnowledgeSwipeRow(entry) {
  return createSwipeRow(createKnowledgeListItem(entry), [
    {
      label: 'Agent',
      className: 'swipe-act swipe-act-agent',
      onClick: () => askAgentAboutKnowledge(entry),
    },
    {
      label: 'Delete',
      className: 'swipe-act swipe-act-delete',
      onClick: () => deleteKnowledge(entry.slug),
    },
  ]);
}

function createWorkListItem(job) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (job.slug === workState.activeSlug ? ' active' : '');
  item.dataset.slug = job.slug;
  item.innerHTML =
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(job.title)}</span></span>` +
    `<span class="wk-meta-row">` +
    `<span class="wk-contact">${escHtml(job.contact_name || job.client || '—')}</span>` +
    `<span class="${workStatusClass(job.status)}">${escHtml(WORK_STATUS_LABELS[job.status] || job.status)}</span>` +
    `</span>`;
  item.addEventListener('click', () => openWork(job.slug));
  return item;
}

function createWorkSwipeRow(job) {
  return createSwipeRow(createWorkListItem(job), [
    {
      label: 'Agent',
      className: 'swipe-act swipe-act-agent',
      onClick: () => askAgentAboutWork(job),
    },
    {
      label: 'Delete',
      className: 'swipe-act swipe-act-delete',
      onClick: () => deleteWork(job.slug),
    },
  ]);
}

function createClientListItem(c) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (c.uid === clientState.activeUid ? ' active' : '');
  item.dataset.id = c.uid;
  item.innerHTML =
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(c.name)}</span></span>` +
    `<span class="wk-meta-row">` +
    `<span class="wk-contact">${escHtml(clientSubline(c))}</span>` +
    (c.archived ? '<span class="cl-archived">Archived</span>' : '') +
    `</span>`;
  item.addEventListener('click', () => openClient(c.uid));
  return item;
}

function createClientSwipeRow(c) {
  return createSwipeRow(createClientListItem(c), [
    {
      label: 'Delete',
      className: 'swipe-act swipe-act-delete',
      onClick: () => deleteClient(c.uid, c.name),
    },
  ]);
}

function buildEmailAgentPrompt(ev) {
  const lines = [
    '[Email triage]',
    '',
    'Purpose of this chat: decide what to DO with this inbound email.',
    'I have already read it — do not summarize it or explain what it says back to me.',
    '',
    'Respond with:',
    '1. Recommended action (reply, ignore, archive, schedule follow-up, create a job, escalate, mark junk, etc.)',
    '2. One sentence on why',
    '3. Concrete next steps I should take now',
    '',
    'If replying makes sense, include a draft I can send.',
    'Be direct and action-oriented.',
    '',
    '---',
    'Email (context only — do not recap):',
    `From: ${ev.from || '(unknown)'}`,
  ];
  if (ev.contactName) lines.push(`Client: ${ev.contactName}`);
  lines.push(`Subject: ${ev.subject || '(no subject)'}`);
  lines.push(`Category: ${ev.category || 'review'}`);
  if (ev.routeNote) lines.push(`Route: ${ev.routeNote}`);
  const body = (ev.bodySnippet || '').trim();
  if (body) {
    lines.push('', body);
  }
  return lines.join('\n');
}

async function askAgentAboutEmail(ev) {
  await askAgentWithPrompt(buildEmailAgentPrompt(ev));
}

async function markEmailJunk(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'junk', action: 'junk' }),
    });
    const data = await readApiJson(res);
    if (!emailState.showJunk) {
      emailState.events = emailState.events.filter((e) => e.id !== ev.id);
      if (emailState.activeId === ev.id) emailState.activeId = null;
    } else {
      const idx = emailState.events.findIndex((e) => e.id === ev.id);
      if (idx !== -1) emailState.events[idx] = data.event;
    }
    renderEmailPanel();
    syncInboxAppBadge(emailState.events);
  } catch (e) {
    osAlert({ title: 'Could not mark junk', bodyHtml: escHtml(e.message) });
  }
}

async function deleteEmail(ev) {
  closeOpenSwipeRow();
  const summary = ev.summary || ev.subject || ev.from || 'this message';
  const ok = await osConfirm({
    title: 'Delete message?',
    bodyHtml: `<p>Remove <strong>${escHtml(summary.slice(0, 80))}</strong> from the inbox log?</p>`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    await readApiJson(res);
    emailState.events = emailState.events.filter((e) => e.id !== ev.id);
    if (emailState.activeId === ev.id) emailState.activeId = null;
    renderEmailPanel();
    syncInboxAppBadge(emailState.events);
  } catch (e) {
    osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}

function createEmailListItem(ev) {
  const summary = ev.summary || ev.bodySnippet || ev.subject || '(no summary)';
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'em-list-item' + (ev.id === emailState.activeId ? ' active' : '');
  item.dataset.id = ev.id;
  item.innerHTML =
    `<span class="em-item-row">` +
      `<span class="em-status ${emailCategoryClass(ev.category)}">${escHtml(ev.category || 'review')}</span>` +
      `<span class="em-item-date">${escHtml(formatChatDate(ev.receivedAt))}</span>` +
    `</span>` +
    `<span class="em-item-summary">${escHtml(summary)}</span>` +
    `<span class="em-item-from">${escHtml(ev.contactName || ev.from || '(unknown)')}</span>`;
  item.addEventListener('click', () => openEmailEvent(ev.id));
  return item;
}

function createEmailSwipeRow(ev) {
  return createSwipeRow(createEmailListItem(ev), [
    {
      label: 'Agent',
      className: 'swipe-act swipe-act-agent',
      onClick: () => askAgentAboutEmail(ev),
    },
    {
      label: ev.category === 'junk' ? 'Not junk' : 'Junk',
      className: 'swipe-act swipe-act-junk',
      onClick: () => {
        if (ev.category === 'junk') {
          fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'review', action: 'review' }),
          })
            .then(readApiJson)
            .then((data) => {
              const idx = emailState.events.findIndex((e) => e.id === ev.id);
              if (idx !== -1) emailState.events[idx] = data.event;
              renderEmailPanel();
            })
            .catch((err) => osAlert({ title: 'Update failed', bodyHtml: escHtml(err.message) }));
        } else {
          markEmailJunk(ev);
        }
      },
    },
    {
      label: 'Delete',
      className: 'swipe-act swipe-act-delete',
      onClick: () => deleteEmail(ev),
    },
  ]);
}

function stopEmailPoll() {
  if (emailPollTimer) {
    clearInterval(emailPollTimer);
    emailPollTimer = null;
  }
}

function syncEmailPoll() {
  stopEmailPoll();
  if (MAP.type === 'email' && !document.hidden) {
    emailPollTimer = setInterval(() => loadEmailTab(true), 45000);
  }
}

async function loadEmailTab(quiet) {
  const root = getEmailPanel();
  if (!root) return;
  if (!quiet) root.innerHTML = '<div class="de-loading">Loading inbox…</div>';
  const junkQ = emailState.showJunk ? '?junk=1' : '';
  try {
    const res = await fetch(`/api/email/inbox${junkQ}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    emailState.events = data.events || [];
    emailState.storage = data.storage || 'files';
    emailState.digest = data.digest || null;
    emailState.pushConfigured = !!data.pushConfigured;
  } catch (e) {
    if (!quiet) root.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    return;
  }
  if (emailState.activeId && !emailState.events.some((ev) => ev.id === emailState.activeId)) {
    emailState.activeId = null;
  }
  getEmailPanel()?.classList.remove('em-pane-active');
  renderEmailPanel();
  if (MAP.type === 'email') {
    markInboxSeenAndClearBadge();
  } else {
    syncInboxAppBadge(emailState.events);
  }
}

function renderEmailDigest() {
  const d = emailState.digest;
  if (!d) return null;
  const el = document.createElement('div');
  el.className = 'em-digest';
  const parts = [`${d.visible} shown`];
  if (d.filed) parts.push(`${d.filed} filed to jobs`);
  if (d.review) parts.push(`${d.review} need review`);
  if (d.alert) parts.push(`${d.alert} alerts`);
  if (d.junkHidden && !emailState.showJunk) parts.push(`${d.junkHidden} junk hidden`);
  el.textContent = parts.join(' · ');
  return el;
}

function renderEmailSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const toolbar = document.createElement('div');
  toolbar.className = 'em-toolbar';
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'em-refresh';
  refreshBtn.textContent = '↻ Refresh';
  refreshBtn.addEventListener('click', () => loadEmailTab());
  toolbar.appendChild(refreshBtn);

  const junkBtn = document.createElement('button');
  junkBtn.className = 'em-refresh';
  junkBtn.textContent = emailState.showJunk ? 'Hide junk' : 'Show junk';
  junkBtn.addEventListener('click', () => {
    emailState.showJunk = !emailState.showJunk;
    loadEmailTab();
  });
  toolbar.appendChild(junkBtn);
  sidebar.appendChild(toolbar);

  const digest = renderEmailDigest();
  if (digest) sidebar.appendChild(digest);

  const list = document.createElement('div');
  list.className = 'ch-list';
  list.addEventListener('scroll', closeOpenSwipeRow, { passive: true });
  for (const ev of emailState.events) {
    list.appendChild(createEmailSwipeRow(ev));
  }
  if (emailState.events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.innerHTML = emailState.showJunk
      ? 'No messages.'
      : 'No inbound email yet.<br><span class="em-hint">Forward or BCC copies to your Resend address (e.g. inbox@mail.reave.app).</span>';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  return sidebar;
}

function openEmailEvent(id) {
  emailState.activeId = id;
  renderEmailPanel();
}

function renderEmailPanel() {
  const root = getEmailPanel();
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(renderEmailSidebar());

  const pane = document.createElement('div');
  pane.className = 'ch-pane';

  const ev = emailState.events.find((e) => e.id === emailState.activeId);
  if (!ev) {
    const ph = document.createElement('div');
    ph.className = 'de-placeholder';
    ph.innerHTML = '<div class="de-placeholder-icon">📬</div><p>Your inbox summaries appear here.</p><p class="em-hint">Install this app to your home screen and tap 🔔 for phone notifications.</p>';
    pane.appendChild(ph);
    root.appendChild(pane);
    return;
  }

  const header = document.createElement('div');
  header.className = 'de-header';
  const backBtn = document.createElement('button');
  backBtn.className = 'de-back-btn';
  backBtn.textContent = '← Inbox';
  backBtn.addEventListener('click', () => {
    emailState.activeId = null;
    getEmailPanel()?.classList.remove('em-pane-active');
    renderEmailPanel();
  });
  header.appendChild(backBtn);
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name';
  titleEl.textContent = ev.subject || '(no subject)';
  header.appendChild(titleEl);
  const agentBtn = document.createElement('button');
  agentBtn.type = 'button';
  agentBtn.className = 'de-new-btn em-agent-btn';
  agentBtn.textContent = 'Agent';
  agentBtn.addEventListener('click', () => askAgentAboutEmail(ev));
  header.appendChild(agentBtn);
  pane.appendChild(header);

  const detail = document.createElement('div');
  detail.className = 'em-detail';
  const summary = ev.summary || ev.bodySnippet || '';
  detail.innerHTML =
    `<div class="em-item-row"><span class="em-status ${emailCategoryClass(ev.category)}">${escHtml(ev.category || 'review')}</span></div>` +
    (summary ? `<div class="em-detail-summary">${escHtml(summary)}</div>` : '') +
    `<div class="em-detail-subject">${escHtml(ev.subject || '(no subject)')}</div>` +
    `<div class="em-detail-meta">` +
      `<span><strong>From</strong> ${escHtml(ev.from || '(unknown)')}</span>` +
      (ev.contactName ? `<span><strong>Client</strong> ${escHtml(ev.contactName)}</span>` : '') +
      (ev.jobTitle ? `<span><strong>Job</strong> ${escHtml(ev.jobTitle)}</span>` : '') +
      `<span><strong>Received</strong> ${escHtml(new Date(ev.receivedAt).toLocaleString())}</span>` +
      `<span><strong>Action</strong> ${escHtml(formatEmailAction(ev))}</span>` +
      (ev.routeNote ? `<span><strong>Route</strong> ${escHtml(ev.routeNote)}</span>` : '') +
    `</div>` +
    (ev.bodySnippet && ev.bodySnippet !== summary
      ? `<div class="em-detail-body">${escHtml(ev.bodySnippet)}</div>`
      : '');
  pane.appendChild(detail);

  root.appendChild(pane);
  getEmailPanel()?.classList.add('em-pane-active');
}

// ---- persistence ----
function savePositions() {
  const pos = {};
  for (const n of byId.values()) pos[n.id] = { x: n.x, y: n.y };
  try {
    localStorage.setItem(storeKey(), JSON.stringify(pos));
  } catch {}
}
function loadPositions() {
  let pos;
  try {
    pos = JSON.parse(localStorage.getItem(storeKey()) || 'null');
  } catch {
    pos = null;
  }
  if (!pos) return;
  for (const n of byId.values()) {
    if (pos[n.id]) {
      n.x = pos[n.id].x;
      n.y = pos[n.id].y;
    }
  }
}
function loadActiveKey() {
  try {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && MAPS[tab]) return tab;
  } catch {}
  let key;
  try {
    key = localStorage.getItem(MAP_STORE);
  } catch {
    key = null;
  }
  return MAPS[key] ? key : 'chats';
}
function saveActiveKey() {
  try {
    localStorage.setItem(MAP_STORE, activeKey);
  } catch {}
}

// ---- init ----
async function rebuildTabsForViewport() {
  const order = await resolveTabOrder();
  buildTabs(order);
  await buildMobileToolsMenu(order);
}

async function boot() {
  const tabOrder = await resolveTabOrder();
  buildTabs(tabOrder);
  await buildMobileToolsMenu(tabOrder);
  initTopbarMenus();
  MOBILE_TABS_MQ.addEventListener('change', rebuildTabsForViewport);
  COMPACT_TABS_MQ.addEventListener('change', rebuildTabsForViewport);
  initModelSelector();
  syncCanvasVisibility();
  activateMapPanel();
  syncHealthLifecycle();
  syncEmailPoll();
  syncInboxBadgePoll();
}

boot();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'reave-inbox-push') refreshInboxBadgeQuiet();
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopHealth();
    stopEmailPoll();
    stopInboxBadgePoll();
  } else {
    syncHealthLifecycle();
    syncEmailPoll();
    syncInboxBadgePoll();
  }
});
