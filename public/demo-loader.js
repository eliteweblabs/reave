/**
 * Public demo loader — module toggles + industry select → launch live demo.
 */
(function () {
  const STATUS_LABELS = {
    deployed: 'Live',
    pending: 'Pending',
    development: 'Dev',
    request: 'Requested',
    rejected: 'Off',
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

  function productionModules() {
    return modules.filter((m) => m.inProduction && m.moduleId);
  }

  function syncDefaults(data) {
    modules = data.modules || [];
    industries = data.industries || [];
    demoSiteUrl = data.demoSiteUrl || null;
    if (data.suite?.moduleIds?.length) {
      selectedIds = new Set(data.suite.moduleIds.map((id) => String(id).padStart(3, '0')));
      industry = data.suite.industry || industry;
    } else {
      selectedIds = new Set(data.defaultModuleIds || productionModules().map((m) => m.moduleId));
      industry = industries[0]?.slug || 'general';
    }
  }

  function selectedProductionCount() {
    const prod = new Set(productionModules().map((m) => m.moduleId));
    return [...selectedIds].filter((id) => prod.has(id)).length;
  }

  function renderToggle(checked, moduleId) {
    return (
      `<button type="button" class="dl-toggle" role="switch" aria-checked="${checked ? 'true' : 'false'}" ` +
      `data-module-id="${esc(moduleId)}" aria-label="Include module"></button>`
    );
  }

  function renderModuleRow(m) {
    const checked = selectedIds.has(m.moduleId);
    const status = STATUS_LABELS[m.status] || m.status;
    return (
      `<div class="dl-row${m.inProduction ? '' : ' dl-row--readonly'}">` +
      `<div class="dl-row-main">` +
      `<code class="dl-id">${esc(m.moduleId || '—')}</code>` +
      `<div class="dl-text">` +
      `<span class="dl-label">${esc(m.label)}</span>` +
      `<span class="dl-feature">${esc(m.feature)}</span>` +
      `</div>` +
      `</div>` +
      `<div class="dl-row-end">` +
      `<span class="dl-status">${esc(status)}</span>` +
      (m.inProduction ? renderToggle(checked, m.moduleId) : `<span class="dl-dash" aria-hidden="true">—</span>`) +
      `</div>` +
      `</div>`
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

  function render() {
    const prodCount = productionModules().length;
    const selectedCount = selectedProductionCount();
    const canLaunch = Boolean(demoSiteUrl && selectedCount > 0);

    root.innerHTML =
      `<div class="dl-panel">` +
      `<div class="dl-toolbar">` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Industry</span>` +
      `<select id="dl-industry" class="dl-select">${renderIndustryOptions()}</select>` +
      `</label>` +
      `<div class="dl-toolbar-actions">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dl-select-all"${selectedCount === prodCount ? ' disabled' : ''}>Select all</button>` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dl-clear"${selectedCount ? '' : ' disabled'}>Clear</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dl-launch"${canLaunch ? '' : ' disabled'}>` +
      (demoSiteUrl ? 'Launch live demo' : 'Demo sandbox unavailable') +
      `</button>` +
      `</div>` +
      `<p class="dl-meta">${selectedCount} of ${prodCount} production modules selected · ${modules.length} total</p>` +
      `</div>` +
      `<div class="dl-list-head"><span>Module</span><span>Status</span><span>Include</span></div>` +
      `<div class="dl-list">${modules.map(renderModuleRow).join('')}</div>` +
      (!demoSiteUrl ?
        `<p class="dl-footnote">Live sandbox URL is not configured on this install. Book a call from the <a href="/demo">demo page</a> for hands-on access.</p>`
      : '') +
      `</div>`;
  }

  function bind() {
    root.querySelector('#dl-industry')?.addEventListener('change', (e) => {
      industry = e.target.value || 'general';
    });

    root.querySelector('#dl-select-all')?.addEventListener('click', () => {
      selectedIds = new Set(productionModules().map((m) => m.moduleId));
      render();
      bind();
    });

    root.querySelector('#dl-clear')?.addEventListener('click', () => {
      selectedIds = new Set();
      render();
      bind();
    });

    root.querySelectorAll('.dl-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-module-id');
        if (!id) return;
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        render();
        bind();
      });
    });

    root.querySelector('#dl-launch')?.addEventListener('click', () => {
      if (!demoSiteUrl || !selectedProductionCount()) return;
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
