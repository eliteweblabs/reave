/**
 * Owner deploy wizard — demo-loader tile grid, then Railway reference plan.
 */
(function () {
  const STEPS = [
    { id: 'modules', label: 'Modules' },
    { id: 'services', label: 'Services' },
    { id: 'variables', label: 'Variables' },
    { id: 'review', label: 'Review' },
  ];

  const STATUS = {
    deployed: { label: 'Deployed', badge: 'dl-badge--deployed' },
    development: { label: 'Development', badge: 'dl-badge--development' },
    request: { label: 'Requested', badge: 'dl-badge--request' },
    rejected: { label: 'Rejected', badge: 'dl-badge--rejected' },
  };

  const KIND_LABEL = {
    reference: 'Reference',
    shared: 'Shared ref',
    generated: 'Generate',
    secret: 'Enter',
    literal: 'Value',
  };

  let modules = [];
  let sections = [];
  let included = [];
  let extrasCatalog = [];
  let selectedIds = new Set();
  let selectedExtras = new Set();
  let step = 0;
  let appService = 'reave';
  let installSlug = 'demo';
  let siteDomain = '';
  let project = '';
  let environment = 'production';
  let railway = { configured: false, projects: [] };
  let plan = null;
  let cli = '';
  let values = {};
  let error = '';
  let applying = false;
  let applied = null;

  const root = document.getElementById('deploy-wizard-app');
  if (!root) return;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function varKey(variable) {
    return `${variable.service}:${variable.name}`;
  }

  function randomSecret(bytes) {
    const a = new Uint8Array(bytes || 24);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function toggleableModules() {
    return modules.filter((m) => m.toggleable && m.moduleId);
  }

  function selectedFeatures() {
    const out = [];
    for (const m of modules) {
      if (m.moduleId && selectedIds.has(m.moduleId)) out.push(m.feature);
    }
    return out;
  }

  function visibleExtras() {
    const features = new Set(selectedFeatures());
    return extrasCatalog.filter((e) => {
      if (!e.whenFeatures || !e.whenFeatures.length) return true;
      return e.whenFeatures.some((f) => features.has(f));
    });
  }

  function statusMeta(m) {
    return STATUS[m.status] || STATUS.development;
  }

  function renderSwitch(checked, id, attr) {
    return (
      `<button type="button" class="dl-switch" role="switch" ` +
      `aria-checked="${checked ? 'true' : 'false'}" ${attr}="${esc(id)}" ` +
      `aria-label="Include"></button>`
    );
  }

  function renderIncludedTile(card) {
    return (
      `<article class="dl-tile dl-tile--included" data-included="${esc(card.id)}" aria-disabled="true">` +
      `<div class="dl-tile-body">` +
      `<span class="dl-badge dl-badge--included">Included</span>` +
      `<h3 class="dl-tile-label">${esc(card.label)}</h3>` +
      (card.blurb ? `<p class="dl-tile-blurb">${esc(card.blurb)}</p>` : '') +
      `</div>` +
      `</article>`
    );
  }

  function renderTile(m) {
    const canToggle = Boolean(m.toggleable && m.moduleId);
    const checked = canToggle && selectedIds.has(m.moduleId);
    const meta = statusMeta(m);
    return (
      `<article class="dl-tile${checked ? ' dl-tile--selected' : ''}" ` +
      `data-feature="${esc(m.feature)}">` +
      `<div class="dl-tile-body">` +
      `<span class="dl-badge ${meta.badge}">${esc(meta.label)}</span>` +
      `<h3 class="dl-tile-label">${esc(m.label)}</h3>` +
      (m.blurb ? `<p class="dl-tile-blurb">${esc(m.blurb)}</p>` : '') +
      `</div>` +
      (canToggle ? `<div class="dl-tile-foot">${renderSwitch(checked, m.moduleId, 'data-module-id')}</div>` : '') +
      `</article>`
    );
  }

  function renderSection(section) {
    const title = section.title ? `<h2 class="dl-section-title">${esc(section.title)}</h2>` : '';
    const grid =
      (section.modules || []).length ?
        `<div class="dl-grid">${(section.modules || []).map(renderTile).join('')}</div>`
      : '';
    return `<section class="dl-section">${title}${grid}</section>`;
  }

  function renderStepper() {
    return (
      `<ol class="dw-steps">` +
      STEPS.map((s, i) => {
        const cls = i === step ? ' dw-step--current' : i < step ? ' dw-step--done' : '';
        return `<li class="dw-step${cls}"><span class="dw-step-n">${i + 1}</span>${esc(s.label)}</li>`;
      }).join('') +
      `</ol>`
    );
  }

  function renderIdentity() {
    const projectOptions = (railway.projects || [])
      .map((p) => {
        const selected = p.id === project || p.name === project ? ' selected' : '';
        return `<option value="${esc(p.id)}"${selected}>${esc(p.name)}</option>`;
      })
      .join('');
    return (
      `<div class="dl-toolbar dw-identity">` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Install slug</span>` +
      `<input id="dw-install" class="dl-input" type="text" maxlength="40" value="${esc(installSlug)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Site domain</span>` +
      `<input id="dw-domain" class="dl-input" type="text" maxlength="120" placeholder="acme.com" value="${esc(siteDomain)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">App service name</span>` +
      `<input id="dw-app" class="dl-input" type="text" maxlength="64" value="${esc(appService)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Railway project</span>` +
      (projectOptions
        ? `<select id="dw-project" class="dl-select"><option value="">Select project…</option>${projectOptions}</select>`
        : `<input id="dw-project" class="dl-input" type="text" placeholder="Project name or ID" value="${esc(project)}" />`) +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Environment</span>` +
      `<input id="dw-env" class="dl-input" type="text" value="${esc(environment)}" />` +
      `</label>` +
      `</div>`
    );
  }

  function renderModules() {
    const toggleCount = toggleableModules().length;
    const selectedCount = [...selectedIds].length;
    return (
      renderIdentity() +
      `<div class="dl-toolbar-actions dw-module-actions">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dw-select-all"${selectedCount === toggleCount ? ' disabled' : ''}>Select all</button>` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dw-clear"${selectedCount ? '' : ' disabled'}>Clear</button>` +
      `</div>` +
      `<p class="dl-meta">${included.length} core · ${selectedCount} modules selected</p>` +
      `<div class="dl-sections">` +
      `<section class="dl-section" data-section="included">` +
      `<h2 class="dl-section-title">Core OS</h2>` +
      `<div class="dl-grid">${included.map(renderIncludedTile).join('')}</div>` +
      `</section>` +
      sections.map(renderSection).join('') +
      `</div>`
    );
  }

  function renderServices() {
    if (!plan) return `<p class="dl-loading">Building service list…</p>`;
    const extras = visibleExtras();
    return (
      `<p class="dl-footnote">Create these Railway services with <strong>these exact names</strong> so the reference templates resolve. Postgres plugins keep the names below.</p>` +
      (extras.length
        ? `<div class="dw-extras">` +
          extras
            .map((e) => {
              const on = selectedExtras.has(e.id);
              return (
                `<article class="dl-tile${on ? ' dl-tile--selected' : ''}" data-extra="${esc(e.id)}">` +
                `<div class="dl-tile-body">` +
                `<span class="dl-badge dl-badge--included">Optional</span>` +
                `<h3 class="dl-tile-label">${esc(e.label)}</h3>` +
                `<p class="dl-tile-blurb">${esc(e.blurb)}</p>` +
                `</div>` +
                `<div class="dl-tile-foot">${renderSwitch(on, e.id, 'data-extra-id')}</div>` +
                `</article>`
              );
            })
            .join('') +
          `</div>`
        : '') +
      `<div class="dw-service-list">` +
      plan.services
        .map(
          (s) =>
            `<article class="dw-service">` +
            `<div class="dw-service-head">` +
            `<code class="dw-svc-name">${esc(s.id)}</code>` +
            `<span class="dl-badge ${s.kind === 'postgres' ? 'dl-badge--development' : 'dl-badge--deployed'}">${esc(s.kind)}</span>` +
            `</div>` +
            `<h3 class="dl-tile-label">${esc(s.label)}</h3>` +
            `<p class="dl-tile-blurb">${esc(s.description)}</p>` +
            (s.repo ? `<p class="dw-repo">${esc(s.repo)}</p>` : '') +
            `</article>`,
        )
        .join('') +
      `</div>` +
      renderDomains()
    );
  }

  function renderDomains() {
    const rows = plan?.domains || [];
    if (!rows.length) return '';
    return (
      `<section class="dl-section" data-section="domains">` +
      `<h2 class="dl-section-title">DNS / subdomains</h2>` +
      `<label class="dl-field dw-domain-field">` +
      `<span class="dl-field-label">Site domain (apex)</span>` +
      `<input id="dw-domain" class="dl-input" type="text" maxlength="120" placeholder="acme.com" value="${esc(siteDomain)}" />` +
      `</label>` +
      `<p class="dl-footnote">Add these on the install apex${siteDomain ? ` (${esc(siteDomain)})` : ''}. Prefixes stay the same on every client — <code>ap</code>, <code>cal</code>, <code>inbound</code>. Attach each CNAME on the named Railway service, then add Railway’s <code>_railway-verify</code> TXT until it verifies.</p>` +
      `<div class="dw-table-wrap">` +
      `<table class="dw-table">` +
      `<thead><tr><th>Host</th><th>Type</th><th>FQDN</th><th>Attach on</th><th>Notes</th></tr></thead>` +
      `<tbody>` +
      rows
        .map(
          (d) =>
            `<tr>` +
            `<td><code>${esc(d.host)}</code></td>` +
            `<td><span class="dw-kind dw-kind--${d.type === 'MX' ? 'secret' : 'reference'}">${esc(d.type)}</span></td>` +
            `<td><code class="dw-ref">${esc(d.fqdn)}</code></td>` +
            `<td class="dw-var-help">${esc(d.attach)}</td>` +
            `<td class="dw-var-help">${esc(d.description)}</td>` +
            `</tr>`,
        )
        .join('') +
      `</tbody></table></div></section>`
    );
  }

  function renderVarRow(variable) {
    const key = varKey(variable);
    const current = values[key] ?? variable.filled ?? '';
    const locked = variable.kind === 'reference' || variable.kind === 'shared';
    const kindCls = `dw-kind dw-kind--${esc(variable.kind)}`;
    const input =
      locked ?
        `<code class="dw-ref">${esc(current)}</code>`
      : `<input class="dl-input dw-var-input" data-var-key="${esc(key)}" type="${variable.kind === 'secret' ? 'password' : 'text'}" value="${esc(current)}" autocomplete="off" spellcheck="false" />`;
    const gen =
      variable.kind === 'generated'
        ? `<button type="button" class="dl-btn dl-btn--ghost dw-gen" data-gen="${esc(key)}">Generate</button>`
        : '';
    return (
      `<tr>` +
      `<td><code>${esc(variable.name)}</code></td>` +
      `<td><span class="${kindCls}">${esc(KIND_LABEL[variable.kind] || variable.kind)}</span></td>` +
      `<td class="dw-var-value">${input}${gen}</td>` +
      `<td class="dw-var-help">${esc(variable.description)}</td>` +
      `</tr>`
    );
  }

  function renderVariables() {
    if (!plan) return `<p class="dl-loading">Building variable plan…</p>`;
    const byService = new Map();
    for (const variable of plan.variables) {
      const list = byService.get(variable.service) || [];
      list.push(variable);
      byService.set(variable.service, list);
    }
    let html =
      `<p class="dl-footnote">Green chips are Railway references — they stay the same on every install as long as service names match. Only the Enter / Generate rows need a value.</p>` +
      `<p class="dl-meta">${plan.referenceCount} references · ${plan.secretCount} secrets · ${plan.generatedCount} generated</p>`;
    for (const [service, vars] of byService) {
      html +=
        `<section class="dl-section">` +
        `<h2 class="dl-section-title">${esc(service)}</h2>` +
        `<div class="dw-table-wrap">` +
        `<table class="dw-table">` +
        `<thead><tr><th>Variable</th><th>Kind</th><th>Value</th><th>Notes</th></tr></thead>` +
        `<tbody>${vars.map(renderVarRow).join('')}</tbody>` +
        `</table></div></section>`;
    }
    return html;
  }

  function renderReview() {
    if (!plan) return `<p class="dl-loading">Building plan…</p>`;
    const missing = plan.variables.filter((v) => {
      if (v.kind !== 'secret' || v.required === false) return false;
      const val = values[varKey(v)] ?? v.filled;
      return !val;
    });
    return (
      `<div class="dw-review-stats">` +
      `<span class="mod-summary-pill">${plan.services.length} services</span>` +
      `<span class="mod-summary-pill">${plan.referenceCount} auto-wired</span>` +
      `<span class="mod-summary-pill">${plan.features.length} modules</span>` +
      `<span class="mod-summary-pill">${(plan.domains || []).length} DNS hosts</span>` +
      `</div>` +
      (missing.length
        ? `<p class="dl-launch-error" role="alert">${missing.length} required secret${missing.length === 1 ? '' : 's'} still empty — you can still copy the CLI and fill them later.</p>`
        : '') +
      `<label class="dl-field dw-cli-field">` +
      `<span class="dl-field-label">Railway CLI</span>` +
      `<textarea id="dw-cli" class="dl-input dw-cli" readonly rows="16">${esc(cli)}</textarea>` +
      `</label>` +
      `<div class="dl-toolbar-actions">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dw-copy">Copy CLI</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dw-apply"${railway.configured && project && !applying ? '' : ' disabled'}>` +
      (applying ? 'Applying…' : 'Apply references to Railway') +
      `</button>` +
      `</div>` +
      (railway.configured
        ? `<p class="dl-meta">Apply writes reference + entered values to the selected project. Services must already exist with these names.</p>`
        : `<p class="dl-meta">This host has no RAILWAY_API_TOKEN — copy the CLI and run it against the new project.</p>`) +
      (applied
        ? `<p class="dl-footnote" role="status">Saved ${applied.reduce((n, a) => n + a.updated.length, 0)} variables across ${applied.length} scopes. Redeploy when ready.</p>`
        : '')
    );
  }

  function renderNav() {
    return (
      `<div class="dw-nav">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dw-back"${step === 0 ? ' disabled' : ''}>Back</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dw-next"${step >= STEPS.length - 1 ? ' hidden' : ''}>` +
      (step === 0 ? 'Continue to services' : step === 1 ? 'Continue to variables' : 'Review plan') +
      `</button>` +
      `</div>`
    );
  }

  function render() {
    root.innerHTML =
      `<div class="dl-panel">` +
      renderStepper() +
      (error ? `<p class="dl-launch-error" role="alert">${esc(error)}</p>` : '') +
      (step === 0 ? renderModules() : '') +
      (step === 1 ? renderServices() : '') +
      (step === 2 ? renderVariables() : '') +
      (step === 3 ? renderReview() : '') +
      renderNav() +
      `</div>`;
  }

  function readIdentity() {
    const installEl = root.querySelector('#dw-install');
    const domainEl = root.querySelector('#dw-domain');
    const appEl = root.querySelector('#dw-app');
    const projectEl = root.querySelector('#dw-project');
    const envEl = root.querySelector('#dw-env');
    if (installEl) installSlug = installEl.value.trim() || 'demo';
    if (domainEl) siteDomain = domainEl.value.trim();
    if (appEl) appService = appEl.value.trim() || 'reave';
    if (projectEl) project = projectEl.value.trim();
    if (envEl) environment = envEl.value.trim() || 'production';
  }

  function readVarInputs() {
    root.querySelectorAll('.dw-var-input').forEach((el) => {
      const key = el.getAttribute('data-var-key');
      if (key) values[key] = el.value;
    });
  }

  async function fetchPlan() {
    error = '';
    const res = await fetch('/api/deploy/wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'plan',
        moduleIds: [...selectedIds],
        extras: [...selectedExtras],
        appService,
        installSlug,
        siteDomain,
        values,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `Could not build plan (${res.status})`);
    plan = json.plan;
    cli = json.cli || '';
    for (const variable of plan.variables) {
      const key = varKey(variable);
      if (values[key] == null && variable.filled && (variable.kind === 'literal' || variable.kind === 'generated')) {
        values[key] = variable.filled;
      }
      if (variable.kind === 'generated' && !values[key]) {
        values[key] = randomSecret(24);
      }
    }
  }

  async function goNext() {
    readIdentity();
    readVarInputs();
    error = '';
    if (step === 0 || step === 1 || step === 2) {
      try {
        await fetchPlan();
      } catch (e) {
        error = e.message || 'Could not build plan.';
        render();
        bind();
        return;
      }
    }
    if (step < STEPS.length - 1) step += 1;
    render();
    bind();
  }

  async function applyPlan() {
    if (applying) return;
    readIdentity();
    readVarInputs();
    if (!project) {
      error = 'Select a Railway project first.';
      render();
      bind();
      return;
    }
    applying = true;
    error = '';
    render();
    bind();
    try {
      const res = await fetch('/api/deploy/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          moduleIds: [...selectedIds],
          extras: [...selectedExtras],
          appService,
          installSlug,
          siteDomain,
          project,
          environment,
          values,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Apply failed (${res.status})`);
      plan = json.plan;
      cli = json.cli || cli;
      applied = json.applied || [];
    } catch (e) {
      error = e.message || 'Could not apply variables.';
    } finally {
      applying = false;
      render();
      bind();
    }
  }

  function bind() {
    root.querySelector('#dw-back')?.addEventListener('click', () => {
      readIdentity();
      readVarInputs();
      if (step > 0) step -= 1;
      render();
      bind();
    });
    root.querySelector('#dw-next')?.addEventListener('click', () => {
      void goNext();
    });
    root.querySelector('#dw-select-all')?.addEventListener('click', () => {
      readIdentity();
      selectedIds = new Set(toggleableModules().map((m) => m.moduleId));
      render();
      bind();
    });
    root.querySelector('#dw-clear')?.addEventListener('click', () => {
      readIdentity();
      selectedIds = new Set();
      render();
      bind();
    });
    root.querySelectorAll('[data-module-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        readIdentity();
        const id = btn.getAttribute('data-module-id');
        if (!id) return;
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        render();
        bind();
      });
    });
    root.querySelectorAll('.dl-tile[data-feature]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const id = tile.querySelector('[data-module-id]')?.getAttribute('data-module-id');
        if (!id) return;
        readIdentity();
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        render();
        bind();
      });
    });
    root.querySelectorAll('[data-extra-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-extra-id');
        if (!id) return;
        if (selectedExtras.has(id)) selectedExtras.delete(id);
        else selectedExtras.add(id);
        void goNextFromExtras();
      });
    });
    root.querySelectorAll('.dl-tile[data-extra]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const id = tile.getAttribute('data-extra');
        if (!id) return;
        if (selectedExtras.has(id)) selectedExtras.delete(id);
        else selectedExtras.add(id);
        void goNextFromExtras();
      });
    });
    root.querySelectorAll('.dw-gen').forEach((btn) => {
      btn.addEventListener('click', () => {
        readVarInputs();
        const key = btn.getAttribute('data-gen');
        if (key) values[key] = randomSecret(24);
        render();
        bind();
      });
    });
    root.querySelector('#dw-domain')?.addEventListener('change', () => {
      readIdentity();
      if (step === 1) void goNextFromExtras();
    });
    root.querySelector('#dw-copy')?.addEventListener('click', async () => {
      const text = root.querySelector('#dw-cli')?.value || cli;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        root.querySelector('#dw-cli')?.select();
      }
    });
    root.querySelector('#dw-apply')?.addEventListener('click', () => {
      void applyPlan();
    });
  }

  async function goNextFromExtras() {
    readIdentity();
    try {
      await fetchPlan();
    } catch (e) {
      error = e.message || 'Could not rebuild plan.';
    }
    render();
    bind();
  }

  async function init() {
    root.innerHTML = '<p class="dl-loading">Loading modules…</p>';
    try {
      const res = await fetch('/api/deploy/wizard', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      modules = data.modules || [];
      sections = data.sections || [];
      included = data.included || [];
      extrasCatalog = data.extras || [];
      railway = data.railway || railway;
      if (data.defaults) {
        appService = data.defaults.appService || appService;
        environment = data.defaults.environment || environment;
        installSlug = data.defaults.installSlug || installSlug;
        if (typeof data.defaults.siteDomain === 'string') siteDomain = data.defaults.siteDomain;
      }
      selectedIds = new Set(data.defaultModuleIds || toggleableModules().map((m) => m.moduleId));
      if (railway.projects?.length === 1) project = railway.projects[0].id;
      render();
      bind();
    } catch (e) {
      root.innerHTML = `<p class="dl-error">Could not load wizard: ${esc(e.message)}</p>`;
    }
  }

  void init();
})();
