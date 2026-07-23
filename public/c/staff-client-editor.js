/**
 * Staff-only client management on /c/<uid> — Profile, Branding, Notes, Projects, Vault.
 */

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'branding', label: 'Branding' },
  { id: 'notes', label: 'Notes' },
  { id: 'projects', label: 'Projects' },
  { id: 'vault', label: 'Vault' },
];

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(message) {
  let el = document.getElementById('portal-staff-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'portal-staff-toast';
    el.className = 'portal-staff-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('visible'), 2200);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = prev;
      }, 1200);
    }
  } catch {
    toast('Copy failed');
  }
}

async function patchClient(uid, payload) {
  const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function field(label, input) {
  const wrap = document.createElement('label');
  wrap.className = 'portal-staff-field';
  const key = document.createElement('span');
  key.className = 'portal-staff-field-label';
  key.textContent = label;
  wrap.appendChild(key);
  wrap.appendChild(input);
  return wrap;
}

function textInput(value, placeholder = '') {
  const input = document.createElement('input');
  input.className = 'portal-staff-input';
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder;
  return input;
}

function mountTabs(root, activeTab, onSelect) {
  const nav = document.createElement('div');
  nav.className = 'portal-staff-tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Manage client');
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'portal-staff-tab' + (activeTab === tab.id ? ' active' : '');
    btn.dataset.clientTab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', activeTab === tab.id ? 'true' : 'false');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => onSelect(tab.id));
    nav.appendChild(btn);
  }
  root.appendChild(nav);
  return nav;
}

function showTab(root, tabId) {
  root.querySelectorAll('.portal-staff-tab').forEach((btn) => {
    const active = btn.dataset.clientTab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  root.querySelectorAll('.portal-staff-panel').forEach((panel) => {
    panel.hidden = panel.dataset.clientTab !== tabId;
  });
}

function panel(tabId, activeTab) {
  const el = document.createElement('div');
  el.className = 'portal-staff-panel';
  el.dataset.clientTab = tabId;
  el.hidden = activeTab !== tabId;
  return el;
}

function mountProfilePanel(parent, uid, draft, onSaved) {
  const wrap = document.createElement('div');
  wrap.className = 'portal-staff-panel-inner';

  const companyInput = textInput(draft.company, 'Company name');
  const firstNameInput = textInput(draft.firstName, 'First name');
  const lastNameInput = textInput(draft.lastName, 'Last name');
  const phoneInput = textInput(draft.phone, 'Phone');
  const emailInput = textInput(draft.email, 'Email');
  emailInput.type = 'email';
  const websiteInput = textInput(draft.website, 'Website');
  websiteInput.type = 'url';
  const addressInput = textInput(draft.address, 'Street address');

  wrap.appendChild(field('Company', companyInput));
  wrap.appendChild(field('First name', firstNameInput));
  wrap.appendChild(field('Last name', lastNameInput));
  wrap.appendChild(field('Phone', phoneInput));
  wrap.appendChild(field('Email', emailInput));
  wrap.appendChild(field('Website', websiteInput));
  wrap.appendChild(field('Address', addressInput));
  parent.appendChild(wrap);

  let saveTimer = null;
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const company = companyInput.value.trim();
        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const name = [firstName, lastName].filter(Boolean).join(' ') || company;
        const body = await patchClient(uid, {
          name,
          company,
          email: emailInput.value.trim(),
          phone: phoneInput.value.trim(),
          website: websiteInput.value.trim(),
          address: addressInput.value.trim(),
        });
        onSaved(body);
        toast('Saved');
      } catch (e) {
        toast(e.message || 'Save failed');
      }
    }, 650);
  };

  for (const el of [companyInput, firstNameInput, lastNameInput, phoneInput, emailInput, websiteInput, addressInput]) {
    el.addEventListener('input', queueSave);
    el.addEventListener('blur', queueSave);
  }
}

