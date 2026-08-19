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
    deployed: { label: 'Deployed', tone: 'live' },
    development: { label: 'Development', tone: 'deploying' },
    request: { label: 'Requested', tone: 'alert' },
    rejected: { label: 'Rejected', tone: 'alert' },
  };

  const KIND_LABEL = {
    reference: 'Reference',
    shared: 'Shared ref',
    generated: 'Roll',
    secret: 'Enter',
    literal: 'Value',
    host: 'This host',
    provision: 'Create',
  };

  let modules = [];
  let sections = [];
  let included = [];
  let extrasCatalog = [];
  let seedIndustries = [];
  let seed = {
    industry: 'none',
    inbox: true,
    todos: true,
    schedule: true,
    practiceAddress: '',
    courtRadiusMi: 60,
    courtCounties: [],
    practiceArea: 'bankruptcy',
  };
  let selectedIds = new Set();
  let selectedExtras = new Set();
  let step = 0;
  let appService = 'reave';
  let installSlug = 'demo';
  let siteDomain = '';
  let postAlias = 'project';
  let companyName = '';
  let adminUsername = '';
  let timezone = 'America/New_York';
  let project = '';
  let environment = 'production';
  let railway = { configured: false, projects: [] };
  let cloudflare = { configured: false };
  let plan = null;
  let cli = '';
  let values = {};
  let error = '';
  let applying = false;
  let applied = null;
  let appliedDns = null;
  let appliedProvisioned = [];
  let githubBanner = '';

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

  function toggleableModules() {
    return modules.filter((m) => m.toggleable && m.moduleId);
  }

  function selectedFeatures() {
    const allowed = new Set(toggleableModules().map((m) => m.moduleId));
    const out = [];
    for (const m of modules) {
      if (m.moduleId && allowed.has(m.moduleId) && selectedIds.has(m.moduleId)) out.push(m.feature);
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

  function renderStatusDot(m) {
    const meta = statusMeta(m);
    return (
      `<span class="dl-status-dot dl-status-dot--${meta.tone}" ` +
      `title="${esc(meta.label)}" role="img" aria-label="${esc(meta.label)}"></span>`
    );
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
    const canToggle = Boolean(m.toggleable && m.moduleId && m.inProduction !== false);
    const checked = canToggle && selectedIds.has(m.moduleId);
    const readonlyClass = canToggle ? '' : ' dl-tile--readonly';
    return (
      `<article class="dl-tile${checked ? ' dl-tile--selected' : ''}${readonlyClass}" ` +
      `data-feature="${esc(m.feature)}"${canToggle ? '' : ' aria-disabled="true"'}>` +
      `<div class="dl-tile-body">` +
      `<div class="dl-tile-head">` +
      `<h3 class="dl-tile-label">${esc(m.label)}</h3>` +
      renderStatusDot(m) +
      `</div>` +
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
      `<span class="dl-field-label">Post name</span>` +
      `<input id="dw-post" class="dl-input" type="text" maxlength="32" placeholder="project" value="${esc(postAlias)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Company name</span>` +
      `<input id="dw-company" class="dl-input" type="text" maxlength="120" placeholder="Capco Fire" value="${esc(companyName)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Admin username</span>` +
      `<input id="dw-admin" class="dl-input" type="text" maxlength="120" placeholder="Optional — defaults to company" value="${esc(adminUsername)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Timezone</span>` +
      `<input id="dw-tz" class="dl-input" type="text" maxlength="64" placeholder="America/New_York" value="${esc(timezone)}" />` +
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
      renderSeed() +
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
    const dnsByHost = new Map((appliedDns?.rows || []).map((r) => [r.host, r]));
    return (
      `<section class="dl-section" data-section="domains">` +
      `<h2 class="dl-section-title">DNS / subdomains</h2>` +
      `<label class="dl-field dw-domain-field">` +
      `<span class="dl-field-label">Site domain (apex)</span>` +
      `<input id="dw-domain" class="dl-input" type="text" maxlength="120" placeholder="acme.com" value="${esc(siteDomain)}" />` +
      `</label>` +
      `<p class="dl-footnote">${
        cloudflare.configured
          ? `Apply attaches Railway hosts and writes these on Cloudflare${siteDomain ? ` (${esc(siteDomain)})` : ''}. <code>book</code> is skipped (Railway’s public domain is enough). Clerk CNAMEs still come from Clerk → Domains.`
          : `Set <code>CLOUDFLARE_API_TOKEN</code> on this host to auto-write DNS. Until then, add these on the apex${siteDomain ? ` (${esc(siteDomain)})` : ''} and attach each CNAME on the named Railway service.`
      }</p>` +
      `<div class="dw-table-wrap">` +
      `<table class="dw-table">` +
      `<thead><tr><th>Host</th><th>Type</th><th>FQDN</th><th>Attach on</th><th>Notes</th></tr></thead>` +
      `<tbody>` +
      rows
        .map((d) => {
          const dns = dnsByHost.get(d.host);
          const note = dns ? `${dns.action}: ${dns.detail}` : d.description;
          return (
            `<tr>` +
            `<td><code>${esc(d.host)}</code></td>` +
            `<td><span class="dw-kind dw-kind--${d.type === 'MX' ? 'secret' : 'reference'}">${esc(d.type)}</span></td>` +
            `<td><code class="dw-ref">${esc(d.fqdn)}</code></td>` +
            `<td class="dw-var-help">${esc(d.attach)}</td>` +
            `<td class="dw-var-help">${esc(note)}</td>` +
            `</tr>`
          );
        })
        .join('') +
      `</tbody></table></div></section>`
    );
  }

  function renderSeed() {
    const options = (seedIndustries.length ? seedIndustries : [
      { id: 'none', label: 'No sample data' },
      { id: 'law', label: 'Law firm' },
      { id: 'plumbing', label: 'Plumbing' },
      { id: 'general', label: 'General contractor' },
    ])
      .map((row) => {
        const selected = row.id === seed.industry ? ' selected' : '';
        return `<option value="${esc(row.id)}"${selected}>${esc(row.label)}</option>`;
      })
      .join('');
    const on = seed.industry !== 'none';
    return (
      `<section class="dl-section" data-section="seed">` +
      `<h2 class="dl-section-title">Sample data</h2>` +
      `<p class="dl-footnote">Pre-fill inbox, todos, and schedule when you do not have the live account yet — pick <strong>Law firm</strong> for a practice that is not on email yet. The office pin and court radius use Mapbox, not Google.</p>` +
      `<div class="dw-identity">` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Industry</span>` +
      `<select id="dw-seed-industry" class="dl-select">${options}</select>` +
      `</label>` +
      `</div>` +
      (seed.industry === 'law'
        ? `<div class="dw-identity">` +
          `<label class="dl-field">` +
          `<span class="dl-field-label">Office address (Mapbox pin)</span>` +
          `<input id="dw-practice-address" class="dl-input" type="text" maxlength="200" placeholder="123 Cabot St, Beverly, MA 01915" value="${esc(seed.practiceAddress || '')}" />` +
          `</label>` +
          `<label class="dl-field">` +
          `<span class="dl-field-label">Court radius (miles)</span>` +
          `<input id="dw-court-radius" class="dl-input" type="number" min="10" max="250" step="5" value="${esc(String(seed.courtRadiusMi || 60))}" />` +
          `</label>` +
          `<label class="dl-field">` +
          `<span class="dl-field-label">Counties (optional)</span>` +
          `<input id="dw-court-counties" class="dl-input" type="text" maxlength="200" placeholder="Essex" value="${esc((seed.courtCounties || []).join(', '))}" />` +
          `</label>` +
          `<label class="dl-field">` +
          `<span class="dl-field-label">Department</span>` +
          `<select id="dw-practice-area" class="dl-select">` +
          [
            ['bankruptcy', 'Bankruptcy / debtor'],
            ['tax', 'Tax controversy'],
            ['foreclosure', 'Foreclosure / housing'],
            ['general', 'General practice'],
          ]
            .map(([id, label]) => {
              const selected = (seed.practiceArea || 'bankruptcy') === id ? ' selected' : '';
              return `<option value="${esc(id)}"${selected}>${esc(label)}</option>`;
            })
            .join('') +
          `</select>` +
          `</label>` +
          `</div>`
        : '') +
      (on
        ? `<div class="dw-extras">` +
          [
            ['inbox', 'Inbox', 'Sample client mail, opposing counsel, and court notices'],
            ['todos', 'Todos', 'Matters and deadlines for the next week'],
            ['schedule', 'Schedule', 'Consults, closings, and hearings on the calendar'],
          ]
            .map(([key, label, blurb]) => {
              const checked = Boolean(seed[key]);
              return (
                `<article class="dl-tile${checked ? ' dl-tile--selected' : ''}" data-seed="${esc(key)}">` +
                `<div class="dl-tile-body">` +
                `<h3 class="dl-tile-label">${esc(label)}</h3>` +
                `<p class="dl-tile-blurb">${esc(blurb)}</p>` +
                `</div>` +
                `<div class="dl-tile-foot">${renderSwitch(checked, key, 'data-seed-id')}</div>` +
                `</article>`
              );
            })
            .join('') +
          `</div>`
        : '') +
      `</section>`
    );
  }

  function renderVarRow(variable) {
    const current = values[varKey(variable)] ?? variable.filled ?? '';
    const kindKey = variable.provisionedOnApply
      ? 'provision'
      : variable.inheritFromHost
        ? 'host'
        : variable.rolledOnApply
          ? 'generated'
          : variable.kind;
    const kindCls = `dw-kind dw-kind--${esc(kindKey)}`;
    const display = variable.inheritFromHost
      ? variable.hostHasValue
        ? 'Copied on apply'
        : 'Paste if this host does not have it'
      : variable.provisionedOnApply
        ? 'Created on apply'
        : variable.rolledOnApply
          ? 'Rolled on apply'
          : current;
    const valueCell = variable.needsInput
      ? `<input class="dl-input dw-var-input" data-var-key="${esc(varKey(variable))}" type="password" autocomplete="off" placeholder="${esc(variable.hostHasValue ? 'Using this host' : 'Paste token')}" value="${esc(values[varKey(variable)] || '')}" />`
      : `<code class="dw-ref">${esc(display)}</code>`;
    return (
      `<tr>` +
      `<td><code>${esc(variable.name)}</code></td>` +
      `<td><span class="${kindCls}">${esc(KIND_LABEL[kindKey] || variable.kind)}</span></td>` +
      `<td class="dw-var-value">${valueCell}</td>` +
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
    const wiredCount = plan.variables.filter((v) => v.autoWired).length;
    let html =
      `<p class="dl-footnote">Company name, From address, and site domain live once as Railway <strong>shared</strong> variables. Change them later under the project’s Shared Variables — every service already references <code>\${{ shared.* }}</code>. Leave <code>ANTHROPIC_API_KEY</code> blank to use this host’s REΛVE key — chat will show a shared-key flag. Paste a client key to use theirs. <code>RESEND_API_KEY</code> is required unless you seeded a sample inbox. Everything else is copied, rolled, or created on apply.</p>` +
      `<p class="dl-meta">${plan.sharedKeys?.length || 0} shared · ${wiredCount} auto-wired (collapsed) · ${plan.hostSecretCount || 0} from this host · ${plan.generatedCount} rolled · ${plan.variables.filter((v) => v.provisionedOnApply).length} created</p>`;
    for (const [service, vars] of byService) {
      const shown = vars.filter((v) => !v.autoWired);
      const wired = vars.filter((v) => v.autoWired);
      const title = service === 'shared' ? 'Project (shared)' : service;
      html += `<section class="dl-section"><h2 class="dl-section-title">${esc(title)}</h2>`;
      if (shown.length) {
        html +=
          `<div class="dw-table-wrap">` +
          `<table class="dw-table">` +
          `<thead><tr><th>Variable</th><th>Kind</th><th>Value</th><th>Notes</th></tr></thead>` +
          `<tbody>${shown.map(renderVarRow).join('')}</tbody>` +
          `</table></div>`;
      }
      if (wired.length) {
        html +=
          `<details class="dw-wired">` +
          `<summary>Wired automatically (${wired.length}) — ${wired.map((v) => esc(v.name)).join(', ')}</summary>` +
          `<div class="dw-table-wrap">` +
          `<table class="dw-table">` +
          `<thead><tr><th>Variable</th><th>Kind</th><th>Value</th><th>Notes</th></tr></thead>` +
          `<tbody>${wired.map(renderVarRow).join('')}</tbody>` +
          `</table></div>` +
          `</details>`;
      }
      html += `</section>`;
    }
    return html;
  }

  function renderReview() {
    if (!plan) return `<p class="dl-loading">Building plan…</p>`;
    const missing = plan.variables.filter((v) => {
      if (v.kind !== 'secret' || v.required === false) return false;
      if (v.provisionedOnApply || v.rolledOnApply) return false;
      const typed = values[varKey(v)];
      if (typed) return false;
      if (v.inheritFromHost) return !v.hostHasValue;
      return !(v.filled);
    });
    return (
      `<div class="dw-review-stats">` +
      `<span class="mod-summary-pill">${plan.services.length} services</span>` +
      `<span class="mod-summary-pill">${plan.referenceCount} auto-wired</span>` +
      `<span class="mod-summary-pill">${plan.features.length} modules</span>` +
      `<span class="mod-summary-pill">${(plan.domains || []).length} DNS hosts</span>` +
      `</div>` +
      (missing.length
        ? `<p class="dl-launch-error" role="alert">${missing.length} required token${missing.length === 1 ? '' : 's'} missing (${missing.map((v) => v.name).join(', ')}). Paste Resend on Variables — or seed a sample inbox to skip it. Anthropic defaults to this host’s REΛVE key.</p>`
        : '') +
      `<label class="dl-field dw-cli-field">` +
      `<span class="dl-field-label">Railway CLI</span>` +
      `<textarea id="dw-cli" class="dl-input dw-cli" readonly rows="16">${esc(cli)}</textarea>` +
      `</label>` +
      `<div class="dl-toolbar-actions">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dw-copy">Copy CLI</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dw-apply"${railway.configured && project && !applying ? '' : ' disabled'}>` +
      (applying
        ? 'Applying…'
        : cloudflare.configured
          ? 'Apply Railway + Cloudflare DNS'
          : 'Apply references to Railway') +
      `</button>` +
      `</div>` +
      (railway.configured
        ? `<p class="dl-meta">Apply copies host keys, rolls secrets, creates the Resend webhook, and writes Railway variables${cloudflare.configured ? ' plus Cloudflare DNS' : ''}. Website module: GitHub will ask you to create and install a restricted App on <code>{slug}-site</code> only. Services must already exist with these names.</p>`
        : `<p class="dl-meta">This host has no RAILWAY_API_TOKEN — copy the CLI and run it against the new project.</p>`) +
      (applied
        ? `<p class="dl-footnote" role="status">Saved ${applied.reduce((n, a) => n + a.updated.length, 0)} variables across ${applied.length} scopes. Redeploy when ready.</p>`
        : '') +
      (appliedDns
        ? `<p class="dl-footnote" role="status">${esc(appliedDns.summary || '')}${
            appliedDns.leftover?.length
              ? ` Left for you: ${esc(appliedDns.leftover.join(' '))}`
              : ''
          }</p>`
        : '') +
      (appliedProvisioned.length
        ? `<p class="dl-footnote" role="status">${esc(appliedProvisioned.join(' '))}</p>`
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
      (githubBanner ? `<p class="dl-footnote" role="status">${esc(githubBanner)}</p>` : '') +
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
    const postEl = root.querySelector('#dw-post');
    const companyEl = root.querySelector('#dw-company');
    const adminEl = root.querySelector('#dw-admin');
    const tzEl = root.querySelector('#dw-tz');
    const appEl = root.querySelector('#dw-app');
    const projectEl = root.querySelector('#dw-project');
    const envEl = root.querySelector('#dw-env');
    if (installEl) installSlug = installEl.value.trim() || 'demo';
    if (domainEl) siteDomain = domainEl.value.trim();
    if (postEl) postAlias = postEl.value.trim() || 'project';
    if (companyEl) companyName = companyEl.value.trim();
    if (adminEl) adminUsername = adminEl.value.trim();
    if (tzEl) timezone = tzEl.value.trim() || 'America/New_York';
    if (appEl) appService = appEl.value.trim() || 'reave';
    if (projectEl) project = projectEl.value.trim();
    if (envEl) environment = envEl.value.trim() || 'production';
    const seedEl = root.querySelector('#dw-seed-industry');
    if (seedEl) seed = { ...seed, industry: seedEl.value || 'none' };
    const addrEl = root.querySelector('#dw-practice-address');
    const radiusEl = root.querySelector('#dw-court-radius');
    const countiesEl = root.querySelector('#dw-court-counties');
    const areaEl = root.querySelector('#dw-practice-area');
    if (addrEl) seed.practiceAddress = addrEl.value.trim();
    if (radiusEl) {
      const radius = Number(radiusEl.value);
      seed.courtRadiusMi = Number.isFinite(radius) && radius > 0 ? radius : 60;
    }
    if (countiesEl) {
      seed.courtCounties = countiesEl.value
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    }
    if (areaEl) seed.practiceArea = areaEl.value || 'bankruptcy';
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
        postAlias,
        companyName,
        adminUsername,
        timezone,
        seed,
        values,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `Could not build plan (${res.status})`);
    plan = json.plan;
    cli = json.cli || '';
    const identityNames = new Set([
      'INSTALL_CONFIG',
      'CALCOM_USERNAME',
      'POST_ALIAS',
      'COMPANY_NAME',
      'ADMIN_USERNAME',
      'BOOKING_TIMEZONE',
      'PUBLIC_SITE_DOMAIN',
      'EMAIL_FROM',
      'VAPID_SUBJECT',
    ]);
    for (const variable of plan.variables) {
      const key = varKey(variable);
      if (identityNames.has(variable.name) && variable.filled) {
        values[key] = variable.filled;
      } else if (values[key] == null && variable.filled && variable.kind === 'literal') {
        values[key] = variable.filled;
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
    let leavingForGithub = false;
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
          postAlias,
          companyName,
          adminUsername,
          timezone,
          seed,
          project,
          environment,
          values,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Apply failed (${res.status})`);
      if (json.needsGithubApp) {
        leavingForGithub = true;
        submitGithubAppManifest(json.needsGithubApp);
        return;
      }
      plan = json.plan;
      cli = json.cli || cli;
      applied = json.applied || [];
      appliedDns = json.dns || null;
      appliedProvisioned = json.provisioned || [];
    } catch (e) {
      error = e.message || 'Could not apply variables.';
    } finally {
      if (!leavingForGithub) {
        applying = false;
        render();
        bind();
      }
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
    root.querySelector('#dw-seed-industry')?.addEventListener('change', () => {
      readIdentity();
      if (seed.industry !== 'none') {
        seed.inbox = true;
        seed.todos = true;
        seed.schedule = true;
      }
      if (seed.industry === 'law' && postAlias === 'project') postAlias = 'matter';
      render();
      bind();
    });
    root.querySelectorAll('[data-seed-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-seed-id');
        if (!key || !(key in seed) || key === 'industry') return;
        seed[key] = !seed[key];
        render();
        bind();
      });
    });
    root.querySelectorAll('.dl-tile[data-seed]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const key = tile.getAttribute('data-seed');
        if (!key || !(key in seed) || key === 'industry') return;
        seed[key] = !seed[key];
        render();
        bind();
      });
    });
  }

  function submitGithubAppManifest(setup) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = setup.actionUrl;
    const manifest = document.createElement('input');
    manifest.type = 'hidden';
    manifest.name = 'manifest';
    manifest.value = JSON.stringify(setup.manifest);
    const state = document.createElement('input');
    state.type = 'hidden';
    state.name = 'state';
    state.value = setup.state;
    form.append(manifest, state);
    document.body.appendChild(form);
    form.submit();
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
      seedIndustries = data.seedIndustries || seedIndustries;
      railway = data.railway || railway;
      cloudflare = data.cloudflare || cloudflare;
      if (data.defaults) {
        appService = data.defaults.appService || appService;
        environment = data.defaults.environment || environment;
        installSlug = data.defaults.installSlug || installSlug;
        if (typeof data.defaults.siteDomain === 'string') siteDomain = data.defaults.siteDomain;
        postAlias = data.defaults.postAlias || postAlias;
        if (typeof data.defaults.companyName === 'string') companyName = data.defaults.companyName;
        if (typeof data.defaults.adminUsername === 'string') adminUsername = data.defaults.adminUsername;
        timezone = data.defaults.timezone || timezone;
      }
      const allowed = new Set(toggleableModules().map((m) => m.moduleId));
      selectedIds = new Set((data.defaultModuleIds || [...allowed]).filter((id) => allowed.has(id)));
      if (railway.projects?.length === 1) project = railway.projects[0].id;
      const params = new URLSearchParams(location.search);
      if (params.get('github') === 'ok') {
        githubBanner =
          'Created a restricted GitHub App for this site and applied Railway variables. Redeploy when ready.';
      } else if (params.get('github') === 'error') {
        error = params.get('message') || 'GitHub App setup failed.';
      }
      render();
      bind();
    } catch (e) {
      root.innerHTML = `<p class="dl-error">Could not load wizard: ${esc(e.message)}</p>`;
    }
  }

  void init();
})();
