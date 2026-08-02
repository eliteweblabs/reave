/**
 * Lead Scanner admin settings — geofence radius, trades, daily scan hour.
 */
import { escHtml, adminFetch, mountPanelSkeleton } from './shared.js?v=20260728m';
import { createClientMap } from './client-map.js?v=20260728m';

let mapController = null;

function destroyLeadScannerMap() {
  mapController?.destroy?.();
  mapController = null;
}

function tradeCheckbox(id, label, checked) {
  return (
    `<label class="prof-check-row">` +
    `<input type="checkbox" name="trades" value="${escHtml(id)}"${checked ? ' checked' : ''} />` +
    `<span>${escHtml(label)}</span>` +
    `</label>`
  );
}

export function renderLeadScannerPanel(data) {
  const cfg = data.config || {};
  const runs = data.runs || [];
  const catalog = data.tradesCatalog || [];
  const selected = new Set(Array.isArray(cfg.trades) ? cfg.trades : []);

  const tradeHtml = catalog
    .map((t) => tradeCheckbox(t.slug, t.label, selected.has(t.slug)))
    .join('');

  const runsHtml =
    runs.length === 0
      ? '<p class="prof-hint">No scans yet.</p>'
      : runs
          .map(
            (r) =>
              `<li><strong>${escHtml(new Date(r.ranAt).toLocaleString())}</strong> — ` +
              `${r.candidatesFound} candidates, ${r.newLeads} new leads` +
              (r.errors?.length ? ` <span class="prof-hint">(${r.errors.length} errors)</span>` : '') +
              `</li>`,
          )
          .join('');

  return (
    `<div class="profile-panel-scroll">` +
    `<div class="prof-card">` +
    `<h1 class="prof-title">Lead Scanner</h1>` +
    `<p class="prof-subtitle">Daily property scan inside your work radius — compliance gaps, hazards, and trade-matched leads become inquiry projects.</p>` +
    `<div id="lead-scanner-alert" class="prof-alert" hidden></div>` +
    `<form id="lead-scanner-form" class="prof-form">` +
    `<div class="prof-field">` +
    `<label class="prof-check-row">` +
    `<input id="lead-scanner-enabled" name="enabled" type="checkbox"${cfg.enabled ? ' checked' : ''} />` +
    `<span>Enable daily lead scanner</span>` +
    `</label>` +
    `<span class="prof-hint prof-hint--block">Cron hits <code>/api/lead-scanner/poll</code> — default scan hour below (local timezone).</span>` +
    `</div>` +
    `<div class="prof-field">` +
    `<label class="prof-check-row">` +
    `<input id="lead-scanner-use-office" name="useCompanyOffice" type="checkbox"${cfg.useCompanyOffice !== false ? ' checked' : ''} />` +
    `<span>Use company office as center when map center not set</span>` +
    `</label>` +
    `</div>` +
    `<div id="lead-scanner-map-host" class="cl-map-section"></div>` +
    `<div class="prof-field-row">` +
    `<div class="prof-field"><label for="lead-scanner-lat">Center latitude</label>` +
    `<input id="lead-scanner-lat" name="centerLat" type="number" step="any" value="${cfg.centerLat ?? ''}" placeholder="42.3601" /></div>` +
    `<div class="prof-field"><label for="lead-scanner-lng">Center longitude</label>` +
    `<input id="lead-scanner-lng" name="centerLng" type="number" step="any" value="${cfg.centerLng ?? ''}" placeholder="-71.0589" /></div>` +
    `</div>` +
    `<div class="prof-field"><label for="lead-scanner-radius">Travel radius (miles)</label>` +
    `<input id="lead-scanner-radius" name="radiusMiles" type="number" min="1" max="100" step="1" value="${cfg.radiusMiles ?? 15}" />` +
    `<span class="prof-hint">Properties within this radius of center are scanned.</span></div>` +
    `<div class="prof-field-row">` +
    `<div class="prof-field"><label for="lead-scanner-hour">Daily scan hour (local)</label>` +
    `<select id="lead-scanner-hour" name="scanHourLocal">` +
    Array.from({ length: 24 }, (_, h) => {
      const sel = Number(cfg.scanHourLocal ?? 6) === h ? ' selected' : '';
      const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      return `<option value="${h}"${sel}>${label}</option>`;
    }).join('') +
    `</select></div>` +
    `<div class="prof-field"><label for="lead-scanner-tz">Timezone</label>` +
    `<input id="lead-scanner-tz" name="timezone" type="text" value="${escHtml(cfg.timezone || 'America/New_York')}" /></div>` +
    `</div>` +
    `<div class="prof-field"><label>Target trades</label>` +
    `<div class="prof-check-grid">${tradeHtml}</div></div>` +
    `<div class="prof-form-actions">` +
    `<button type="submit" class="prof-btn-primary">Save settings</button>` +
    `<button type="button" id="lead-scanner-run-now" class="prof-btn-secondary">Scan now</button>` +
    `</div>` +
    `</form>` +
    `<h2 class="prof-section-title">Recent scans</h2>` +
    `<ul class="prof-run-list">${runsHtml}</ul>` +
    (cfg.lastRunAt
      ? `<p class="prof-hint">Last run: ${escHtml(new Date(cfg.lastRunAt).toLocaleString())}</p>`
      : '') +
    `</div></div>`
  );
}

