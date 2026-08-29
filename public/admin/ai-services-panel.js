/**
 * AI Services admin — platform status, Claude model default, custom registry.
 */
import { escHtml, adminFetch, mountPanelSkeleton } from './shared.js?v=20260810a';
import { iosIcon, bindConfirmDeleteButton } from './admin-ui.js?v=20260825h';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'omniroute', label: 'OmniRoute' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
  { id: 'xai', label: 'xAI' },
  { id: 'vapi', label: 'Vapi' },
  { id: 'telnyx', label: 'Telnyx' },
  { id: 'pexels', label: 'Pexels' },
  { id: 'brave', label: 'Brave' },
  { id: 'other', label: 'Other' },
];

const PURPOSES = [
  { id: 'chat', label: 'Chat / agent' },
  { id: 'voice', label: 'Voice' },
  { id: 'search', label: 'Search' },
  { id: 'images', label: 'Images' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'other', label: 'Other' },
];

function providerLabel(id) {
  return PROVIDERS.find((p) => p.id === id)?.label || id;
}

function purposeLabel(id) {
  return PURPOSES.find((p) => p.id === id)?.label || id;
}

function statusChip(status) {
  const map = {
    configured: { label: 'Connected', cls: 'ai-svc-status--ok' },
    missing: { label: 'Not configured', cls: 'ai-svc-status--warn' },
    feature_off: { label: 'Module off', cls: 'ai-svc-status--muted' },
  };
  const hit = map[status] || map.missing;
  return `<span class="ai-svc-status ${hit.cls}">${escHtml(hit.label)}</span>`;
}

function selectOptions(items, selected) {
  return items
    .map((item) => {
      const sel = item.id === selected ? ' selected' : '';
      return `<option value="${escHtml(item.id)}"${sel}>${escHtml(item.label)}</option>`;
    })
    .join('');
}

function formatBalance(balance) {
  if (!balance || balance.balanceUsd == null) return null;
  return `$${Number(balance.balanceUsd).toFixed(2)}`;
}

function renderBuiltinList(builtins) {
  if (!builtins?.length) return '<p class="prof-hint">No platform AI services.</p>';
  return (
    `<ul class="ai-svc-list">` +
    builtins
      .map((s) => {
        const manage =
          s.manageTab && s.status !== 'feature_off'
            ? `<button type="button" class="prof-btn-secondary ai-svc-manage" data-tab="${escHtml(s.manageTab)}">Manage</button>`
            : '';
        return (
          `<li class="ai-svc-row" data-builtin-id="${escHtml(s.id)}">` +
          `<div class="ai-svc-row-main">` +
          `<div class="ai-svc-row-title">${escHtml(s.name)} ${statusChip(s.status)}</div>` +
          `<div class="ai-svc-row-meta">${escHtml(purposeLabel(s.purpose))} · ${escHtml(providerLabel(s.provider))}</div>` +
          `<div class="ai-svc-row-detail">${escHtml(s.detail || '')}</div>` +
          `</div>` +
          (manage ? `<div class="ai-svc-row-actions">${manage}</div>` : '') +
          `</li>`
        );
      })
      .join('') +
    `</ul>`
  );
}

function renderCustomList(custom) {
  if (!custom?.length) {
    return '<p class="prof-hint">No custom services yet. Add ones you use outside the platform defaults.</p>';
  }
  return (
    `<ul class="ai-svc-list">` +
    custom
      .map((s) => {
        const enabledChip = s.enabled
          ? '<span class="ai-svc-status ai-svc-status--ok">Enabled</span>'
          : '<span class="ai-svc-status ai-svc-status--muted">Disabled</span>';
        const modelLine = s.model ? `<div class="ai-svc-row-detail">Model: ${escHtml(s.model)}</div>` : '';
        const notesLine = s.notes ? `<div class="ai-svc-row-detail">${escHtml(s.notes)}</div>` : '';
        return (
          `<li class="ai-svc-row" data-service-id="${escHtml(s.id)}">` +
          `<div class="ai-svc-row-main">` +
          `<div class="ai-svc-row-title">${escHtml(s.name)} ${enabledChip}</div>` +
          `<div class="ai-svc-row-meta">${escHtml(purposeLabel(s.purpose))} · ${escHtml(providerLabel(s.provider))}</div>` +
          modelLine +
          notesLine +
          `</div>` +
          `<div class="ai-svc-row-actions">` +
          `<button type="button" class="prof-btn-secondary ai-svc-toggle" data-id="${escHtml(s.id)}" data-enabled="${s.enabled ? '1' : '0'}">${s.enabled ? 'Disable' : 'Enable'}</button>` +
          `<button type="button" class="ios-icon-btn ai-svc-delete" data-id="${escHtml(s.id)}" aria-label="Delete ${escHtml(s.name)}" data-size="sm">${iosIcon('trash', 12)}</button>` +
          `</div>` +
          `</li>`
        );
      })
      .join('') +
    `</ul>`
  );
}