function mountBrandingPanel(parent, uid, draft, onSaved) {
  const wrap = document.createElement('div');
  wrap.className = 'portal-staff-panel-inner portal-staff-branding';

  const logoRow = document.createElement('div');
  logoRow.className = 'portal-staff-brand-row';
  if (draft.logoUrl) {
    const img = document.createElement('img');
    img.className = 'portal-staff-brand-preview';
    img.src = draft.logoUrl;
    img.alt = 'Logo';
    logoRow.appendChild(img);
  }
  const logoInput = document.createElement('input');
  logoInput.type = 'file';
  logoInput.accept = 'image/png,image/jpeg,image/webp';
  logoInput.className = 'portal-staff-file';
  logoRow.appendChild(logoInput);
  wrap.appendChild(field('Logo', logoRow));

  const iconRow = document.createElement('div');
  iconRow.className = 'portal-staff-brand-row';
  if (draft.iconUrl) {
    const img = document.createElement('img');
    img.className = 'portal-staff-brand-preview portal-staff-brand-preview--icon';
    img.src = draft.iconUrl;
    img.alt = 'Icon';
    iconRow.appendChild(img);
  }
  const iconInput = document.createElement('input');
  iconInput.type = 'file';
  iconInput.accept = 'image/png,image/jpeg,image/webp';
  iconInput.className = 'portal-staff-file';
  iconRow.appendChild(iconInput);
  wrap.appendChild(field('Icon', iconRow));

  const hint = document.createElement('p');
  hint.className = 'portal-staff-hint';
  hint.textContent = 'PNG, JPEG, or WebP — max 2 MB each.';
  wrap.appendChild(hint);
  parent.appendChild(wrap);

  async function upload(kind, file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}/${kind}`, { method: 'POST', body: fd });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    onSaved(body);
    toast('Saved');
    return body;
  }

  logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    void upload('logo', file).then(() => location.reload());
  });
  iconInput.addEventListener('change', () => {
    const file = iconInput.files?.[0];
    if (!file) return;
    void upload('icon', file).then(() => location.reload());
  });
}

function mountNotesPanel(parent, uid, draft, onSaved) {
  const wrap = document.createElement('div');
  wrap.className = 'portal-staff-panel-inner';
  const ta = document.createElement('textarea');
  ta.className = 'portal-staff-textarea';
  ta.placeholder = 'Private notes — never shown on client portal';
  ta.value = draft.notes || '';
  wrap.appendChild(ta);
  parent.appendChild(wrap);

  ta.addEventListener('blur', async () => {
    try {
      const body = await patchClient(uid, { notes: ta.value.trim() });
      onSaved(body);
      toast('Saved');
    } catch (e) {
      toast(e.message || 'Save failed');
    }
  });
}

function mountProjectsPanel(parent, uid) {
  const wrap = document.createElement('div');
  wrap.className = 'portal-staff-panel-inner';
  wrap.innerHTML = '<div class="portal-staff-loading">Loading projects…</div>';
  parent.appendChild(wrap);

  fetch(`/api/work?contact_uid=${encodeURIComponent(uid)}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      const jobs = (data.jobs || []).filter((j) => j.status !== 'archived');
      wrap.innerHTML = '';
      if (!jobs.length) {
        wrap.innerHTML = '<p class="portal-staff-empty">No active projects for this client.</p>';
        return;
      }
      const list = document.createElement('div');
      list.className = 'portal-staff-projects';
      for (const job of jobs) {
        const card = document.createElement('a');
        card.className = 'portal-staff-project';
        card.href = `/admin/?tab=work&slug=${encodeURIComponent(job.slug)}`;
        card.textContent = job.title || job.slug;
        list.appendChild(card);
      }
      wrap.appendChild(list);
    })
    .catch(() => {
      wrap.innerHTML = '<p class="portal-staff-empty">Could not load projects.</p>';
    });
}

