/**
 * Lead Scanner admin — geofence settings + slide-in scan session.
 */
import { escHtml, adminFetch, mountPanelSkeleton } from './shared.js?v=20260728m';
import { postLower, postTitle } from './post-alias.js?v=20260805a';
import { createClientMap } from './client-map.js?v=20260804b';
import { getLeadScannerRunSession } from './lead-scanner-run.js?v=20260802f';

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

function tradeLabel(slug) {
  return String(slug || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
      ? `<p class="prof-hint prof-hint--block">Data provider: <code>mock</code> — demo street names near your map center. Set <code>REAL_ESTATE_DATA_PROVIDER=attom</code> and <code>ATTOM_API_KEY</code> for live assessor data.</p>`
      : provider === 'attom'
        ? `<p class="prof-hint prof-hint--block">Data provider: <code>attom</code> — live parcel records from your ATTOM trial.</p>`
      : `<p class="prof-hint prof-hint--block">Data provider: <code>${escHtml(provider)}</code>.</p>`;

  const vArea = data.violationServiceArea;
  const violationHint = vArea
    ? `<p class="prof-hint prof-hint--block">Municipal violations: <strong>${vArea.feedCount}</strong> of ` +
      `<strong>${vArea.municipalityCount}</strong> service-area municipalities (top 50% by population within ` +
      `${vArea.radiusMiles} mi of <code>${escHtml(data.companyAddress || 'company office')}</code>) have public feeds wired.</p>`
    : `<p class="prof-hint prof-hint--block">Set your company address in admin settings to auto-resolve the municipal violation service area.</p>`;

  const tradeHtml = catalog
    .map((t) => tradeCheckbox(t.slug, t.label, selected.has(t.slug)))
    .join('');

  const resolved = data.resolvedCenter;
  const centerLabel =
    cfg.centerLat != null && cfg.centerLng != null
      ? `custom coordinates (${Number(cfg.centerLat).toFixed(4)}, ${Number(cfg.centerLng).toFixed(4)})`
      : resolved
        ? data.companyAddress || 'company office'
        : 'your configured center';

  const runsHtml =
    runs.length === 0
      ? '<p class="prof-hint">No scans yet.</p>'
      : runs
          .map((r) => {
            const imported = Number(r.importedCount ?? 0);
            const importedNote =
              imported > 0 ? ` <span class="prof-hint">(${imported} imported)</span>` : '';
            return (
              `<li>` +
              `<button type="button" class="ls-run-link" data-run-id="${escHtml(r.id)}">` +
              `<strong>${escHtml(new Date(r.ranAt).toLocaleString())}</strong> — ` +
              `${r.candidatesFound} propert${r.candidatesFound === 1 ? 'y' : 'ies'}${importedNote}` +
              `</button></li>`
            );
          })
          .join('');

  return (
    `<div class="profile-panel-scroll">` +
    `<div class="prof-card">` +
    `<h1 class="prof-title">Lead Scanner</h1>` +
    `<p class="prof-subtitle">Scan your service radius, watch the agent log properties as they're found, then cherry-pick leads to import as ${postLower(2)}.</p>` +
    providerHint +
    violationHint +
    `<div id="lead-scanner-alert" class="prof-alert" hidden></div>` +
    `<form id="lead-scanner-form" class="prof-form">` +
    `<div class="prof-field">` +
    `<label class="prof-check-row">` +
    `<input id="lead-scanner-enabled" name="enabled" type="checkbox"${cfg.enabled ? ' checked' : ''} />` +
    `<span>Enable daily lead scanner</span>` +
    `</label>` +
    `<span class="prof-hint prof-hint--block">Scheduled scans save results for review — nothing becomes a ${postLower(1)} until you import it.</span>` +
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
    `<div class="prof-field"><label for="lead-scanner-radius">Travel radius (miles)</label>` +
    `<input id="lead-scanner-radius" name="radiusMiles" type="number" min="1" max="100" step="1" value="${cfg.radiusMiles ?? 15}" /></div>` +
    `<div class="prof-field"><label for="lead-scanner-hour">Daily scan hour (local)</label>` +
    `<select id="lead-scanner-hour" name="scanHourLocal">` +
    Array.from({ length: 24 }, (_, h) => {
      const sel = Number(cfg.scanHourLocal ?? 6) === h ? ' selected' : '';
      const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      return `<option value="${h}"${sel}>${label}</option>`;
    }).join('') +
    `</select>` +
    `<span class="prof-hint">Local to ${escHtml(timezone)}.</span></div>` +
    `<div class="prof-field"><label>Target trades</label>` +
    `<div class="prof-check-grid">${tradeHtml}</div></div>` +
    `<div class="prof-form-actions">` +
    `<button type="submit" class="prof-btn-secondary">Save settings</button>` +
    `<button type="button" id="lead-scanner-run-now" class="prof-btn-primary">Scan now</button>` +
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

function centerLabelForScan(form, data) {
  const cfg = data.config || {};
  const latRaw = form.querySelector('#lead-scanner-lat')?.value ?? '';
  const lngRaw = form.querySelector('#lead-scanner-lng')?.value ?? '';
  if (latRaw && lngRaw) return `${latRaw}, ${lngRaw}`;
  if (cfg.centerLat != null && cfg.centerLng != null) {
    return `${cfg.centerLat}, ${cfg.centerLng}`;
  }
  return data.companyAddress || 'company office';
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
  const session = getLeadScannerRunSession();
  session.attachSettingsRoot(root);

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

  root.querySelectorAll('.ls-run-link').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const runId = btn.dataset.runId;
      if (!runId) return;
      try {
        await session.openExistingRun(runId, data.dataProvider || 'mock');
      } catch (e) {
        session.close();
        showAlert(root, e.message || 'Could not load scan.', 'error');
      }
    });
  });

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
    const payload = collectPayload(form);
    const provider = data.dataProvider || 'mock';
    try {
      await session.startNewScan({
        saveSettings: () =>
          adminFetch('/api/admin/lead-scanner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).then(async (res) => {
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
          }),
        centerLabel: centerLabelForScan(form, data),
        trades: payload.trades.map(tradeLabel),
        radiusMiles: payload.radiusMiles,
        dataProvider: provider,
      });
    } catch (e) {
      session.close();
      showAlert(root, e.message || 'Scan failed.', 'error');
    } finally {
      runBtn.disabled = false;
    }
  });

  if (data.activeRun?.candidates?.length) {
    root.querySelector('#lead-scanner-run-now')?.insertAdjacentHTML(
      'afterend',
      `<p class="prof-hint prof-hint--block"><button type="button" class="ls-open-latest" style="background:none;border:none;padding:0;color:var(--accent);cursor:pointer;font:inherit">Open latest scan (${data.activeRun.candidates.length} properties)</button></p>`,
    );
    root.querySelector('.ls-open-latest')?.addEventListener('click', () => {
      void session.openExistingRun(data.activeRun.id, data.dataProvider || 'mock');
    });
  }
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
