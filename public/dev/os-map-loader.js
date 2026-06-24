import { MAPS } from '/dev/os-map-data.js';

const GRID = 12;
const STORE = 'os-map-pos-v2';
const MAP_STORE = 'os-map-active-v1';
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
}

function setActiveMap(key) {
  if (!MAPS[key] || key === activeKey) {
    if (MAPS[key]) updateTabs();
    return;
  }
  activeKey = key;
  MAP = MAPS[key];
  saveActiveKey();
  updateTabs();
  syncCanvasVisibility();
  if (MAP.type === 'documents') {
    loadDocumentsTab();
  } else if (MAP.type === 'knowledge') {
    loadKnowledgeTab();
  } else if (MAP.type === 'work') {
    loadWorkTab();
  } else if (MAP.type === 'clients') {
    loadClientsTab();
  } else if (MAP.type === 'chats') {
    loadChatsTab();
  } else {
    buildMap();
    requestAnimationFrame(() => { redraw(); fit(); });
    if (MAP.type === 'todo') loadAndBuildTodoNodes();
    if (MAP.type === 'rules') loadAndBuildRuleNodes();
  }
  syncHealthLifecycle();
}

function isPanelTab() {
  return MAP.type === 'documents' || MAP.type === 'knowledge' || MAP.type === 'work' || MAP.type === 'clients' || MAP.type === 'chats';
}

function syncCanvasVisibility() {
  const isPanel = isPanelTab();
  wrap.style.display = isPanel ? 'none' : '';
  document.getElementById('tools').style.display = isPanel ? 'none' : '';
  document.getElementById('legend').style.display = isPanel ? 'none' : '';
  document.getElementById('doc-editor').style.display = MAP.type === 'documents' ? 'flex' : 'none';
  document.getElementById('knowledge-editor').style.display = MAP.type === 'knowledge' ? 'flex' : 'none';
  document.getElementById('work-editor').style.display = MAP.type === 'work' ? 'flex' : 'none';
  document.getElementById('clients-editor').style.display = MAP.type === 'clients' ? 'flex' : 'none';
  document.getElementById('chat-panel').style.display = MAP.type === 'chats' ? 'flex' : 'none';
  document.getElementById('rule-editor').style.display = MAP.type === 'rules' ? 'flex' : 'none';
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

// ---- rendering ----
function rect(n) {
  const el = nodeEls.get(n.id);
  return { x: n.x, y: n.y, w: el.offsetWidth, h: el.offsetHeight };
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
    n.x = orig.x;
    n.y = orig.y;
    const el = nodeEls.get(n.id);
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
  }
  redraw();
  fit();
});

// ---- tabs ----
function buildTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  for (const key of Object.keys(MAPS)) {
    const btn = document.createElement('button');
    btn.dataset.map = key;
    const m = MAPS[key];
    btn.innerHTML = m.icon
      ? `<span class="tab-icon">${m.icon}</span><span class="tab-label">${m.title}</span>`
      : m.title;
    btn.title = m.title;
    btn.addEventListener('click', () => setActiveMap(key));
    tabs.appendChild(btn);
  }
  updateTabs();
}
function updateTabs() {
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.map === activeKey);
  });
}

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
  const COL_W = 240;
  const ROW_H = 108;
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
  requestAnimationFrame(() => { redraw(); fit(); });
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
    const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
  const COL_W = 260;
  const ROW_H = 108;
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
  requestAnimationFrame(() => { redraw(); fit(); });
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
  sidebar.className = 'de-sidebar';

  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn';
  newBtn.textContent = '+ New Document';
  newBtn.addEventListener('click', () => startNewDocument());
  sidebar.appendChild(newBtn);

  const list = document.createElement('div');
  list.className = 'de-list';
  for (const tpl of templates) {
    const item = document.createElement('button');
    item.className = 'de-list-item' + (tpl.slug === activeSlug ? ' active' : '');
    item.dataset.slug = tpl.slug;
    item.innerHTML = `<span class="de-item-title">${escHtml(tpl.title)}</span><span class="de-item-slug">${escHtml(tpl.slug)}</span>`;
    item.addEventListener('click', () => openDocument(tpl.slug));
    list.appendChild(item);
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
    document.querySelector(`.de-list-item[data-slug="${CSS.escape(slug)}"] .de-item-title`)
      ?.replaceWith(Object.assign(document.createElement('span'), { className: 'de-item-title', textContent: newTitle }));
  } catch (e) {
    btn.textContent = 'Save';
    btn.disabled = false;
    alert(`Failed to save: ${e.message}`);
  }
}