function mountVaultPanel(parent, uid, draft) {
  const wrap = document.createElement('div');
  wrap.className = 'portal-staff-panel-inner portal-staff-vault';
  parent.appendChild(wrap);

  let rows = (draft.data || []).map((entry) => ({ ...entry }));
  let saveTimer = null;

  const header = document.createElement('div');
  header.className = 'portal-staff-vault-head';
  const title = document.createElement('div');
  title.className = 'portal-staff-vault-title';
  title.textContent = 'Credentials & handoff data';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'portal-staff-vault-actions';
  const portalUrl = (draft.portal_url || window.location.pathname).replace(/\?.*$/, '');
  const submitUrl = `${portalUrl}?submit`;
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'portal-staff-btn portal-staff-btn--secondary';
  copyBtn.textContent = 'Copy submit link';
  copyBtn.addEventListener('click', () => void copyText(submitUrl, copyBtn));
  actions.appendChild(copyBtn);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'portal-staff-btn';
  addBtn.textContent = 'Add entry';
  actions.appendChild(addBtn);
  header.appendChild(actions);
  wrap.appendChild(header);

  const list = document.createElement('div');
  list.className = 'portal-staff-vault-list';
  wrap.appendChild(list);

  function readRows() {
    return rows
      .map((row, index) => {
        const card = list.children[index];
        if (!card) return row;
        const getVal = (field) => card.querySelector(`[data-field="${field}"]`)?.value?.trim() || '';
        const next = { label: getVal('label') };
        const value = getVal('value');
        const username = getVal('username');
        const password = getVal('password');
        const url = getVal('url');
        if (value) next.value = value;
        if (username) next.username = username;
        if (password) next.password = password;
        if (url) next.url = url;
        return next;
      })
      .filter((entry) => entry.label && (entry.value || entry.username || entry.password || entry.url));
  }

  async function saveVault() {
    rows = readRows();
    await patchClient(uid, { data: rows });
    toast('Vault saved');
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveVault().catch((e) => toast(e.message || 'Vault save failed'));
    }, 650);
  }

  function appendVaultField(card, label, fieldName, value, opts = {}) {
    const row = document.createElement('div');
    row.className = 'portal-staff-vault-row';
    const key = document.createElement('span');
    key.textContent = label;
    const input = document.createElement('input');
    input.className = 'portal-staff-input' + (opts.secret ? ' portal-staff-secret' : '');
    input.dataset.field = fieldName;
    input.value = value || '';
    input.placeholder = opts.placeholder || '';
    if (opts.type) input.type = opts.type;
    row.appendChild(key);
    row.appendChild(input);
    if (opts.secret) {
      input.classList.add('portal-staff-secret-masked');
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = 'portal-staff-btn portal-staff-btn--secondary';
      reveal.textContent = 'Show';
      reveal.addEventListener('click', () => {
        const masked = input.classList.toggle('portal-staff-secret-masked');
        reveal.textContent = masked ? 'Show' : 'Hide';
      });
      row.appendChild(reveal);
    }
    if (opts.copy) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'portal-staff-btn portal-staff-btn--secondary';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => void copyText(input.value, copy));
      row.appendChild(copy);
    }
    input.addEventListener('input', queueSave);
    input.addEventListener('blur', () => {
      void saveVault().catch((e) => toast(e.message || 'Vault save failed'));
    });
    card.appendChild(row);
    return input;
  }

  function renderList() {
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<p class="portal-staff-empty">No vault entries yet.</p>';
      return;
    }
    rows.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'portal-staff-vault-card';
      const head = document.createElement('div');
      head.className = 'portal-staff-vault-card-head';
      const cardTitle = document.createElement('div');
      cardTitle.textContent = entry.label || `Entry ${index + 1}`;
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'portal-staff-btn portal-staff-btn--secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        rows.splice(index, 1);
        rows = readRows();
        renderList();
        void saveVault().catch((e) => toast(e.message || 'Vault save failed'));
      });
      head.appendChild(cardTitle);
      head.appendChild(deleteBtn);
      card.appendChild(head);
      const labelInput = appendVaultField(card, 'Label', 'label', entry.label, { placeholder: 'e.g. WordPress admin' });
      appendVaultField(card, 'URL', 'url', entry.url, { placeholder: 'https://…', type: 'url' });
      appendVaultField(card, 'Username', 'username', entry.username, { copy: true });
      appendVaultField(card, 'Password', 'password', entry.password, { secret: true, copy: true });
      appendVaultField(card, 'Notes', 'value', entry.value, { placeholder: 'Other details' });
      labelInput.addEventListener('input', () => {
        cardTitle.textContent = labelInput.value.trim() || `Entry ${index + 1}`;
      });
      list.appendChild(card);
    });
  }

  addBtn.addEventListener('click', () => {
    rows.push({ label: '', url: '', username: '', password: '', value: '' });
    renderList();
    list.querySelector('[data-field="label"]')?.focus();
  });

  renderList();
}

