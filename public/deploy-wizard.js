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
    courtGateMode: 'radius',
    courtRadiusMi: 60,
    courtCounties: [],
    courtStates: [],
    practiceAreas: ['bankruptcy'],
    practiceArea: 'bankruptcy',
  };
  let courtGateModes = [
    { id: 'radius', label: 'Distance from office' },
    { id: 'counties', label: 'County' },
    { id: 'state', label: 'State' },
  ];
  let usStates = [{ id: 'MA', label: 'Massachusetts' }];
  let directoryCounties = [
    'Barnstable',
    'Berkshire',
    'Bristol',
    'Dukes',
    'Essex',
    'Franklin',
    'Hampden',
    'Hampshire',
    'Middlesex',
    'Nantucket',
    'Norfolk',
    'Plymouth',
    'Suffolk',
    'Worcester',
  ];
  let practiceAreas = [
    { id: 'bankruptcy', label: 'Bankruptcy / debtor' },
    { id: 'tax', label: 'Tax controversy' },
    { id: 'foreclosure', label: 'Foreclosure / housing' },
    { id: 'general', label: 'General practice' },
  ];
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
  let project = '__new__';
  let projectName = '';
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
  let applyLog = [];
  let githubBanner = '';
  let placesTimer = 0;
  let placesSeq = 0;
  let placesHighlight = -1;

  const root = document.getElementById('deploy-wizard-app');
  if (!root) return;

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMulti(id, rows, selected) {
    const chosen = new Set((selected || []).map((v) => String(v).toLowerCase()));
    return (
      `<div class="dw-multi" id="${esc(id)}" role="group">` +
      rows
        .map((row) => {
          const value = typeof row === 'string' ? row : row.id;
          const label = typeof row === 'string' ? row : row.label;
          const on = chosen.has(String(value).toLowerCase());
          return (
            `<label class="dw-multi-opt">` +
            `<input type="checkbox" value="${esc(value)}"${on ? ' checked' : ''} />` +
            `${esc(label)}` +
            `</label>`
          );
        })
        .join('') +
      `</div>`
    );
  }

  function readChecks(id) {
    return [...root.querySelectorAll(`#${id} input:checked`)].map((el) => el.value);
  }

  function placesEls() {
    const input = root.querySelector('#dw-practice-address');
    const list = root.querySelector('#dw-practice-address-list');
    if (!(input instanceof HTMLInputElement) || !(list instanceof HTMLElement)) return null;
    return { input, list };
  }

  function hidePlacesList() {
    const els = placesEls();
    if (!els) return;
    els.list.hidden = true;
    els.list.innerHTML = '';
    els.input.setAttribute('aria-expanded', 'false');
    placesHighlight = -1;
  }

  function renderPlacesList(predictions, message) {
    const els = placesEls();
    if (!els) return;
    els.list.innerHTML = '';
    if (message) {
      const empty = document.createElement('div');
      empty.className = 'dw-places-empty';
      empty.textContent = message;
      els.list.appendChild(empty);
    } else {
      predictions.forEach((p, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dw-places-option';
        btn.setAttribute('role', 'option');
        btn.textContent = p.description;
        if (i === placesHighlight) btn.classList.add('is-active');
        btn.addEventListener('mousedown', (ev) => ev.preventDefault());
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          pickPlace(p.description);
        });
        els.list.appendChild(btn);
      });
    }
    els.list.hidden = false;
    els.input.setAttribute('aria-expanded', 'true');
  }

  function pickPlace(description) {
    const els = placesEls();
    if (!els) return;
    els.input.value = description;
    seed.practiceAddress = description;
    hidePlacesList();
  }

  async function runPlacesSearch() {
    const els = placesEls();
    if (!els) return;
    const q = els.input.value.trim();
    if (q.length < 2) {
      hidePlacesList();
      return;
    }
    const seq = ++placesSeq;
    try {
      const params = new URLSearchParams({ input: q, types: 'address' });
      const res = await fetch(`/api/google/places-autocomplete?${params}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== placesSeq || els.input.value.trim() !== q) return;
      if (!res.ok) {
        renderPlacesList([], data.errorMessage || data.error || 'Could not look up addresses.');
        return;
      }
      const predictions = Array.isArray(data.predictions) ? data.predictions : [];
      placesHighlight = predictions.length ? 0 : -1;
      renderPlacesList(predictions, predictions.length ? '' : 'No matching addresses.');
    } catch (e) {
      if (seq !== placesSeq) return;
      renderPlacesList([], e.message || 'Could not look up addresses.');
    }
  }

  function schedulePlacesSearch() {
    clearTimeout(placesTimer);
    placesTimer = setTimeout(() => {
      void runPlacesSearch();
    }, 280);
  }

  function bindPlacesAddress() {
    const els = placesEls();
    if (!els) return;
    els.input.addEventListener('input', () => {
      seed.practiceAddress = els.input.value.trim();
      placesHighlight = -1;
      schedulePlacesSearch();
    });
    els.input.addEventListener('keydown', (ev) => {
      const options = [...els.list.querySelectorAll('.dw-places-option')];
      if (ev.key === 'Escape') {
        hidePlacesList();
        return;
      }
      if (!options.length || els.list.hidden) return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        placesHighlight = (placesHighlight + 1) % options.length;
        renderPlacesList(
          options.map((btn) => ({ description: btn.textContent || '' })),
          '',
        );
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        placesHighlight = (placesHighlight - 1 + options.length) % options.length;
        renderPlacesList(
          options.map((btn) => ({ description: btn.textContent || '' })),
          '',
        );
      } else if (ev.key === 'Enter' && placesHighlight >= 0 && options[placesHighlight]) {
        ev.preventDefault();
        pickPlace(options[placesHighlight].textContent || '');
      }
    });
    els.input.addEventListener('blur', () => {
      setTimeout(hidePlacesList, 180);
    });
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
    const newSelected = project === '__new__' || !project ? ' selected' : '';
    const nameHint = projectName || companyName || installSlug || 'barry-levine';
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
      `<input id="dw-company" class="dl-input" type="text" maxlength="120" placeholder="acme co" value="${esc(companyName)}" />` +
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
        ? `<select id="dw-project" class="dl-select"><option value="__new__"${newSelected}>New project…</option>${projectOptions}</select>`
        : `<input id="dw-project" class="dl-input" type="text" placeholder="New project name" value="${esc(project === '__new__' ? '' : project)}" />`) +
      `</label>` +
      (project === '__new__' || !projectOptions
        ? `<label class="dl-field">` +
          `<span class="dl-field-label">Project name</span>` +
          `<input id="dw-project-name" class="dl-input" type="text" maxlength="64" placeholder="${esc(nameHint)}" value="${esc(projectName)}" />` +
          `</label>`
        : '') +
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
      `<p class="dl-footnote">Apply creates the Railway project (if you picked <strong>New project</strong>) and any missing services with <strong>these exact names</strong>. Postgres is the official Railway image + volume. GitHub repos connect when this host’s Railway token can see them.</p>` +
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
      `<p class="dl-footnote">Pre-fill inbox, todos, and schedule when you do not have the live account yet — pick <strong>Law firm</strong> for a practice that is not on email yet. Office address uses Google Places. Knowledge aggregation decides whether courts load by distance from that pin, by county, or by state.</p>` +
      `<div class="dw-identity">` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Industry</span>` +
      `<select id="dw-seed-industry" class="dl-select">${options}</select>` +
      `</label>` +
      `</div>` +
      (seed.industry === 'law'
        ? `<div class="dw-identity">` +
          `<label class="dl-field">` +
          `<span class="dl-field-label">Knowledge aggregation</span>` +
          `<select id="dw-court-gate" class="dl-select">` +
          courtGateModes
            .map((row) => {
              const selected = (seed.courtGateMode || 'radius') === row.id ? ' selected' : '';
              return `<option value="${esc(row.id)}"${selected}>${esc(row.label)}</option>`;
            })
            .join('') +
          `</select>` +
          `</label>` +
          `<label class="dl-field dw-places">` +
          `<span class="dl-field-label">Office address</span>` +
          `<input id="dw-practice-address" class="dl-input" type="text" maxlength="200" placeholder="Start typing an address…" value="${esc(seed.practiceAddress || '')}" autocomplete="off" autocorrect="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="dw-practice-address-list" />` +
          `<div id="dw-practice-address-list" class="dw-places-list" hidden role="listbox"></div>` +
          `</label>` +
          ((seed.courtGateMode || 'radius') === 'radius'
            ? `<label class="dl-field">` +
              `<span class="dl-field-label">Distance (miles)</span>` +
              `<input id="dw-court-radius" class="dl-input" type="number" min="10" max="250" step="5" value="${esc(String(seed.courtRadiusMi || 60))}" />` +
              `</label>`
            : '') +
          (seed.courtGateMode === 'counties'
            ? `<label class="dl-field dw-field--multi">` +
              `<span class="dl-field-label">Counties</span>` +
              renderMulti('dw-court-counties', directoryCounties, seed.courtCounties) +
              `</label>`
            : '') +
          (seed.courtGateMode === 'state'
            ? `<label class="dl-field dw-field--multi">` +
              `<span class="dl-field-label">States</span>` +
              renderMulti('dw-court-states', usStates, seed.courtStates) +
              `</label>`
            : '') +
          `<label class="dl-field dw-field--multi">` +
          `<span class="dl-field-label">Departments</span>` +
          renderMulti(
            'dw-practice-areas',
            practiceAreas,
            seed.practiceAreas?.length ? seed.practiceAreas : seed.practiceArea ? [seed.practiceArea] : ['bankruptcy'],
          ) +
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
    let html =
      `<p class="dl-footnote">Leave <code>ANTHROPIC_API_KEY</code> blank to use this host’s REΛVE key — chat will show a shared-key flag. Paste a client key to use theirs. <code>RESEND_API_KEY</code> is copied from this host on apply, which also creates the inbound domain and webhook. Everything else is copied, rolled, or created on apply. Website module: Apply creates <code>eliteweblabs/{slug}-site</code> and a restricted GitHub App for that repo only.</p>` +
      `<p class="dl-meta">${plan.referenceCount} references · ${plan.hostSecretCount || 0} from this host · ${plan.generatedCount} rolled · ${plan.variables.filter((v) => v.provisionedOnApply).length} created</p>`;
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
        ? `<p class="dl-launch-error" role="alert">${missing.length} required token${missing.length === 1 ? '' : 's'} missing (${missing.map((v) => v.name).join(', ')}). Anthropic defaults to this host’s REΛVE key. Resend is copied from this host on apply.</p>`
        : '') +
      `<label class="dl-field dw-cli-field">` +
      `<span class="dl-field-label">Railway CLI</span>` +
      `<textarea id="dw-cli" class="dl-input dw-cli" readonly rows="16">${esc(cli)}</textarea>` +
      `</label>` +
      `<div class="dl-toolbar-actions">` +
      `<button type="button" class="dl-btn dl-btn--ghost" id="dw-copy">Copy CLI</button>` +
      `<button type="button" class="dl-btn dl-btn--primary" id="dw-apply"${railway.configured && (project === '__new__' || project) && !applying ? '' : ' disabled'}>` +
      (applying
        ? 'Applying…'
        : cloudflare.configured
          ? 'Apply Railway + Cloudflare DNS'
          : 'Apply references to Railway') +
      `</button>` +
      `</div>` +
      (railway.configured
        ? `<p class="dl-meta">Apply creates the Railway project and missing services, copies host keys, rolls secrets, creates the Resend webhook, and writes variables${cloudflare.configured ? ' plus Cloudflare DNS' : ''}. Website module: GitHub will ask you to create and install a restricted App on <code>{slug}-site</code> only.</p>`
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
        : '') +
      (applying || applyLog.length
        ? `<ol class="dw-apply-log" id="dw-apply-log" aria-live="polite">${applyLog
            .map(
              (row) =>
                `<li class="dw-apply-log-item${row.tone ? ` dw-apply-log-item--${esc(row.tone)}` : ''}">${esc(row.message)}</li>`,
            )
            .join('')}</ol>`
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
    if (projectEl) project = projectEl.value.trim() || '__new__';
    const projectNameEl = root.querySelector('#dw-project-name');
    if (projectNameEl) projectName = projectNameEl.value.trim();
    if (envEl) environment = envEl.value.trim() || 'production';
    const seedEl = root.querySelector('#dw-seed-industry');
    if (seedEl) seed = { ...seed, industry: seedEl.value || 'none' };
    const addrEl = root.querySelector('#dw-practice-address');
    const radiusEl = root.querySelector('#dw-court-radius');
    const countiesEl = root.querySelector('#dw-court-counties');
    const statesEl = root.querySelector('#dw-court-states');
    const areasEl = root.querySelector('#dw-practice-areas');
    const gateEl = root.querySelector('#dw-court-gate');
    if (addrEl) seed.practiceAddress = addrEl.value.trim();
    if (gateEl) seed.courtGateMode = gateEl.value || 'radius';
    if (radiusEl) {
      const radius = Number(radiusEl.value);
      seed.courtRadiusMi = Number.isFinite(radius) && radius > 0 ? radius : 60;
    }
    if (countiesEl) seed.courtCounties = readChecks('dw-court-counties');
    if (statesEl) seed.courtStates = readChecks('dw-court-states');
    if (areasEl) {
      seed.practiceAreas = readChecks('dw-practice-areas');
      seed.practiceArea = seed.practiceAreas[0] || 'bankruptcy';
    }
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
      'COMPANY_DOMAIN',
      'VAPID_SUBJECT',
      'RESEND_FROM',
      'EMAIL_FROM_NAME',
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

  function pushApplyLog(message, tone) {
    const text = String(message || '').trim();
    if (!text) return;
    const last = applyLog[applyLog.length - 1];
    if (last && last.message === text) return;
    applyLog.push({ message: text, tone: tone || '' });
    const el = root.querySelector('#dw-apply-log');
    if (!el) return;
    const item = document.createElement('li');
    item.className = `dw-apply-log-item${tone ? ` dw-apply-log-item--${tone}` : ''}`;
    item.textContent = text;
    el.appendChild(item);
    el.scrollTop = el.scrollHeight;
  }

  function parseApplyPayload(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) return {};
    try {
      const single = JSON.parse(trimmed);
      if (single && typeof single === 'object' && !Array.isArray(single)) return single;
    } catch {
      /* NDJSON from a cached page or a proxy that rewrote Content-Type */
    }
    let last = {};
    for (const line of trimmed.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.message) {
          pushApplyLog(event.message, event.phase === 'error' ? 'error' : event.phase === 'github' ? 'next' : '');
        }
        if (event.phase === 'github' || event.phase === 'done' || event.phase === 'error' || event.ok != null) {
          last = event;
        }
      } catch {
        /* skip a partial line */
      }
    }
    return last;
  }

  async function applyPlan() {
    if (applying) return;
    readIdentity();
    readVarInputs();
    if (!project) project = '__new__';
    applying = true;
    error = '';
    applyLog = [];
    let leavingForGithub = false;
    render();
    bind();
    pushApplyLog('Apply started — this can take a minute.');
    try {
      const res = await fetch('/api/deploy/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({
          action: 'apply',
          stream: true,
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
          projectName,
          environment,
          values,
        }),
      });
      const ctype = res.headers.get('content-type') || '';
      if ((ctype.includes('ndjson') || ctype.includes('octet-stream')) && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalEvent = null;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let event;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.message) {
              pushApplyLog(event.message, event.phase === 'error' ? 'error' : event.phase === 'github' ? 'next' : '');
            }
            if (event.phase === 'github' || event.phase === 'done' || event.phase === 'error') {
              finalEvent = event;
            }
          }
        }
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            if (event.message) pushApplyLog(event.message, event.phase === 'error' ? 'error' : '');
            if (event.phase === 'github' || event.phase === 'done' || event.phase === 'error') {
              finalEvent = event;
            }
          } catch {
            /* ignore trailing partial */
          }
        }
        if (!finalEvent) throw new Error(res.ok ? 'Apply ended without a result.' : `Apply failed (${res.status})`);
        if (finalEvent.phase === 'error' || finalEvent.ok === false) {
          throw new Error(finalEvent.message || `Apply failed (${res.status})`);
        }
        if (finalEvent.needsGithubApp) {
          leavingForGithub = true;
          appliedProvisioned = finalEvent.provisioned || [];
          pushApplyLog('Sending you to GitHub to create the App. Confirm, then install it on the site repo only.');
          await new Promise((resolve) => setTimeout(resolve, 700));
          submitGithubAppManifest(finalEvent.needsGithubApp);
          return;
        }
        plan = finalEvent.plan || plan;
        cli = finalEvent.cli || cli;
        applied = finalEvent.applied || [];
        appliedDns = finalEvent.dns || null;
        appliedProvisioned = finalEvent.provisioned || [];
        return;
      }

      const raw = await res.text();
      const json = parseApplyPayload(raw);
      if (!res.ok || !json.ok) {
        throw new Error(
          json.error || json.message || (res.ok ? 'Apply did not finish.' : `Apply failed (${res.status})`),
        );
      }
      if (json.needsGithubApp) {
        leavingForGithub = true;
        (json.provisioned || []).forEach((note) => pushApplyLog(note));
        pushApplyLog('Sending you to GitHub to create the App. Confirm, then install it on the site repo only.');
        await new Promise((resolve) => setTimeout(resolve, 700));
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
      pushApplyLog(error, 'error');
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
    root.querySelector('#dw-project')?.addEventListener('change', () => {
      readIdentity();
      render();
      bind();
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
    bindPlacesAddress();
    root.querySelector('#dw-court-gate')?.addEventListener('change', () => {
      readIdentity();
      render();
      bind();
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
      if (Array.isArray(data.courtGateModes) && data.courtGateModes.length) courtGateModes = data.courtGateModes;
      if (Array.isArray(data.usStates) && data.usStates.length) usStates = data.usStates;
      if (Array.isArray(data.directoryCounties) && data.directoryCounties.length) directoryCounties = data.directoryCounties;
      if (Array.isArray(data.practiceAreas) && data.practiceAreas.length) practiceAreas = data.practiceAreas;
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
      project = '__new__';
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
