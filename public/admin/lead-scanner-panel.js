/**
 * Lead Scanner admin settings — geofence radius, trades, daily scan hour.
 */
import { escHtml, adminFetch, mountPanelSkeleton } from './shared.js?v=20260728m';
import { createClientMap } from './client-map.js?v=20260802c';

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
  const timezone = data.timezone || 'America/New_York';
  const runs = data.runs || [];
  const catalog = data.tradesCatalog || [];
  const selected = new Set(Array.isArray(cfg.trades) ? cfg.trades : []);
  const provider = data.dataProvider || 'mock';
  const providerHint =
    provider === 'mock'
      ? `<p class="prof-hint prof-hint--block">Data provider: <code>mock</code> — scan results use demo street names near your map center (not live assessor records). Set <code>REAL_ESTATE_DATA_PROVIDER=propdata</code> and <code>PROPDATA_API_KEY</code> for real property data.</p>`
      : `<p class="prof-hint prof-hint--block">Data provider: <code>${escHtml(provider)}</code>.</p>`;

  const tradeHtml = catalog
    .map((t) => tradeCheckbox(t.slug, t.label, selected.has(t.slug)))
    .join('');

  const resolved = data.resolvedCenter;
  const centerLabel =
    cfg.centerLat != null && cfg.centerLng != null
      ? `Custom center (${Number(cfg.centerLat).toFixed(4)}, ${Number(cfg.centerLng).toFixed(4)})`
      : resolved
        ? `Company office${data.companyAddress ? ` — ${data.companyAddress}` : ''}`
        : 'Not set — save company address or enter coordinates';

  const runsHtml =
    runs.length === 0
      ? '<p class="prof-hint">No scans yet.</p>'
      : runs
          .map((r) => {
            const skipped = Number(r.skipped ?? 0);
            const skippedNote =
              skipped > 0 && r.newLeads === 0
                ? ` <span class="prof-hint">(all ${skipped} already imported)</span>`
                : skipped > 0
                  ? ` <span class="prof-hint">(${skipped} skipped)</span>`
                  : '';
            return (
              `<li><strong>${escHtml(new Date(r.ranAt).toLocaleString())}</strong> — ` +
              `${r.candidatesFound} candidates, ${r.newLeads} new leads${skippedNote}` +
              (r.errors?.length ? ` <span class="prof-hint">(${r.errors.length} errors)</span>` : '') +
              `</li>`
            );
          })
          .join('');

  return (
    `<div class="profile-panel-scroll">` +
    `<div class="prof-card">` +
    `<h1 class="prof-title">Lead Scanner</h1>` +
    `<p class="prof-subtitle">Daily property scan inside your work radius — compliance gaps, hazards, and trade-matched leads become inquiry projects.</p>` +
    providerHint +
    `<div id="lead-scanner-alert" class="prof-alert" hidden></div>` +
    `<form id="lead-scanner-form" class="prof-form">` +
    `<div class="prof-field">` +
    `<label class="prof-check-row">` +
    `<input id="lead-scanner-enabled" name="enabled" type="checkbox"${cfg.enabled ? ' checked' : ''} />` +
    `<span>Enable daily lead scanner</span>` +
    `</label>` +
    `<span class="prof-hint prof-hint--block">Cron hits <code>/api/lead-scanner/poll</code> — scan hour uses your Profile time zone (<code>${escHtml(timezone)}</code>).</span>` +
    `</div>` +
    `<div class="prof-field">` +
    `<label class="prof-check-row">` +
    `<input id="lead-scanner-use-office" name="useCompanyOffice" type="checkbox"${cfg.useCompanyOffice !== false ? ' checked' : ''} />` +
    `<span>Use company office as center when map center not set</span>` +
    `</label>` +
    `</div>` +
    `<div id="lead-scanner-map-host" class="cl-map-section"></div>` +
    `<p class="prof-hint prof-hint--block">Active scan center: ${escHtml(centerLabel)}</p>` +
    `<div class="prof-field-row">` +
    `<div class="prof-field"><label for="lead-scanner-lat">Center latitude</label>` +
    `<input id="lead-scanner-lat" name="centerLat" type="number" step="any" value="${cfg.centerLat ?? ''}" placeholder="${resolved?.lat != null ? resolved.lat : 'Leave blank for company office'}" /></div>` +
    `<div class="prof-field"><label for="lead-scanner-lng">Center longitude</label>` +
    `<input id="lead-scanner-lng" name="centerLng" type="number" step="any" value="${cfg.centerLng ?? ''}" placeholder="${resolved?.lng != null ? resolved.lng : 'Leave blank for company office'}" /></div>` +
    `</div>` +
    `<span class="prof-hint prof-hint--block">Leave latitude/longitude blank to use your company office. Re-scans skip properties already imported — mock mode returns up to 5 demo properties per center.</span>` +
    `<div class="prof-field"><label for="lead-scanner-radius">Travel radius (miles)</label>` +
    `<input id="lead-scanner-radius" name="radiusMiles" type="number" min="1" max="100" step="1" value="${cfg.radiusMiles ?? 15}" />` +
    `<span class="prof-hint">Properties within this radius of center are scanned.</span></div>` +
    `<div class="prof-field"><label for="lead-scanner-hour">Daily scan hour (local)</label>` +
    `<select id="lead-scanner-hour" name="scanHourLocal">` +
    Array.from({ length: 24 }, (_, h) => {
      const sel = Number(cfg.scanHourLocal ?? 6) === h ? ' selected' : '';
      const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      return `<option value="${h}"${sel}>${label}</option>`;
    }).join('') +
    `</select>` +
    `<span class="prof-hint">Local to your Profile time zone (${escHtml(timezone)}).</span></div>` +
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
    trades,
  };
}