async function mountPortalStaffEditor(root) {
  const uid = root.dataset.uid?.trim();
  if (!uid) return;

  root.innerHTML = '<div class="portal-staff-loading">Loading…</div>';

  let draft;
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const contact = data.contact ?? data;
    draft = {
      name: contact.name || '',
      firstName: data.firstName || contact.firstName || '',
      lastName: data.lastName || contact.lastName || '',
      email: contact.email || data.email || '',
      phone: contact.phone || data.phone || '',
      company: contact.company || data.company || '',
      website: data.website || '',
      address: data.address || '',
      notes: contact.notes || data.notes || '',
      logoUrl: data.logoUrl || '',
      iconUrl: data.iconUrl || '',
      portal_url: contact.portal_url || data.portal_url || `${window.location.origin}/c/${encodeURIComponent(uid)}`,
      data: data.data || [],
    };
  } catch (e) {
    root.innerHTML = `<div class="portal-staff-error">${escHtml(e.message || 'Failed to load')}</div>`;
    return;
  }

  let detailTab = 'profile';
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'portal-staff-head';
  head.innerHTML = `<span class="portal-staff-head-title">Manage client</span>`;
  root.appendChild(head);

  mountTabs(root, detailTab, (tabId) => {
    detailTab = tabId;
    showTab(root, tabId);
  });

  const panels = document.createElement('div');
  panels.className = 'portal-staff-panels';
  root.appendChild(panels);

  const onSaved = (body) => {
    Object.assign(draft, {
      company: body.company ?? draft.company,
      notes: body.notes ?? draft.notes,
      website: body.website ?? draft.website,
      address: body.address ?? draft.address,
      logoUrl: body.logoUrl ?? draft.logoUrl,
      iconUrl: body.iconUrl ?? draft.iconUrl,
      data: body.data ?? draft.data,
    });
  };

  const profilePanel = panel('profile', detailTab);
  mountProfilePanel(profilePanel, uid, draft, onSaved);
  panels.appendChild(profilePanel);

  const brandingPanel = panel('branding', detailTab);
  mountBrandingPanel(brandingPanel, uid, draft, onSaved);
  panels.appendChild(brandingPanel);

  const notesPanel = panel('notes', detailTab);
  mountNotesPanel(notesPanel, uid, draft, onSaved);
  panels.appendChild(notesPanel);

  const projectsPanel = panel('projects', detailTab);
  mountProjectsPanel(projectsPanel, uid);
  panels.appendChild(projectsPanel);

  const vaultPanel = panel('vault', detailTab);
  mountVaultPanel(vaultPanel, uid, draft);
  panels.appendChild(vaultPanel);
}

for (const el of document.querySelectorAll('[data-portal-staff-editor]')) {
  void mountPortalStaffEditor(el);
}
