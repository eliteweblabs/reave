/**
 * Lead Scanner — slide-in scan session with agent log + property cards.
 */
import { escHtml, adminFetch } from './shared.js?v=20260808k';
import { postLower, postTitle } from './post-alias.js?v=20260805a';
import { createPaneHeader } from './pane-header.js?v=20260808d';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n.toLocaleString()}`;
}

function tradeLabel(slug) {
  return String(slug || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function propertyImages(lat, lng) {
  const token = (window.__mapboxAccessToken || '').trim();
  if (token) {
    return {
      aerial: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${lng},${lat},16,0/800x520@2x?access_token=${encodeURIComponent(token)}`,
      map: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+0a84ff(${lng},${lat})/${lng},${lat},15,0/400x260@2x?access_token=${encodeURIComponent(token)}`,
    };
  }
  const osm = (w, h, zoom) =>
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=mapnik&markers=${lat},${lng},red-pushpin`;
  return { aerial: osm(800, 520, 16), map: osm(400, 260, 15) };
}

function scoreTone(score) {
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  return 'cool';
}

function renderPropertyCard(candidate, imported) {
  const imgs = propertyImages(candidate.lat, candidate.lng);
  const price = formatMoney(candidate.marketValue) || formatMoney(candidate.assessedValue);
  const lastSale = formatMoney(candidate.lastSalePrice);
  const reasons = (candidate.leadReasons || []).slice(0, 3);
  const chips = (candidate.matchedTrades || []).slice(0, 4).map(tradeLabel);
  const meta = [
    candidate.distanceMiles != null ? `${candidate.distanceMiles} mi` : '',
    candidate.yearBuilt ? `built ${candidate.yearBuilt}` : '',
    candidate.sqft ? `${candidate.sqft.toLocaleString()} sqft` : '',
    candidate.bedrooms ? `${candidate.bedrooms} bd` : '',
    candidate.bathrooms ? `${candidate.bathrooms} ba` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    `<article class="ls-prop-card${imported ? ' is-imported' : ''}" data-property-id="${escHtml(candidate.id)}">` +
    `<label class="ls-prop-inner">` +
    `<input type="checkbox" class="ls-prop-pick" value="${escHtml(candidate.id)}"${imported ? ' disabled' : ''} />` +
    `<div class="ls-prop-visual">` +
    `<img class="ls-prop-hero" src="${escHtml(imgs.aerial)}" alt="" loading="lazy" />` +
    `<img class="ls-prop-map" src="${escHtml(imgs.map)}" alt="" loading="lazy" />` +
    `<div class="ls-prop-score ls-prop-score--${scoreTone(candidate.leadScore)}">${candidate.leadScore}</div>` +
    (imported ? `<div class="ls-prop-imported">Imported</div>` : '') +
    `</div>` +
    `<div class="ls-prop-body">` +
    `<div class="ls-prop-topline">` +
    `<h3 class="ls-prop-address">${escHtml(candidate.street || candidate.fullAddress)}</h3>` +
    (price ? `<div class="ls-prop-price">${escHtml(price)}<span class="ls-prop-price-label"> est.</span></div>` : '') +
    `</div>` +
    `<p class="ls-prop-location">${escHtml([candidate.city, candidate.state].filter(Boolean).join(', '))}</p>` +
    (meta ? `<p class="ls-prop-meta">${escHtml(meta)}</p>` : '') +
    `<p class="ls-prop-owner">${escHtml(candidate.ownerName || 'Owner unknown')}</p>` +
    (lastSale ? `<p class="ls-prop-sale">Last sale ${escHtml(lastSale)}</p>` : '') +
    (chips.length
      ? `<div class="ls-prop-chips">${chips.map((c) => `<span class="ls-prop-chip">${escHtml(c)}</span>`).join('')}</div>`
      : '') +
    (reasons.length
      ? `<ul class="ls-prop-reasons">${reasons.map((r) => `<li>${escHtml(r)}</li>`).join('')}</ul>`
      : '') +
    (candidate.floodZone && candidate.floodZone !== 'X'
      ? `<p class="ls-prop-flag">Flood zone ${escHtml(candidate.floodZone)}</p>`
      : '') +
    `</div>` +
    `</label>` +
    `</article>`
  );
}