function profSection(title, subtitle, fieldsHtml) {
  return (
    `<section class="prof-section">` +
    `<div class="prof-section-copy">` +
    `<h2 class="prof-section-title">${escHtml(title)}</h2>` +
    (subtitle ? `<p class="prof-section-sub">${subtitle}</p>` : '') +
    `</div>` +
    `<div class="prof-section-fields">${fieldsHtml}</div>` +
    `</section>`
  );
}

export function renderAiServicesPanel(data) {
  const builtins = data.builtins || [];
  const custom = data.custom || [];
  const model = data.model || {};
  const options = Array.isArray(model.options) ? model.options : [];
  const balance = formatBalance(data.anthropicBalance);
  const keySource = data.anthropicKeySource;
  const keyHint =
    keySource === 'reave'
      ? 'Using the reΛVe-provided Anthropic key.'
      : keySource === 'client'
        ? 'Using this install’s Anthropic key.'
        : 'No Anthropic key configured.';

  const modelOptions = options
    .map((o) => {
      const sel = o.id === model.model ? ' selected' : '';
      return `<option value="${escHtml(o.id)}"${sel}>${escHtml(o.label)}</option>`;
    })
    .join('');

  return (
    `<div class="profile-panel-scroll">` +
    `<div class="prof-card">` +
    `<h1 class="prof-title">AI Services</h1>` +
    `<p class="prof-subtitle">See what’s connected on this install, set the default Claude model, and track any extra AI services you use. API keys stay in Railway env — this page does not store secrets.</p>` +
    `<div id="ai-services-alert" class="prof-alert" hidden></div>` +
    profSection(
      'Platform services',
      'Built-in integrations wired through env and modules.',
      renderBuiltinList(builtins) +
        (balance
          ? `<p class="prof-hint prof-hint--block">Anthropic credit balance: <strong>${escHtml(balance)}</strong></p>`
          : '') +
        `<p class="prof-hint prof-hint--block">${escHtml(keyHint)}</p>`,
    ) +
    `<form id="ai-services-model-form" class="prof-form">` +
    profSection(
      'Default Claude model',
      'Used for admin chat, portal help, and compose drafts. Auto routes between Haiku, Sonnet, and Opus.',
      `<div class="prof-field">` +
        `<label for="ai-svc-model">Model</label>` +
        `<select id="ai-svc-model" name="model">${modelOptions}</select>` +
        `<span class="prof-hint">Current source: ${escHtml(model.source || 'default')}${model.envModel ? ` · env ${escHtml(model.envModel)}` : ''}.</span>` +
      `</div>` +
      `<div class="prof-form-actions">` +
        `<button type="submit" class="prof-btn-secondary">Save model</button>` +
      `</div>`,
    ) +
    `</form>` +
    `<form id="ai-services-add-form" class="prof-form">` +
    profSection(
      'Your AI services',
      'Add services you use (or plan to wire) so the install has a clear inventory. Optional — does not change runtime routing yet.',
      renderCustomList(custom) +
        `<div class="prof-field-row">` +
          `<div class="prof-field"><label for="ai-svc-name">Name</label>` +
          `<input id="ai-svc-name" name="name" type="text" maxlength="120" required placeholder="e.g. Client OpenAI" /></div>` +
          `<div class="prof-field"><label for="ai-svc-provider">Provider</label>` +
          `<select id="ai-svc-provider" name="provider">${selectOptions(PROVIDERS, 'other')}</select></div>` +
        `</div>` +
        `<div class="prof-field-row">` +
          `<div class="prof-field"><label for="ai-svc-purpose">Purpose</label>` +
          `<select id="ai-svc-purpose" name="purpose">${selectOptions(PURPOSES, 'chat')}</select></div>` +
          `<div class="prof-field"><label for="ai-svc-model-id">Model id (optional)</label>` +
          `<input id="ai-svc-model-id" name="model" type="text" maxlength="120" placeholder="e.g. gpt-4.1" /></div>` +
        `</div>` +
        `<div class="prof-field"><label for="ai-svc-notes">Notes</label>` +
        `<textarea id="ai-svc-notes" name="notes" rows="2" maxlength="2000" placeholder="Where the key lives, who owns it, what it’s for…"></textarea></div>` +
        `<div class="prof-form-actions">` +
          `<button type="submit" class="prof-btn-primary">Add service</button>` +
        `</div>`,
    ) +
    `</form>` +
    `</div></div>`
  );
}