function showAlert(root, message, kind = 'error') {
  const el = root.querySelector('#lead-scanner-alert');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.className = `prof-alert prof-alert--${kind}`;
}

function collectPayload(form) {
  const trades = [...form.querySelectorAll('input[name="trades"]:checked')].map((el) => el.value);
  return {
    enabled: form.querySelector('#lead-scanner-enabled')?.checked === true,
    useCompanyOffice: form.querySelector('#lead-scanner-use-office')?.checked === true,
    centerLat: form.querySelector('#lead-scanner-lat')?.value
      ? Number(form.querySelector('#lead-scanner-lat').value)
      : null,
    centerLng: form.querySelector('#lead-scanner-lng')?.value
      ? Number(form.querySelector('#lead-scanner-lng').value)
      : null,
    radiusMiles: Number(form.querySelector('#lead-scanner-radius')?.value || 15),
    scanHourLocal: Number(form.querySelector('#lead-scanner-hour')?.value || 6),
    timezone: form.querySelector('#lead-scanner-tz')?.value?.trim() || 'America/New_York',
    trades,
  };
}

export function bindLeadScannerPanel(root, data) {
  destroyLeadScannerMap();
  const cfg = data.config || {};
  const mapHost = root.querySelector('#lead-scanner-map-host');
  if (mapHost) {
    mapController = createClientMap(mapHost, {
      token: window.__mapboxAccessToken,
      lat: cfg.centerLat,
      lng: cfg.centerLng,
      address: 'Scan center',
      showDirections: false,
    });
  }

  const form = root.querySelector('#lead-scanner-form');
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const res = await adminFetch('/api/admin/lead-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectPayload(form)),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showAlert(root, 'Settings saved.', 'success');
    } catch (e) {
      showAlert(root, e.message || 'Save failed.', 'error');
    }
  });

  const runBtn = root.querySelector('#lead-scanner-run-now');
  runBtn?.addEventListener('click', async () => {
    runBtn.disabled = true;
    try {
      await adminFetch('/api/admin/lead-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectPayload(form)),
      });
      const res = await adminFetch('/api/admin/lead-scanner?action=scan', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.result?.skipped || json.error || `HTTP ${res.status}`);
      const r = json.result || {};
      showAlert(
        root,
        `Scan complete — ${r.candidatesFound ?? 0} candidates, ${r.newLeads ?? 0} new leads.`,
        'success',
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      showAlert(root, e.message || 'Scan failed.', 'error');
    } finally {
      runBtn.disabled = false;
    }
  });
}

export async function loadLeadScannerTab(deps) {
  const { settingsPanelRoot, prependSettingsBackHeader, escHtml: esc } = deps;
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading lead scanner…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const res = await adminFetch('/api/admin/lead-scanner', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    root.innerHTML = renderLeadScannerPanel(data);
    prependSettingsBackHeader(root);
    bindLeadScannerPanel(root, data);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll"><div class="prof-card"><h1 class="prof-title">Lead Scanner</h1>` +
      `<p class="dash-empty">Could not load: ${esc(e.message)}</p></div></div>`;
    prependSettingsBackHeader(root);
  }
}