function sortCandidates(candidates, sortKey) {
  const list = [...candidates];
  switch (sortKey) {
    case 'distance':
      return list.sort((a, b) => a.distanceMiles - b.distanceMiles);
    case 'price':
      return list.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
    case 'year':
      return list.sort((a, b) => (a.yearBuilt ?? 9999) - (b.yearBuilt ?? 9999));
    case 'score':
    default:
      return list.sort((a, b) => b.leadScore - a.leadScore || a.distanceMiles - b.distanceMiles);
  }
}

function ensureRunPanel() {
  let panel = document.getElementById('ls-run-panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'ls-run-panel';
  panel.className = 'ls-run-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML =
    `<div class="ls-run-body">` +
    `<div id="ls-run-demo-banner" class="ls-run-demo-banner" hidden>` +
    `<strong>Demo data</strong> — these are sample properties near your scan center, not live assessor records. ` +
    `Set <code>REAL_ESTATE_DATA_PROVIDER=propdata</code> and <code>PROPDATA_API_KEY</code> on Railway for real parcels, owners, and values.` +
    `</div>` +
    `<div class="ls-run-main">` +
    `<section class="ls-run-log-section">` +
    `<div class="ls-run-log-label">Scan log</div>` +
    `<div class="ls-run-log" id="ls-run-log" role="log" aria-live="polite"></div>` +
    `</section>` +
    `<section class="ls-run-results-section">` +
    `<div class="ls-run-toolbar">` +
    `<div class="ls-run-toolbar-left">` +
    `<span class="ls-run-count" id="ls-run-count">0 properties</span>` +
    `</div>` +
    `<div class="ls-run-toolbar-right">` +
    `<label class="ls-run-sort-label">Sort` +
    `<select id="ls-run-sort" class="ls-run-sort">` +
    `<option value="score">Lead score</option>` +
    `<option value="distance">Distance</option>` +
    `<option value="price">Est. value</option>` +
    `<option value="year">Year built</option>` +
    `</select></label>` +
    `<button type="button" id="ls-run-select-all" class="prof-btn-secondary">Select all</button>` +
    `</div>` +
    `</div>` +
    `<div class="ls-run-cards" id="ls-run-cards"></div>` +
    `</section>` +
    `</div>` +
    `</div>` +
    `<footer class="ls-run-footer">` +
    `<button type="button" id="ls-run-import" class="prof-btn-primary" disabled>Import selected as ${postLower(2)}</button>` +
    `</footer>`;

  const host = document.getElementById('settings-panel') || document.body;
  host.appendChild(panel);
  return panel;
}

export class LeadScannerRunSession {
  constructor() {
    this.panel = ensureRunPanel();
    this.logEl = this.panel.querySelector('#ls-run-log');
    this.cardsEl = this.panel.querySelector('#ls-run-cards');
    this.countEl = this.panel.querySelector('#ls-run-count');
    this.importBtn = this.panel.querySelector('#ls-run-import');
    this.sortEl = this.panel.querySelector('#ls-run-sort');
    this.settingsRoot = null;
    this.savedSubheader = null;
    this.runId = '';
    this.candidates = [];
    this.importedById = {};
    this.sortKey = 'score';
    this._bindChrome();
  }

  attachSettingsRoot(root) {
    this.settingsRoot = root;
  }

  _formScrollEl() {
    return this.settingsRoot?.querySelector('.profile-panel-scroll') ?? null;
  }

  _swapSubheader(title, subtitle) {
    const root = this.settingsRoot;
    if (!root) return;
    const existing = root.querySelector('.settings-subheader');
    if (existing && !this.savedSubheader) {
      this.savedSubheader = existing;
    }
    const { root: header } = createPaneHeader({
      back: { label: 'Back', onClick: () => this.close() },
      title,
      subtitle,
      className: 'settings-subheader',
    });
    if (existing) existing.replaceWith(header);
    else root.prepend(header);
  }

  _restoreSubheader() {
    const root = this.settingsRoot;
    if (!root || !this.savedSubheader) return;
    const current = root.querySelector('.settings-subheader');
    current?.replaceWith(this.savedSubheader);
    this.savedSubheader = null;
  }

  _bindChrome() {
    this.sortEl?.addEventListener('change', () => {
      this.sortKey = this.sortEl.value;
      this._renderCards();
    });
    this.panel.querySelector('#ls-run-select-all')?.addEventListener('click', () => {
      for (const el of this.cardsEl.querySelectorAll('.ls-prop-pick:not(:disabled)')) el.checked = true;
      this._syncImportBtn();
    });
    this.importBtn?.addEventListener('click', () => void this._importSelected());
    this.cardsEl?.addEventListener('change', (ev) => {
      if (ev.target?.classList?.contains('ls-prop-pick')) this._syncImportBtn();
    });
  }

  open(options = {}) {
    this._swapSubheader('Lead scan', options.status || 'Starting…');
    this.panel.classList.add('is-open');
    this.panel.setAttribute('aria-hidden', 'false');
    this.settingsRoot?.classList.add('ls-scan-active');
    this._formScrollEl()?.setAttribute('aria-hidden', 'true');
    this.logEl.textContent = '';
    this.cardsEl.innerHTML = '';
    this.runId = '';
    this.candidates = [];
    this.importedById = {};
    this._syncImportBtn();
    const banner = this.panel.querySelector('#ls-run-demo-banner');
    if (banner) banner.hidden = options.dataProvider !== 'mock';
  }

  close() {
    this.panel.classList.remove('is-open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.settingsRoot?.classList.remove('ls-scan-active');
    this._formScrollEl()?.removeAttribute('aria-hidden');
    this._restoreSubheader();
  }

  setStatus(text) {
    const sub = this.settingsRoot?.querySelector('.settings-subheader .de-doc-slug');
    if (sub) sub.textContent = text;
  }

  async logLine(text, pauseMs = 0) {
    const line = document.createElement('p');
    line.className = 'ls-run-log-line';
    line.textContent = text;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    if (pauseMs > 0) await delay(pauseMs);
  }

  _renderCards() {
    const sorted = sortCandidates(this.candidates, this.sortKey);
    this.cardsEl.innerHTML = sorted
      .map((c) => renderPropertyCard(c, Boolean(this.importedById[c.id])))
      .join('');
    this.countEl.textContent = `${this.candidates.length} propert${this.candidates.length === 1 ? 'y' : 'ies'}`;
    this._syncImportBtn();
  }

  _selectedIds() {
    return [...this.cardsEl.querySelectorAll('.ls-prop-pick:checked')].map((el) => el.value);
  }

  _syncImportBtn() {
    const n = this._selectedIds().length;
    this.importBtn.disabled = n === 0;
    this.importBtn.textContent =
      n === 0 ? `Import selected as ${postLower(2)}` : `Import ${n} as ${postLower(n === 1 ? 1 : 2)}`;
  }

  async _importSelected() {
    const propertyIds = this._selectedIds();
    if (!propertyIds.length || !this.runId) return;
    this.importBtn.disabled = true;
    this.setStatus(`Creating ${postLower(2)}…`);
    await this.logLine(`Importing ${propertyIds.length} selected lead${propertyIds.length === 1 ? '' : 's'}…`);
    try {
      const res = await adminFetch('/api/admin/lead-scanner?action=import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: this.runId, propertyIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || json.result?.errors?.[0] || `HTTP ${res.status}`);
      const r = json.result || {};
      await this.logLine(`Created ${r.imported ?? 0} inquiry ${postLower((r.imported ?? 0) === 1 ? 1 : 2)}.`);
      if ((r.skipped ?? 0) > 0) await this.logLine(`${r.skipped} skipped (already imported).`);
      await this.loadRun(this.runId);
      this.setStatus(`${r.imported ?? 0} imported — review remaining cards or close.`);
    } catch (e) {
      await this.logLine(e.message || 'Import failed.', 0);
      this.setStatus('Import failed');
    } finally {
      this._syncImportBtn();
    }
  }

  async loadRun(runId) {
    const res = await adminFetch(`/api/admin/lead-scanner?runId=${encodeURIComponent(runId)}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const run = data.activeRun;
    if (!run) throw new Error('Scan not found');

    this.runId = run.id;
    this.candidates = run.candidates || [];
    this.importedById = run.importedById || {};
    this._renderCards();
    return run;
  }

  async revealCandidates(candidates, importedById = {}) {
    this.candidates = candidates;
    this.importedById = importedById;
    for (const c of sortCandidates(candidates, 'score')) {
      const hook = (c.leadReasons || [])[0] || 'Trade match';
      await this.logLine(
        `→ ${c.street || c.fullAddress} — score ${c.leadScore}/100 · ${hook}`,
        280,
      );
      const card = document.createElement('div');
      card.innerHTML = renderPropertyCard(c, Boolean(importedById[c.id]));
      const el = card.firstElementChild;
      if (el) {
        el.classList.add('is-entering');
        this.cardsEl.appendChild(el);
        requestAnimationFrame(() => el.classList.remove('is-entering'));
      }
      this.countEl.textContent = `${this.cardsEl.children.length} propert${this.cardsEl.children.length === 1 ? 'y' : 'ies'}`;
      this.cardsEl.scrollTop = this.cardsEl.scrollHeight;
    }
    this._syncImportBtn();
  }

  async startNewScan({ saveSettings, centerLabel, trades, radiusMiles, dataProvider }) {
    this.open({ status: 'Scanning…', dataProvider });
    void this.logLine('Starting scan…');

    if (saveSettings) {
      void this.logLine('Applying scan settings…');
      await saveSettings();
    }

    void this.logLine(`Locking center on ${centerLabel}…`);
    void this.logLine(`Drawing ${radiusMiles}-mile service radius…`);
    const tradeText =
      trades.length > 0
        ? trades.slice(0, 4).join(', ') + (trades.length > 4 ? '…' : '')
        : 'all configured trades';
    void this.logLine(`Filtering for ${tradeText}…`);
    void this.logLine(
      dataProvider === 'mock'
        ? 'Querying demo property records (not live assessor data)…'
        : `Querying ${dataProvider} property records…`,
    );

    const res = await adminFetch('/api/admin/lead-scanner?action=scan', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.result?.skipped || json.error || `HTTP ${res.status}`);

    const r = json.result || {};
    this.runId = r.runId || '';
    const candidates = r.candidates || [];

    await this.logLine('Running compliance & liability scoring…', 120);

    if (!candidates.length) {
      await this.logLine('No properties matched your radius and trade filters.');
      this.setStatus('Scan complete — no matches');
      return r;
    }

    await this.logLine(
      `Found ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}. Pulling imagery and assessor data…`,
      80,
    );
    await this.revealCandidates(candidates, {});
    await this.logLine(`Scan complete — cherry-pick the leads you want, then import as ${postLower(2)}.`, 0);
    this.setStatus(`${candidates.length} propert${candidates.length === 1 ? 'y' : 'ies'} — select leads to import`);
    return r;
  }

  async openExistingRun(runId, dataProvider = 'mock') {
    this.open({ status: 'Loading scan…', dataProvider });
    await this.logLine('Loading saved scan results…', 200);
    const run = await this.loadRun(runId);
    const n = run.candidates?.length ?? 0;
    await this.logLine(
      `Loaded ${n} propert${n === 1 ? 'y' : 'ies'} from ${new Date(run.ranAt).toLocaleString()}.`,
      120,
    );
    if (n > 0) {
      await this.logLine(`Review the cards below and import the ones you want as inquiry ${postLower(2)}.`, 0);
    } else {
      await this.logLine('This scan did not return any matching properties.', 0);
    }
    this.setStatus(`${n} propert${n === 1 ? 'y' : 'ies'} — select leads to import`);
    return run;
  }
}

let _session = null;

export function getLeadScannerRunSession() {
  if (!_session) _session = new LeadScannerRunSession();
  return _session;
}
