/**
 * Public demo loader — 6-column tile grid with grouped sections.
 *
 * Modes (on #demo-loader-app):
 *   data-toggles="true"  (default) — pick modules + request a custom demo
 *   data-toggles="false" — browse-only catalog; no switches, no launch form
 */
(function () {
  const { MODULE_STATUS: STATUS, escHtml: esc, renderCallout, renderStatusLegend } =
    window.ModuleLoaderShared;

  /** Browse catalog only — never render switches or the demo request form. */
  let sections = [];
  let included = [];
  let industries = [];
  let industryDefaults = {};
  let baselineModuleIds = [];
  let selectedIds = new Set();
  let industry = 'general';
  let visitorName = '';
  let visitorEmail = '';
  let launchError = '';
  let launching = false;
  let submitted = false;
  let canEditCatalog = false;

  const root = document.getElementById('demo-loader-app');
  if (!root) return;

  /** Browse catalog only — never render switches or the demo request form. */
  const togglesEnabled = root.dataset.toggles !== 'false';

  let modules = [];

  function toggleableModules() {
    return modules.filter((m) => m.toggleable && m.moduleId);
  }

  function syncDefaults(data) {
    modules = data.modules || [];
    included = Array.isArray(data.included) ? data.included : [];
    sections =
      Array.isArray(data.sections) && data.sections.length ?
        data.sections
      : [{ id: 'optional', title: 'Optional Modules', modules }];
    industries = data.industries || [];
    industryDefaults =
      data.industryDefaults && typeof data.industryDefaults === 'object' ? data.industryDefaults : {};
    baselineModuleIds = data.baselineModuleIds || [];
    const allowed = new Set(toggleableModules().map((m) => m.moduleId));
    const slugs = new Set(industries.map((item) => item.slug));
    if (data.suite?.moduleIds?.length) {
      selectedIds = new Set(
        data.suite.moduleIds
          .map((id) => String(id).padStart(3, '0'))
          .filter((id) => allowed.has(id)),
      );
      industry = slugs.has(data.suite.industry) ? data.suite.industry : pickDefaultIndustry();
      if (data.suite.visitorName) visitorName = data.suite.visitorName;
      if (data.suite.visitorEmail) visitorEmail = data.suite.visitorEmail;
    } else {
      industry = pickDefaultIndustry();
      selectedIds = new Set();
      for (const id of industryModuleIds(industry)) applyModuleToggle(id, true);
    }
    canEditCatalog = data.canEditCatalog === true;
  }

  function moduleEditHref(feature) {
    return `/admin/?tab=modules&module=${encodeURIComponent(feature)}`;
  }

  function renderEditLink(feature) {
    if (!canEditCatalog || !feature) return '';
    return `<a class="dl-tile-edit" href="${esc(moduleEditHref(feature))}">Edit</a>`;
  }

  function launchModuleIds() {
    const merged = new Set(baselineModuleIds);
    for (const id of selectedIds) merged.add(id);
    return [...merged].sort();
  }

  function selectedToggleableCount() {
    const allowed = new Set(toggleableModules().map((m) => m.moduleId));
    return [...selectedIds].filter((id) => allowed.has(id)).length;
  }

  function canLaunch() {
    return Boolean(
      visitorName.trim().length >= 2 &&
        visitorEmail.trim().includes('@') &&
        !launching &&
        !submitted,
    );
  }

  function statusMeta(m) {
    return STATUS[m.status] || STATUS.development;
  }

  function renderStatusDot(m) {
    const meta = statusMeta(m);
    return (
      `<span class="dl-status-dot dl-status-dot--${meta.tone}" ` +
      `title="${esc(meta.label)}" role="img" aria-label="${esc(meta.label)}"></span>`
    );
  }

  function renderSwitch(checked, moduleId) {
    return (
      `<button type="button" class="dl-switch" role="switch" ` +
      `aria-checked="${checked ? 'true' : 'false'}" data-module-id="${esc(moduleId)}" ` +
      `aria-label="Include in demo"></button>`
    );
  }

  function renderIncludedTile(card) {
    const edit = renderEditLink(card.id);
    return (
      `<article class="dl-tile dl-tile--included" data-included="${esc(card.id)}"${edit ? '' : ' aria-disabled="true"'}>` +
      `<div class="dl-tile-body">` +
      `<span class="dl-badge dl-badge--included">Included</span>` +
      `<h3 class="dl-tile-label">${esc(card.label)}</h3>` +
      (card.blurb ? `<p class="dl-tile-blurb">${esc(card.blurb)}</p>` : '') +
      `</div>` +
      (edit ? `<div class="dl-tile-foot">${edit}</div>` : '') +
      `</article>`
    );
  }

  function renderTile(m) {
    const canToggle = togglesEnabled && Boolean(m.toggleable && m.moduleId && m.inProduction !== false);
    const checked = canToggle && selectedIds.has(m.moduleId);
    // Dim only in toggle mode when a card isn't selectable — browse mode is all display.
    const readonlyClass = togglesEnabled && !canToggle ? ' dl-tile--readonly' : '';
    const edit = renderEditLink(m.feature);
    const footInner = canToggle
      ? `${edit}${renderSwitch(checked, m.moduleId)}`
      : edit;

    return (
      `<article class="dl-tile${checked ? ' dl-tile--selected' : ''}${readonlyClass}" ` +
      `data-feature="${esc(m.feature)}"${canToggle || edit ? '' : ' aria-disabled="true"'}>` +
      `<div class="dl-tile-body">` +
      `<div class="dl-tile-head">` +
      `<h3 class="dl-tile-label">${esc(m.label)}</h3>` +
      renderStatusDot(m) +
      `</div>` +
      (m.blurb ? `<p class="dl-tile-blurb">${esc(m.blurb)}</p>` : '') +
      (Array.isArray(m.requiresLabels) && m.requiresLabels.length
        ? `<p class="dl-tile-requires">Requires ${esc(m.requiresLabels.join(', '))}</p>`
        : '') +
      (Array.isArray(m.features) && m.features.length
        ? `<ul class="dl-tile-features">${m.features.map((f) => `<li>${esc(f.label)}</li>`).join('')}</ul>`
        : '') +
      `</div>` +
      (footInner ? `<div class="dl-tile-foot">${footInner}</div>` : '') +
      `</article>`
    );
  }

  function pickDefaultIndustry() {
    const slugs = new Set(industries.map((item) => item.slug));
    if (slugs.has('general')) return 'general';
    return industries[0]?.slug || 'general';
  }

  function industryModuleIds(slug) {
    const allowed = new Set(toggleableModules().map((m) => m.moduleId));
    const ids = industryDefaults[slug] || [];
    return ids
      .map((id) => String(id).padStart(3, '0'))
      .filter((id) => allowed.has(id));
  }

  function applyIndustrySelection(slug) {
    selectedIds = new Set();
    for (const id of industryModuleIds(slug)) applyModuleToggle(id, true);
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
    return renderStatusLegend({
      deployedLabel: togglesEnabled ? 'Deployed — include in demo' : 'Deployed — ready',
    });
  }

  function renderSection(section) {
    const title =
      section.title ?
        `<h2 class="dl-section-title">${esc(section.title)}</h2>`
      : '';
    const grid =
      (section.modules || []).length ?
        `<div class="dl-grid">${(section.modules || []).map(renderTile).join('')}</div>`
      : '';
    return (
      `<section class="dl-section"${section.id ? ` data-section="${esc(section.id)}"` : ''}>` +
      title +
      grid +
      `</section>`
    );
  }

  function renderIncludedSection() {
    if (!included.length) return '';
    return (
      `<section class="dl-section" data-section="included">` +
      `<h2 class="dl-section-title">Core OS</h2>` +
      `<div class="dl-grid">${included.map(renderIncludedTile).join('')}</div>` +
      `</section>`
    );
  }

  function renderSuccess() {
    root.innerHTML =
      `<div class="dl-panel dl-panel--success" role="status">` +
      `<h2 class="dl-success-title">You’re all set</h2>` +
      `<p class="dl-success-body">Thanks${visitorName.trim() ? `, ${esc(visitorName.trim().split(/\s+/)[0])}` : ''}. ` +
      `We’ll contact you as soon as it’s ready.</p>` +
      `<p class="dl-success-meta">We’ll reach out at <strong>${esc(visitorEmail.trim())}</strong>.</p>` +
      renderCallout(`<a href="/demo">Back to demo</a>`, { tag: 'p' }) +
      `</div>`;
  }

  function renderBrowseChrome() {
    const deployed = modules.filter((m) => m.status === 'deployed').length;
    return (
      `<p class="dl-meta">${included.length} included · ${deployed} deployed · ${modules.length} add-ons available</p>` +
      renderCallout(
        `Browse optional modules by group. To try a custom stack in a sandbox, ` +
          `<a href="/demo-loader">build your demo</a>.`,
        { tag: 'p' },
      )
    );
  }

  function renderLaunchChrome() {
    const toggleCount = toggleableModules().length;
    const selectedCount = selectedToggleableCount();
    const ready = canLaunch();

    return (
      `<div class="dl-toolbar">` +
      `<div class="dl-visitor">` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Your name</span>` +
      `<input id="dl-name" class="dl-input" type="text" autocomplete="name" required maxlength="120" ` +
      `placeholder="Jane Smith" value="${esc(visitorName)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Work email</span>` +
      `<input id="dl-email" class="dl-input" type="email" autocomplete="email" required maxlength="254" ` +
      `placeholder="jane@company.com" value="${esc(visitorEmail)}" />` +
      `</label>` +
      `<label class="dl-field dl-honeypot" aria-hidden="true">` +
      `<span class="dl-field-label">Company website</span>` +
      `<input id="dl-website" class="dl-input" type="text" tabindex="-1" autocomplete="off" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Industry</span>` +
      `<select id="dl-industry" class="dl-select">${renderIndustryOptions()}</select>` +
      `</label>` +
      `</div>` +
      `<div class="dl-toolbar-actions">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dl-select-all"${selectedCount === toggleCount ? ' disabled' : ''}>Select all deployed</button>` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dl-clear"${selectedCount ? '' : ' disabled'}>Clear</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dl-launch"${ready ? '' : ' disabled'}>` +
      (launching ? 'Submitting…' : 'Build my demo') +
      `</button>` +
      `</div>` +
      (launchError ? `<p class="dl-launch-error" role="alert">${esc(launchError)}</p>` : '') +
      `<p class="dl-meta">${included.length} included · ${selectedCount} optional selected · ${modules.length} add-ons available</p>` +
      `</div>`
    );
  }

  function render() {
    if (togglesEnabled && submitted) {
      renderSuccess();
      return;
    }

    root.innerHTML =
      `<div class="dl-panel">` +
      renderLegend() +
      (togglesEnabled ? renderLaunchChrome() : '') +
      `<div class="dl-sections">` +
      renderIncludedSection() +
      sections.map(renderSection).join('') +
      `</div>` +
      (togglesEnabled ? '' : renderBrowseChrome()) +
      `</div>`;
  }

  function readVisitorFields() {
    const nameEl = root.querySelector('#dl-name');
    const emailEl = root.querySelector('#dl-email');
    if (nameEl) visitorName = nameEl.value || '';
    if (emailEl) visitorEmail = emailEl.value || '';
  }

  function moduleById(id) {
    return modules.find((m) => m.moduleId === id) || null;
  }

  function moduleByFeature(feature) {
    return modules.find((m) => m.feature === feature) || null;
  }

  function applyModuleToggle(id, on) {
    if (!id) return;
    if (on) {
      if (selectedIds.has(id)) return;
      selectedIds.add(id);
      const mod = moduleById(id);
      for (const req of mod?.requires || []) {
        const required = moduleByFeature(req);
        if (required?.moduleId) applyModuleToggle(required.moduleId, true);
      }
      return;
    }
    if (!selectedIds.has(id)) return;
    selectedIds.delete(id);
    const feature = moduleById(id)?.feature;
    if (!feature) return;
    for (const m of modules) {
      if ((m.requires || []).includes(feature) && m.moduleId) applyModuleToggle(m.moduleId, false);
    }
  }

  function toggleModule(id) {
    if (!togglesEnabled) return;
    readVisitorFields();
    if (!toggleableModules().some((m) => m.moduleId === id)) return;
    applyModuleToggle(id, !selectedIds.has(id));
    render();
    bind();
  }

  async function launch() {
    if (!togglesEnabled || launching || submitted) return;
    readVisitorFields();
    launchError = '';
    if (visitorName.trim().length < 2) {
      launchError = 'Please enter your name.';
      render();
      bind();
      root.querySelector('#dl-name')?.focus();
      return;
    }
    if (!visitorEmail.trim().includes('@')) {
      launchError = 'Please enter a valid email.';
      render();
      bind();
      root.querySelector('#dl-email')?.focus();
      return;
    }

    launching = true;
    render();
    bind();

    try {
      const website = root.querySelector('#dl-website')?.value || '';
      const res = await fetch('/api/demo/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: visitorName.trim(),
          email: visitorEmail.trim(),
          industry: industry || 'general',
          moduleIds: launchModuleIds(),
          tier: 1,
          website,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Could not submit request (${res.status})`);
      }
      launching = false;
      submitted = true;
      render();
    } catch (e) {
      launching = false;
      launchError = e.message || 'Could not submit request.';
      render();
      bind();
    }
  }

  function bind() {
    if (!togglesEnabled || submitted) return;

    root.querySelector('#dl-industry')?.addEventListener('change', (e) => {
      readVisitorFields();
      industry = e.target.value || 'general';
      applyIndustrySelection(industry);
      render();
      bind();
    });

    const syncLaunchEnabled = () => {
      readVisitorFields();
      const btn = root.querySelector('#dl-launch');
      if (btn) btn.disabled = !canLaunch();
    };
    root.querySelector('#dl-name')?.addEventListener('input', syncLaunchEnabled);
    root.querySelector('#dl-email')?.addEventListener('input', syncLaunchEnabled);

    root.querySelector('#dl-select-all')?.addEventListener('click', () => {
      readVisitorFields();
      selectedIds = new Set(toggleableModules().map((m) => m.moduleId));
      render();
      bind();
    });

    root.querySelector('#dl-clear')?.addEventListener('click', () => {
      readVisitorFields();
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

    root.querySelectorAll('.dl-tile:not(.dl-tile--readonly):not(.dl-tile--included)').forEach((tile) => {
      tile.addEventListener('click', (e) => {
        if (e.target.closest('.dl-tile-edit')) return;
        const id = tile.querySelector('.dl-switch')?.getAttribute('data-module-id');
        if (id) toggleModule(id);
      });
    });

    root.querySelector('#dl-launch')?.addEventListener('click', () => {
      void launch();
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
      root.innerHTML = `<p class="dl-error">Could not load modules: ${esc(e.message)}</p>`;
    }
  }

  void init();
})();