async function deleteDocument(slug) {
  const tpl = docState.templates.find((t) => t.slug === slug);
  if (!confirm(`Delete "${tpl?.title ?? slug}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(slug)}`, { method: 'DELETE' });
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
  sidebar.className = 'de-sidebar';

  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn';
  newBtn.textContent = '+ New Doc';
  newBtn.addEventListener('click', () => {
    knowledgeState.activeSlug = '__new__';
    knowledgeState.dirty = false;
    renderKnowledgeEditor();
  });
  sidebar.appendChild(newBtn);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.7rem 0.5rem';
  hint.textContent = 'Markdown in src/knowledge/ · bot reads on deploy';
  sidebar.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'de-list';
  for (const entry of entries) {
    const item = document.createElement('button');
    item.className = 'de-list-item' + (entry.slug === activeSlug ? ' active' : '');
    item.innerHTML =
      `<span class="de-item-title">${escHtml(entry.title)}</span>` +
      `<span class="de-item-slug">${escHtml(entry.slug)}</span>`;
    item.addEventListener('click', () => openKnowledge(entry.slug));
    list.appendChild(item);
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

let workState = {
  jobs: [],
  statuses: ['inquiry', 'active', 'done', 'archived'],
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
  sidebar.className = 'de-sidebar';

  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn';
  newBtn.textContent = '+ New Job';
  newBtn.addEventListener('click', () => {
    workState.activeSlug = '__new__';
    workState.dirty = false;
    workState.draft = { title: '', contact_uid: '', contact_name: '', status: 'inquiry', body: '' };
    renderWorkEditor();
  });
  sidebar.appendChild(newBtn);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.7rem 0.5rem';
  hint.textContent = 'Jobs in src/knowledge/jobs/ · pick or add a client';
  sidebar.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'de-list';
  for (const job of jobs) {
    const item = document.createElement('button');
    item.className = 'de-list-item' + (job.slug === activeSlug ? ' active' : '');
    item.innerHTML =
      `<span class="de-item-title">${escHtml(job.title)}</span>` +
      `<span class="wk-meta-row">` +
      `<span class="wk-contact">${escHtml(job.contact_name || job.client || '—')}</span>` +
      `<span class="${workStatusClass(job.status)}">${escHtml(WORK_STATUS_LABELS[job.status] || job.status)}</span>` +
      `</span>`;
    item.addEventListener('click', () => openWork(job.slug));
    list.appendChild(item);
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
    selectedEl.style.display = has && !showingNew ? 'flex' : 'none';
    searchWrap.style.display = has && !showingNew ? 'none' : showingNew ? 'none' : 'block';
    newForm.style.display = showingNew ? 'flex' : 'none';
    if (has) selectedName.textContent = selected.name;
  }

  function pick(client) {
    selected = { uid: client.uid, name: client.name };
    showingNew = false;
    dropdown.style.display = 'none';
    searchInput.value = '';
    syncView();
    onChange?.();
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
    selected = null;
    showingNew = false;
    syncView();
    searchInput.focus();
    scheduleSearch();
    onChange?.();
  });

  searchInput.addEventListener('focus', () => scheduleSearch());
  searchInput.addEventListener('input', () => scheduleSearch());

  newCancel.addEventListener('click', () => {
    showingNew = false;
    syncView();
    searchInput.focus();
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
    if (!wrap.contains(ev.target)) dropdown.style.display = 'none';
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
      body: ta.value,
    });
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(createBtn);
  pane.appendChild(actions);
  getWorkEditor()?.classList.add('de-pane-active');
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
      const markDirty = () => {
        const client = clientPicker.getPayload();
        workState.dirty =
          titleInput.value !== workState.draft.title ||
          (client?.contact_uid || '') !== (workState.draft.contact_uid || '') ||
          statusSelect.value !== workState.draft.status ||
          ta.value !== workState.draft.body;
      };
      clientPicker = mountWorkClientPicker(fields, workState.draft, markDirty);

      const statusLabel = document.createElement('label');
      statusLabel.className = 'de-label';
      statusLabel.textContent = 'Status';
      const statusSelect = buildStatusSelect(workState.draft.status);
      statusLabel.appendChild(statusSelect);
      fields.appendChild(statusLabel);

      titleInput.addEventListener('input', markDirty);
      statusSelect.addEventListener('change', markDirty);
      ta.addEventListener('input', markDirty);
      pane.appendChild(ta);

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
  sidebar.className = 'de-sidebar';

  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn';
  newBtn.textContent = '+ New Client';
  newBtn.addEventListener('click', () => {
    clientState.activeUid = '__new__';
    clientState.dirty = false;
    clientState.draft = { name: '', email: '', phone: '', company: '', notes: '' };
    renderClientsEditor();
  });
  sidebar.appendChild(newBtn);

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
  hint.style.padding = '0 0.7rem 0.5rem';
  hint.textContent = `contact-api · ${total} total`;
  sidebar.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'de-list';
  for (const c of clients) {
    const item = document.createElement('button');
    item.className = 'de-list-item' + (c.uid === activeUid ? ' active' : '');
    item.innerHTML =
      `<span class="de-item-title">${escHtml(c.name)}</span>` +
      `<span class="wk-meta-row">` +
      `<span class="wk-contact">${escHtml(clientSubline(c))}</span>` +
      (c.archived ? '<span class="cl-archived">Archived</span>' : '') +
      `</span>`;
    item.addEventListener('click', () => openClient(c.uid));
    list.appendChild(item);
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
      clientState.draft = {
        name: data.name,
        email: data.email || '',
        phone: data.phone || '',
        company: data.company || '',
        notes: data.notes || '',
        portal_url: data.portal_url,
        createdAt: data.createdAt,
        archived: data.archived,
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
      titleEl.textContent = data.name;
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

      const fields = document.createElement('div');
      fields.className = 'de-fields';

      const nameInput = document.createElement('input');
      nameInput.className = 'de-input';
      nameInput.value = clientState.draft.name;
      appendClientField(fields, 'Name', nameInput);

      const emailInput = document.createElement('input');
      emailInput.className = 'de-input';
      emailInput.type = 'email';
      emailInput.value = clientState.draft.email;
      appendClientField(fields, 'Email', emailInput);

      const phoneInput = document.createElement('input');
      phoneInput.className = 'de-input';
      phoneInput.value = clientState.draft.phone;
      appendClientField(fields, 'Phone', phoneInput);

      const companyInput = document.createElement('input');
      companyInput.className = 'de-input';
      companyInput.value = clientState.draft.company;
      appendClientField(fields, 'Company', companyInput);

      pane.appendChild(fields);

      const notesLabel = document.createElement('label');
      notesLabel.className = 'de-label';
      notesLabel.textContent = 'Notes (internal)';
      const notesTa = document.createElement('textarea');
      notesTa.className = 'de-textarea';
      notesTa.spellcheck = false;
      notesTa.value = clientState.draft.notes;
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
      delBtn.addEventListener('click', () => deleteClient(uid, data.name));
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

async function deleteClient(uid, name) {
  if (!confirm(`Delete client "${name}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    clientState.activeUid = null;
    clientState.dirty = false;
    clientState.draft = null;
    await loadClientsTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

// ---- chats tab ----

let chatState = {
  threads: [],
  activeId: null,
  messages: [],
  title: '',
  sending: false,
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

async function loadChatsTab() {
  const root = getChatPanel();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading chats…</div>';
  try {
    const res = await fetch('/api/chats', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    chatState.threads = data.threads || [];
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    return;
  }
  chatState.activeId = null;
  chatState.messages = [];
  chatState.title = '';
  getChatPanel()?.classList.remove('ch-pane-active');
  renderChatPanel();
}

function renderChatSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const newBtn = document.createElement('button');
  newBtn.className = 'de-new-btn';
  newBtn.textContent = '+ New Chat';
  newBtn.addEventListener('click', () => startNewChat());
  sidebar.appendChild(newBtn);

  const list = document.createElement('div');
  list.className = 'ch-list';
  for (const t of chatState.threads) {
    const item = document.createElement('button');
    item.className = 'ch-list-item' + (t.id === chatState.activeId ? ' active' : '');
    item.dataset.id = t.id;
    item.innerHTML =
      `<span class="ch-item-title">${escHtml(t.title)}</span>` +
      `<span class="ch-item-date">${escHtml(formatChatDate(t.updated_at))}</span>`;
    item.addEventListener('click', () => openChat(t.id));
    list.appendChild(item);
  }
  if (chatState.threads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'No chats yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  return sidebar;
}

function renderChatMessages(container) {
  container.innerHTML = '';
  if (chatState.messages.length === 0 && !chatState.sending) {
    const ph = document.createElement('div');
    ph.className = 'de-placeholder';
    ph.innerHTML = '<div class="de-placeholder-icon">💬</div>Send a message to start.';
    container.appendChild(ph);
    return;
  }
  for (const m of chatState.messages) {
    const el = document.createElement('div');
    el.className = 'ch-msg ' + (m.role === 'user' ? 'ch-msg-user' : 'ch-msg-assistant');
    el.textContent = m.content;
    container.appendChild(el);
  }
  if (chatState.sending) {
    const thinking = document.createElement('div');
    thinking.className = 'ch-thinking';
    thinking.textContent = 'Thinking…';
    container.appendChild(thinking);
  }
  container.scrollTop = container.scrollHeight;
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
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name';
  titleEl.textContent = chatState.title || 'Chat';
  header.appendChild(titleEl);
  pane.appendChild(header);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'ch-messages';
  renderChatMessages(messagesEl);
  pane.appendChild(messagesEl);

  const compose = document.createElement('div');
  compose.className = 'ch-compose';
  const input = document.createElement('textarea');
  input.className = 'ch-input';
  input.placeholder = 'Message the agent…';
  input.rows = 1;
  input.disabled = chatState.sending;
  const sendBtn = document.createElement('button');
  sendBtn.className = 'ch-send';
  sendBtn.textContent = 'Send';
  sendBtn.disabled = chatState.sending;

  async function doSend() {
    const text = input.value.trim();
    if (!text || chatState.sending || !chatState.activeId) return;
    chatState.sending = true;
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;
    chatState.messages.push({ role: 'user', content: text });
    renderChatMessages(messagesEl);

    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(chatState.activeId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
  compose.appendChild(input);
  compose.appendChild(sendBtn);
  pane.appendChild(compose);

  root.appendChild(pane);
  getChatPanel()?.classList.add('ch-pane-active');
  input.focus();
}

async function startNewChat() {
  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    chatState.activeId = id;
    chatState.title = data.thread.title;
    chatState.messages = data.thread.messages || [];
    renderChatPanel();
  } catch (e) {
    alert(`Could not load chat: ${e.message}`);
  }
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
  let key;
  try {
    key = localStorage.getItem(MAP_STORE);
  } catch {
    key = null;
  }
  return MAPS[key] ? key : 'system';
}
function saveActiveKey() {
  try {
    localStorage.setItem(MAP_STORE, activeKey);
  } catch {}
}

// ---- init ----
buildTabs();
syncCanvasVisibility();
if (MAP.type === 'documents') {
  loadDocumentsTab();
} else if (MAP.type === 'knowledge') {
  loadKnowledgeTab();
} else if (MAP.type === 'work') {
  loadWorkTab();
} else if (MAP.type === 'clients') {
  loadClientsTab();
} else if (MAP.type === 'chats') {
  loadChatsTab();
} else {
  buildMap();
  requestAnimationFrame(() => { redraw(); fit(); });
  if (MAP.type === 'todo') loadAndBuildTodoNodes();
  if (MAP.type === 'rules') loadAndBuildRuleNodes();
}
syncHealthLifecycle();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopHealth();
  else syncHealthLifecycle();
});
