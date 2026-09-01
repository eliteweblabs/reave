/**
 * Public demo loader — 6-column tile grid with grouped sections.
 *
 * Modes (on #demo-loader-app):
 *   data-toggles="true"  (default) — pick modules + request a custom demo
 *   data-toggles="false" — browse-only catalog; no switches, no launch form
 *
 * Sticky Clear / Build follow the homepage track pattern: the track wraps
 * hero + app from the page top (see demo-loader.astro). CTAs are a direct
 * grid sibling of the track body — never nested mid-list (that parked them
 * on "Core OS"). Shell mounts once; toggles sync in place.
 */
(function () {
  const { MODULE_STATUS: STATUS, escHtml: esc, renderCallout } =
    window.ModuleLoaderShared;

  /** Safari bottom toolbar inset — mirrors src/lib/browserUiBottomInset.ts */
  (function initBrowserUiBottomInset() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const sync = function () {
      raf = 0;
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop),
      );
      document.documentElement.style.setProperty(
        '--browser-ui-bottom',
        inset + 'px',
      );
    };
    const schedule = function () {
      if (raf) return;
      raf = window.requestAnimationFrame(sync);
    };
    sync();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
  })();

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

  function stickyTrack() {
    return document.querySelector('[data-dl-sticky-ctas-track]');
  }

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
    let tip = meta.label;
    if (m.status === 'deployed') {
      tip = togglesEnabled ? 'Deployed — include in demo' : 'Deployed — ready';
    } else if (m.status === 'request' || m.status === 'rejected') {
      tip = m.status === 'rejected' ? 'Rejected' : 'Requested';
    }
    return (
      `<span class="dl-status-dot dl-status-dot--${meta.tone}" ` +
      `title="${esc(tip)}" role="img" aria-label="${esc(tip)}"></span>`
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
      `<span class="dl-badge dl-badge--included" title="Always on">Included</span>` +
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
    return renderCallout(
      `Browse optional modules by group. To try a custom stack in a sandbox, ` +
        `<a href="/demo-loader">build your demo</a>.`,
      { tag: 'p' },
    );
  }

  function renderLaunchFields() {
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
      `</div>`
    );
  }

  function renderStickyActions() {
    return (
      `<div class="dl-sticky-ctas" data-dl-sticky-ctas>` +
      `<div class="dl-sticky-ctas__row">` +
      `<button type="button" class="dl-btn dl-btn--ghost brand-btn-glass" id="dl-clear">Clear</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dl-launch">Build my demo</button>` +
      `</div>` +
      `</div>`
    );
  }

  function syncStickyActions() {
    const track = stickyTrack();
    const clear = track?.querySelector('#dl-clear');
    const launch = track?.querySelector('#dl-launch');
    if (clear) clear.disabled = selectedToggleableCount() === 0;
    if (launch) {
      launch.disabled = !canLaunch();
      launch.textContent = launching ? 'Submitting…' : 'Build my demo';
    }
  }

  function syncLaunchError() {
    const toolbar = root.querySelector('.dl-toolbar');
    if (!toolbar) return;
    let err = toolbar.querySelector('.dl-launch-error');
    if (!launchError) {
      err?.remove();
      return;
    }
    if (!err) {
      err = document.createElement('p');
      err.className = 'dl-launch-error';
      err.setAttribute('role', 'alert');
      toolbar.appendChild(err);
    }
    err.textContent = launchError;
  }

  function syncTiles() {
    root.querySelectorAll('.dl-tile .dl-switch[data-module-id]').forEach((sw) => {
      const id = sw.getAttribute('data-module-id');
      if (!id) return;
      const on = selectedIds.has(id);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      sw.closest('.dl-tile')?.classList.toggle('dl-tile--selected', on);
    });
  }

  /** Size the parked `top` like homepage homeStickyCtas — must match the pill. */
  function measureStickyCtas() {
    const track = stickyTrack();
    const ctas = track?.querySelector(':scope > [data-dl-sticky-ctas]');
    const row = ctas?.querySelector('.dl-sticky-ctas__row');
    if (!track || !ctas || !row) return;
    const dock = root.querySelector('[data-dl-sticky-ctas-dock]');
    const height = Math.round(row.getBoundingClientRect().height);
    if (height > 0) {
      track.style.setProperty('--dl-sticky-cta-h', `${height}px`);
      if (dock) dock.style.minHeight = `${height}px`;
    }
  }

  /**
   * Homepage pattern: CTAs are a direct grid sibling of the track body, not
   * nested inside the module list (that parked them on "Core OS").
   */
  function mountStickyActions() {
    const track = stickyTrack();
    if (!track) return;
    const existing = track.querySelector(':scope > [data-dl-sticky-ctas]');
    if (!togglesEnabled || submitted) {
      existing?.remove();
      return;
    }
    if (existing) return;
    track.insertAdjacentHTML('beforeend', renderStickyActions());
  }

  function fillSections() {
    const sectionsEl = root.querySelector('[data-dl-sections]');
    if (!sectionsEl) return;
    sectionsEl.innerHTML =
      renderIncludedSection() + sections.map(renderSection).join('');
  }

  /** Mount the launch shell once so sticky CTAs are not destroyed on every toggle. */
  function mountLaunchShell() {
    root.innerHTML =
      `<div class="dl-panel">` +
      renderLaunchFields() +
      /* Reserve the sticky strip so Core OS never loads under Clear / Build. */
      `<div class="dl-sticky-ctas-spacer" aria-hidden="true"></div>` +
      `<div class="dl-sections" data-dl-sections></div>` +
      `<div class="dl-sticky-ctas-dock" data-dl-sticky-ctas-dock aria-hidden="true"></div>` +
      `</div>`;
    fillSections();
    mountStickyActions();
    syncLaunchError();
    syncStickyActions();
    requestAnimationFrame(measureStickyCtas);
  }

  function render() {
    if (togglesEnabled && submitted) {
      listenersBound = false;
      mountStickyActions();
      renderSuccess();
      return;
    }

    if (togglesEnabled) {
      if (!root.querySelector('[data-dl-sections]')) {
        mountLaunchShell();
        bindOnce();
      } else {
        syncLaunchError();
        syncTiles();
        syncStickyActions();
      }
      return;
    }

    mountStickyActions();
    root.innerHTML =
      `<div class="dl-panel">` +
      `<div class="dl-sections">` +
      renderIncludedSection() +
      sections.map(renderSection).join('') +
      `</div>` +
      renderBrowseChrome() +
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
    syncTiles();
    syncStickyActions();
  }

  async function launch() {
    if (!togglesEnabled || launching || submitted) return;
    readVisitorFields();
    launchError = '';
    syncLaunchError();
    if (visitorName.trim().length < 2) {
      launchError = 'Please enter your name.';
      syncLaunchError();
      syncStickyActions();
      root.querySelector('#dl-name')?.focus();
      return;
    }
    if (!visitorEmail.trim().includes('@')) {
      launchError = 'Please enter a valid email.';
      syncLaunchError();
      syncStickyActions();
      root.querySelector('#dl-email')?.focus();
      return;
    }

    launching = true;
    syncStickyActions();

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
      syncLaunchError();
      syncStickyActions();
    }
  }

  let listenersBound = false;

  function bindOnce() {
    if (!togglesEnabled || listenersBound || submitted) return;
    listenersBound = true;

    root.addEventListener('change', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLSelectElement) || t.id !== 'dl-industry') return;
      readVisitorFields();
      industry = t.value || 'general';
      applyIndustrySelection(industry);
      syncTiles();
      syncStickyActions();
    });

    root.addEventListener('input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.id !== 'dl-name' && t.id !== 'dl-email') return;
      readVisitorFields();
      syncStickyActions();
    });

    root.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      const sw = t.closest('.dl-switch');
      if (sw) {
        e.stopPropagation();
        const id = sw.getAttribute('data-module-id');
        if (id) toggleModule(id);
        return;
      }

      const tile = t.closest('.dl-tile:not(.dl-tile--readonly):not(.dl-tile--included)');
      if (tile) {
        if (t.closest('.dl-tile-edit')) return;
        const id = tile.querySelector('.dl-switch')?.getAttribute('data-module-id');
        if (id) toggleModule(id);
      }
    });

    /* Clear / Build live on the track sibling (outside #demo-loader-app). */
    stickyTrack()?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('#dl-clear')) {
        readVisitorFields();
        selectedIds = new Set();
        syncTiles();
        syncStickyActions();
        return;
      }
      if (t.closest('#dl-launch')) {
        void launch();
      }
    });

    window.addEventListener('resize', measureStickyCtas, { passive: true });
    window.visualViewport?.addEventListener('resize', measureStickyCtas, { passive: true });
    document.fonts?.ready?.then(() => measureStickyCtas());
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
    } catch (e) {
      mountStickyActions();
      root.innerHTML = `<p class="dl-error">Could not load modules: ${esc(e.message)}</p>`;
    }
  }

  void init();
})();