function showAlert(root, message, kind = 'error') {
  const el = root.querySelector('#ai-services-alert');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.className = `prof-alert prof-alert--${kind}`;
}

function clearAlert(root) {
  const el = root.querySelector('#ai-services-alert');
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

async function reloadPanel(deps) {
  await loadAiServicesTab(deps);
}

export function bindAiServicesPanel(root, deps = {}) {
  const { setActiveMap } = deps;

  root.querySelectorAll('.ai-svc-manage').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab && typeof setActiveMap === 'function') setActiveMap(tab, { force: true });
    });
  });

  const modelForm = root.querySelector('#ai-services-model-form');
  if (modelForm && !modelForm.dataset.bound) {
    modelForm.dataset.bound = '1';
    modelForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearAlert(root);
      const model = modelForm.querySelector('#ai-svc-model')?.value;
      try {
        const res = await adminFetch('/api/agent/model', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        showAlert(root, 'Model saved.', 'success');
        await reloadPanel(deps);
      } catch (e) {
        showAlert(root, e.message || 'Could not save model.');
      }
    });
  }

  const addForm = root.querySelector('#ai-services-add-form');
  if (addForm && !addForm.dataset.bound) {
    addForm.dataset.bound = '1';
    addForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearAlert(root);
      const fd = new FormData(addForm);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        provider: String(fd.get('provider') || 'other'),
        purpose: String(fd.get('purpose') || 'other'),
        model: String(fd.get('model') || '').trim() || null,
        notes: String(fd.get('notes') || '').trim() || null,
        enabled: true,
      };
      try {
        const res = await adminFetch('/api/admin/ai-services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        showAlert(root, 'Service added.', 'success');
        await reloadPanel(deps);
      } catch (e) {
        showAlert(root, e.message || 'Could not add service.');
      }
    });
  }

  root.querySelectorAll('.ai-svc-toggle').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      clearAlert(root);
      const id = btn.getAttribute('data-id');
      const enabled = btn.getAttribute('data-enabled') !== '1';
      try {
        const res = await adminFetch(`/api/admin/ai-services/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        await reloadPanel(deps);
      } catch (e) {
        showAlert(root, e.message || 'Could not update service.');
      }
    });
  });

  root.querySelectorAll('.ai-svc-delete').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    bindConfirmDeleteButton(btn, async () => {
      clearAlert(root);
      const id = btn.getAttribute('data-id');
      try {
        const res = await adminFetch(`/api/admin/ai-services/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
        await reloadPanel(deps);
      } catch (e) {
        showAlert(root, e.message || 'Could not delete service.');
      }
    });
  });
}

export async function loadAiServicesTab(deps = {}) {
  const { prependSettingsBackHeader, flushSettingsAutosave } = deps;
  if (typeof flushSettingsAutosave === 'function') await flushSettingsAutosave();

  const root = document.getElementById('settings-panel');
  if (!root) return;

  mountPanelSkeleton(root, 'dashboard', 'Loading AI services…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  if (typeof prependSettingsBackHeader === 'function') prependSettingsBackHeader(root);

  try {
    const res = await adminFetch('/api/admin/ai-services', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    root.innerHTML = renderAiServicesPanel(data);
    if (typeof prependSettingsBackHeader === 'function') prependSettingsBackHeader(root);
    bindAiServicesPanel(root, deps);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
      `<div class="prof-card"><h1 class="prof-title">AI Services</h1>` +
      `<p class="dash-empty">Could not load AI services: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    if (typeof prependSettingsBackHeader === 'function') prependSettingsBackHeader(root);
  }
}