function readScanCenter(form, data) {
  const cfg = data.config || {};
  const useOffice = form.querySelector('#lead-scanner-use-office')?.checked !== false;
  const latRaw = form.querySelector('#lead-scanner-lat')?.value ?? '';
  const lngRaw = form.querySelector('#lead-scanner-lng')?.value ?? '';

  if (latRaw !== '' && lngRaw !== '') {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, address: '' };
    }
  }

  if (cfg.centerLat != null && cfg.centerLng != null) {
    return { lat: Number(cfg.centerLat), lng: Number(cfg.centerLng), address: '' };
  }

  if (useOffice) {
    const geo = data.companyGeo || data.resolvedCenter;
    if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
      return {
        lat: geo.lat,
        lng: geo.lng,
        address: (data.companyAddress || '').trim() || 'Company office',
      };
    }
  }

  return null;
}

function syncLeadScannerMap(form, data) {
  const center = readScanCenter(form, data);
  if (center && mapController) {
    mapController.setLocation(center.lat, center.lng, center.address);
  } else if (mapController) {
    mapController.setLocation(null, null, '');
  }
  requestAnimationFrame(() => mapController?.resize());
}

export function bindLeadScannerPanel(root, data) {
  destroyLeadScannerMap();
  const form = root.querySelector('#lead-scanner-form');
  const mapHost = root.querySelector('#lead-scanner-map-host');
  if (mapHost && form) {
    const initial = readScanCenter(form, data);
    mapController = createClientMap(mapHost, {
      token: window.__mapboxAccessToken,
      lat: initial?.lat ?? null,
      lng: initial?.lng ?? null,
      address: initial?.address ?? '',
      showDirections: false,
      emptyHint:
        'Set latitude and longitude below, or enable company office with a geocoded address in Company settings.',
    });

    const syncMap = () => syncLeadScannerMap(form, data);
    form.querySelector('#lead-scanner-lat')?.addEventListener('input', syncMap);
    form.querySelector('#lead-scanner-lng')?.addEventListener('input', syncMap);
    form.querySelector('#lead-scanner-use-office')?.addEventListener('change', syncMap);
    setTimeout(() => mapController?.resize(), 250);
  }

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
      const skipped = Number(r.skippedLeads ?? 0);
      const skippedNote =
        skipped > 0 && (r.newLeads ?? 0) === 0
          ? ` All ${skipped} were already imported on a prior scan.`
          : skipped > 0
            ? ` ${skipped} skipped (already imported).`
            : '';
      showAlert(
        root,
        `Scan complete — ${r.candidatesFound ?? 0} candidates, ${r.newLeads ?? 0} new leads.${skippedNote}`,
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
