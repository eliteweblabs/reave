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
    el.className = `node${n.ghost ? ' ghost' : ''}`;
    el.style.setProperty('--h', n.hue);
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.innerHTML = `
      <div class="row">
        ${chipHtml(n)}
        <span class="ttl">${n.title}</span>
      </div>
      ${n.sub ? `<div class="sub">${n.sub}</div>` : ''}
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
  if (MAP.type !== 'documents') {
    buildMap();
    requestAnimationFrame(() => { redraw(); fit(); });
    if (MAP.type === 'todo') loadAndBuildTodoNodes();
  } else {
    loadDocumentsTab();
  }
  syncHealthLifecycle();
}

function syncCanvasVisibility() {
  const isDoc = MAP.type === 'documents';
  wrap.style.display = isDoc ? 'none' : '';
  document.getElementById('tools').style.display = isDoc ? 'none' : '';
  document.getElementById('legend').style.display = isDoc ? 'none' : '';
  document.getElementById('doc-editor').style.display = isDoc ? 'flex' : 'none';
}

// ---- health polling ----
function syncHealthLifecycle() {
  if (activeKey === 'system') startHealth();
  else stopHealth();
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
  if (activeKey !== 'system') return;
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
  if (activeKey !== 'system') {
    el.textContent = '';
    return;
  }
  el.textContent = lastChecked ? `checked ${lastChecked.toLocaleTimeString()}` : '';
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
  templates: [],   // [{ slug, title }]
  activeSlug: null,
  dirty: false,
};

function getDocEditor() { return document.getElementById('doc-editor'); }

async function loadDocumentsTab() {
  const root = getDocEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading templates…</div>';
  let templates;
  try {
    const res = await fetch('/api/documents', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    templates = await res.json();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load templates: ${e.message}</div>`;
    return;
  }
  docState.templates = templates;
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
      pane.appendChild(header);

      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.id = `de-edit-${slug}`;
      ta.spellcheck = false;
      ta.value = html;
      ta.addEventListener('input', () => { docState.dirty = true; updateSaveBtn(); });
      pane.appendChild(ta);

      const actions = document.createElement('div');
      actions.className = 'de-actions';

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

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
if (MAP.type !== 'documents') {
  buildMap();
  requestAnimationFrame(() => { redraw(); fit(); });
  if (MAP.type === 'todo') loadAndBuildTodoNodes();
} else {
  loadDocumentsTab();
}
syncHealthLifecycle();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopHealth();
  else syncHealthLifecycle();
});
