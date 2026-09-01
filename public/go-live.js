/**
 * Go-live page — registrar → Cloudflare → Railway cutover for staged installs.
 */
(function () {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const root = document.getElementById('go-live-app');
  if (!root) return;

  let projects = [];
  let capabilities = { cloudflare: false, railway: false, namecomEnv: false };
  let project = '';
  let environment = 'production';
  let domain = '';
  let registrar = 'manual';
  let namecomUsername = '';
  let namecomToken = '';
  let install = null;
  let loadingInstall = false;
  let applying = false;
  let error = '';
  let applyLog = [];
  let result = null;

  async function fetchCatalog() {
    const res = await fetch('/api/go-live');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load');
    projects = data.railway?.projects || [];
    capabilities = data.capabilities || capabilities;
    environment = data.defaults?.environment || 'production';
  }

  async function fetchInstall() {
    if (!project) {
      install = null;
      return;
    }
    loadingInstall = true;
    render();
    try {
      const res = await fetch('/api/go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'context', project, environment }),
      });
      const data = await res.json();
      if (!data.ok) {
        install = { error: data.error };
      } else {
        install = data.install;
        if (!domain && install.plannedSiteDomain) domain = install.plannedSiteDomain;
      }
    } catch (e) {
      install = { error: e instanceof Error ? e.message : String(e) };
    } finally {
      loadingInstall = false;
      render();
    }
  }

  function readForm() {
    const projectEl = root.querySelector('#gl-project');
    const domainEl = root.querySelector('#gl-domain');
    const envEl = root.querySelector('#gl-env');
    const regEl = root.querySelector('#gl-registrar');
    const userEl = root.querySelector('#gl-namecom-user');
    const tokenEl = root.querySelector('#gl-namecom-token');
    if (projectEl) project = projectEl.value.trim();
    if (domainEl) domain = domainEl.value.trim();
    if (envEl) environment = envEl.value.trim() || 'production';
    if (regEl) registrar = regEl.value === 'namecom' ? 'namecom' : 'manual';
    if (userEl) namecomUsername = userEl.value.trim();
    if (tokenEl) namecomToken = tokenEl.value.trim();
  }

  function renderCapabilities() {
    const pills = [];
    pills.push(
      capabilities.railway
        ? '<span class="mod-summary-pill">Railway connected</span>'
        : '<span class="mod-summary-pill mod-summary-pill--warn">No Railway token</span>',
    );
    pills.push(
      capabilities.cloudflare
        ? '<span class="mod-summary-pill">Cloudflare connected</span>'
        : '<span class="mod-summary-pill mod-summary-pill--warn">No Cloudflare token</span>',
    );
    if (capabilities.namecomEnv) {
      pills.push('<span class="mod-summary-pill">Name.com env fallback</span>');
    }
    return `<div class="dw-review-stats">${pills.join('')}</div>`;
  }

  function renderInstallBanner() {
    if (loadingInstall) return '<p class="dl-meta">Loading install from Railway…</p>';
    if (!project) return '';
    if (install?.error) {
      return `<p class="dl-launch-error" role="alert">${esc(install.error)}</p>`;
    }
    if (!install) return '';
    const staging = install.stagingHost
      ? `Staging on <code>${esc(install.currentSiteDomain)}</code>`
      : `Current host <code>${esc(install.currentSiteDomain || '—')}</code>`;
    const planned = install.plannedSiteDomain
      ? ` · planned apex <code>${esc(install.plannedSiteDomain)}</code>`
      : '';
    return `<p class="dl-callout">${staging}${planned} · slug <code>${esc(install.installSlug)}</code></p>`;
  }

  function renderRegistrarFields() {
    if (registrar !== 'namecom') {
      return (
        `<p class="dl-meta">GoDaddy and most registrars: after Apply, paste the Cloudflare nameservers at your registrar. Propagation can take up to 48 hours.</p>`
      );
    }
    return (
      `<label class="dl-field">` +
      `<span class="dl-field-label">Name.com username</span>` +
      `<input id="gl-namecom-user" class="dl-input" type="text" autocomplete="username" value="${esc(namecomUsername)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Name.com API token</span>` +
      `<input id="gl-namecom-token" class="dl-input" type="password" autocomplete="current-password" value="${esc(namecomToken)}" placeholder="${capabilities.namecomEnv ? 'Optional — env fallback' : 'Required'}" />` +
      `</label>`
    );
  }

  function renderResult() {
    if (!result?.ok) return '';
    const ns =
      result.nameservers?.length ?
        `<ul class="gl-ns-list">${result.nameservers.map((n) => `<li><code>${esc(n)}</code></li>`).join('')}</ul>`
      : '';
    return (
      `<div class="dl-callout" role="status">` +
      `<p><strong>Go-live queued.</strong> ${esc(result.dnsSummary || '')}</p>` +
      (result.registrarUpdated ?
        '<p>Registrar nameservers updated on Name.com.</p>'
      : ns ?
        `<p>Update nameservers at your registrar:</p>${ns}`
      : '') +
      `<p>When DNS propagates, open <a href="https://${esc(result.domain)}/" target="_blank" rel="noopener">https://${esc(result.domain)}/</a> and add the domain in Clerk.</p>` +
      `</div>`
    );
  }

  function render() {
    const projectOptions = projects
      .map((p) => {
        const sel = p.id === project ? ' selected' : '';
        return `<option value="${esc(p.id)}"${sel}>${esc(p.name)}</option>`;
      })
      .join('');

    root.innerHTML =
      `<div class="dl-panel">` +
      renderCapabilities() +
      (error ? `<p class="dl-launch-error" role="alert">${esc(error)}</p>` : '') +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Railway project</span>` +
      `<select id="gl-project" class="dl-input"${projects.length ? '' : ' disabled'}>` +
      `<option value="">Select project…</option>` +
      projectOptions +
      `</select>` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Environment</span>` +
      `<input id="gl-env" class="dl-input" type="text" value="${esc(environment)}" />` +
      `</label>` +
      renderInstallBanner() +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Client apex domain</span>` +
      `<input id="gl-domain" class="dl-input" type="text" maxlength="120" placeholder="acme.com" value="${esc(domain)}" />` +
      `</label>` +
      `<label class="dl-field">` +
      `<span class="dl-field-label">Registrar</span>` +
      `<select id="gl-registrar" class="dl-input">` +
      `<option value="manual"${registrar === 'manual' ? ' selected' : ''}>GoDaddy / manual (copy nameservers)</option>` +
      `<option value="namecom"${registrar === 'namecom' ? ' selected' : ''}>Name.com (auto nameservers)</option>` +
      `</select>` +
      `</label>` +
      renderRegistrarFields() +
      `<div class="dl-toolbar-actions">` +
      `<button type="button" class="dl-btn dl-btn--primary" id="gl-apply"${
        applying || !project || !domain || !capabilities.railway || !capabilities.cloudflare ? ' disabled' : ''
      }>${applying ? 'Going live…' : 'Go live'}</button>` +
      `<a class="dl-btn dl-btn--ghost" href="/deploy">Deploy wizard</a>` +
      `</div>` +
      renderResult() +
      (applying || applyLog.length ?
        `<ol class="dw-apply-log" aria-live="polite">${applyLog
          .map((row) => `<li class="dw-apply-log-item">${esc(row)}</li>`)
          .join('')}</ol>`
      : '') +
      `</div>`;
  }

  async function apply() {
    readForm();
    if (!project || !domain) return;
    applying = true;
    error = '';
    result = null;
    applyLog = [];
    render();

    try {
      const res = await fetch('/api/go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          stream: true,
          project,
          environment,
          domain,
          registrar,
          namecomUsername: namecomUsername || undefined,
          namecomToken: namecomToken || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          let payload;
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (payload.type === 'progress' && payload.message) {
            applyLog.push(payload.message);
            render();
          }
          if (payload.type === 'result') {
            result = payload.result;
            if (!result?.ok) error = result.error || 'Go-live failed';
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      applying = false;
      render();
    }
  }

  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    readForm();
    if (t.id === 'gl-project') fetchInstall();
    if (t.id === 'gl-registrar') render();
  });

  root.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === 'gl-apply') apply();
  });

  fetchCatalog()
    .then(() => {
      const params = new URLSearchParams(window.location.search);
      const qProject = params.get('project')?.trim();
      const qDomain = params.get('domain')?.trim();
      if (qProject) project = qProject;
      if (qDomain) domain = qDomain;
      render();
      if (project) fetchInstall();
    })
    .catch((e) => {
      error = e instanceof Error ? e.message : String(e);
      render();
    });
})();
