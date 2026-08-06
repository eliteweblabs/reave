/**
 * Public demo loader — 6-column tile grid, toggles only on deployed modules.
 */
(function () {
  const STATUS = {
    deployed: { label: 'Live', badge: 'dl-badge--deployed' },
    pending: { label: 'Pending', badge: 'dl-badge--pending' },
    development: { label: 'Dev', badge: 'dl-badge--development' },
    request: { label: 'Requested', badge: 'dl-badge--request' },
    rejected: { label: 'Off', badge: 'dl-badge--rejected' },
  };

  let modules = [];
  let industries = [];
  let selectedIds = new Set();
  let industry = 'general';
  let demoSiteUrl = null;

  const root = document.getElementById('demo-loader-app');
  if (!root) return;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortLabel(label) {
    return String(label).replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  function toggleableModules() {
    return modules.filter((m) => m.toggleable && m.moduleId);
  }

  function syncDefaults(data) {
    modules = data.modules || [];
    industries = data.industries || [];
    demoSiteUrl = data.demoSiteUrl || null;
    const allowed = new Set(toggleableModules().map((m) => m.moduleId));
    if (data.suite?.moduleIds?.length) {
      selectedIds = new Set(
        data.suite.moduleIds
          .map((id) => String(id).padStart(3, '0'))
          .filter((id) => allowed.has(id)),
      );
      industry = data.suite.industry || industry;
    } else {
      selectedIds = new Set(data.defaultModuleIds || [...allowed]);
      industry = industries[0]?.slug || 'general';
    }
  }

  function selectedToggleableCount() {
    const allowed = new Set(toggleableModules().map((m) => m.moduleId));
    return [...selectedIds].filter((id) => allowed.has(id)).length;
  }

  function statusMeta(m) {
    if (!m.inProduction) {
      return { label: 'Not in prod', badge: 'dl-badge--noprod' };
    }
    return STATUS[m.status] || { label: m.status, badge: 'dl-badge--pending' };
  }

  function renderSwitch(checked, moduleId) {
    return (
      `<button type="button" class="dl-switch" role="switch" ` +
      `aria-checked="${checked ? 'true' : 'false'}" data-module-id="${esc(moduleId)}" ` +
      `aria-label="Include in demo"></button>`
    );
  }

  function renderTile(m) {
    const checked = selectedIds.has(m.moduleId);
    const meta = statusMeta(m);
    const canToggle = Boolean(m.toggleable && m.moduleId);

    return (
      `<article class="dl-tile${checked && canToggle ? ' dl-tile--selected' : ''}${canToggle ? '' : ' dl-tile--readonly'}" ` +
      `data-feature="${esc(m.feature)}"${canToggle ? '' : ' aria-disabled="true"'}>` +
      `<div class="dl-tile-top">` +
      `<span class="dl-tile-id">${esc(m.moduleId || '—')}</span>` +
      `<span class="dl-badge ${meta.badge}">${esc(meta.label)}</span>` +
      `</div>` +
      `<h3 class="dl-tile-label">${esc(shortLabel(m.label))}</h3>` +
      `<div class="dl-tile-foot">` +
      (canToggle ?
        renderSwitch(checked, m.moduleId)
      : `<span class="dl-tile-hint">${m.inProduction ? 'Not deployed yet' : 'Preview only'}</span>`) +
      `</div>` +
      `</article>`
    );
  }

  function renderIndustryOptions() {
    if (!industries.length) {
      return `<option value="general">General</option>`;
    }
    return industries
      .map((item) => {
        const selected = item.slug === industry ? ' selected' : '';
        return `<option value="${esc(item.slug)}"${selected}>${esc(item.label)}</option>`;
      })
      .join('');
  }

  function renderLegend() {
    return (
      `<div class="dl-legend">` +
      `<span class="dl-legend-item"><span class="dl-badge dl-badge--deployed">Live</span> toggle to include</span>` +
      `<span class="dl-legend-item"><span class="dl-badge dl-badge--pending">Pending</span> shown, no toggle</span>` +
      `<span class="dl-legend-item"><span class="dl-badge dl-badge--noprod">Not in prod</span> preview only</span>` +
      `</div>`
    );
  }

  function render() {
    const toggleCount = toggleableModules().length;
    const selectedCount = selectedToggleableCount();
    const canLaunch = Boolean(demoSiteUrl && selectedCount > 0);

    root.innerHTML =
      `<div class="dl-panel">` +
      `<div class="dl-toolbar">` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Industry</span>` +
      `<select id="dl-industry" class="dl-select">${renderIndustryOptions()}</select>` +
      `</label>` +
      `<div class="dl-toolbar-actions">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dl-select-all"${selectedCount === toggleCount ? ' disabled' : ''}>Select all deployed</button>` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dl-clear"${selectedCount ? '' : ' disabled'}>Clear</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dl-launch"${canLaunch ? '' : ' disabled'}>` +
      (demoSiteUrl ? 'Launch live demo' : 'Demo sandbox unavailable') +
      `</button>` +
      `</div>` +
      `<p class="dl-meta">${selectedCount} of ${toggleCount} deployed modules selected · ${modules.length} modules shown</p>` +
      `</div>` +
      renderLegend() +
      `<div class="dl-grid">${modules.map(renderTile).join('')}</div>` +
      (!demoSiteUrl ?
        `<p class="dl-footnote">Live sandbox URL is not configured on this install. Book a call from the <a href="/demo">demo page</a> for hands-on access.</p>`
      : '') +
      `</div>`;
  }

  function toggleModule(id) {
    if (!toggleableModules().some((m) => m.moduleId === id)) return;
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    render();
    bind();
  }

  function bind() {
    root.querySelector('#dl-industry')?.addEventListener('change', (e) => {
      industry = e.target.value || 'general';
    });

    root.querySelector('#dl-select-all')?.addEventListener('click', () => {
      selectedIds = new Set(toggleableModules().map((m) => m.moduleId));
      render();
      bind();
    });

    root.querySelector('#dl-clear')?.addEventListener('click', () => {
      selectedIds = new Set();
      render();
      bind();
    });

    root.querySelectorAll('.dl-switch').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-module-id');
        if (id) toggleModule(id);
      });
    });

    root.querySelectorAll('.dl-tile:not(.dl-tile--readonly)').forEach((tile) => {
      tile.addEventListener('click', () => {
        const id = tile.querySelector('.dl-switch')?.getAttribute('data-module-id');
        if (id) toggleModule(id);
      });
    });

    root.querySelector('#dl-launch')?.addEventListener('click', () => {
      if (!demoSiteUrl || !selectedToggleableCount()) return;
      const ids = [...selectedIds].sort();
      const url = new URL('/', demoSiteUrl);
      url.searchParams.set('demo', 'tier-1');
      url.searchParams.set('modules', `[${ids.join(',')}]`);
      url.searchParams.set('industry', industry || 'general');
      window.location.assign(url.toString());
    });
  }

  async function init() {
    root.innerHTML = '<p class="dl-loading">Loading modules…</p>';
    try {
      const res = await fetch('/api/demo/loader', { cache: 'no-store' });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(res.ok ? 'Invalid response from server' : `Server error (${res.status})`);
      }
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      syncDefaults(data);
      render();
      bind();
    } catch (e) {
      root.innerHTML = `<p class="dl-error">Could not load demo loader: ${esc(e.message)}</p>`;
    }
  }

  void init();
})();
