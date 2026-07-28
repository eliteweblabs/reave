/**
 * newsletter panel — extracted from os-map-loader.js
 */
import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  syncSearchFieldAdornment,
  createSlidingPillSelect,
  createPanelBackBtn,
  createEditableHeaderTitleInput,
  createPaneSubheader,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  initSidebarLayout,
  syncAdminSplitView,
  scanPanelSidebars,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  paneDeleteIcon,
  paneShareIcon,
} from './admin-ui.js?v=20260728q';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=20260728q';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260728q';

/** Injected by os-map-loader via initNewsletterPanel(). */
let shell = {};

export function initNewsletterPanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:7962-8258 ----
let newsletterState = {
  enabled: false,
  automations: [],
  templates: [],
  sends: [],
  composeTemplate: '',
};

function getNewsletterEditor() {
  return document.getElementById('newsletter-editor');
}

function nlDelayLabel(mins) {
  const m = Number(mins) || 0;
  if (m === 0) return 'immediately';
  if (m % 1440 === 0) return `${m / 1440} day${m / 1440 === 1 ? '' : 's'}`;
  if (m % 60 === 0) return `${m / 60} hour${m / 60 === 1 ? '' : 's'}`;
  return `${m} min`;
}

/** Split minutes into a {value, unit} pair for the delay editor. */
function nlDelayParts(mins) {
  const m = Number(mins) || 0;
  if (m === 0) return { value: 0, unit: 'minutes' };
  if (m % 1440 === 0) return { value: m / 1440, unit: 'days' };
  if (m % 60 === 0) return { value: m / 60, unit: 'hours' };
  return { value: m, unit: 'minutes' };
}

function nlPartsToMinutes(value, unit) {
  const v = Math.max(0, Number(value) || 0);
  if (unit === 'days') return Math.round(v * 1440);
  if (unit === 'hours') return Math.round(v * 60);
  return Math.round(v);
}

async function loadNewsletterTab() {
  const root = getNewsletterEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading newsletter…</div>';
  try {
    const [aRes, tRes, sRes] = await Promise.all([
      fetch('/api/newsletter/automations', { cache: 'no-store' }),
      fetch('/api/newsletter/templates', { cache: 'no-store' }),
      fetch('/api/newsletter/sends?limit=50', { cache: 'no-store' }),
    ]);
    const a = await aRes.json();
    const t = await tRes.json();
    const s = await sRes.json();
    if (!aRes.ok) throw new Error(a.error || `HTTP ${aRes.status}`);
    newsletterState.enabled = !!a.enabled;
    newsletterState.automations = a.automations || [];
    newsletterState.templates = (t && t.templates) || [];
    newsletterState.sends = (s && s.sends) || [];
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load newsletter: ${escHtml(e.message)}</div>`;
    return;
  }
  renderNewsletterEditor();
}

function nlBroadcastTemplates() {
  const list = newsletterState.templates.filter((t) => t.kind === 'broadcast');
  return list.length ? list : newsletterState.templates;
}

function renderNewsletterEditor() {
  const root = getNewsletterEditor();
  if (!root) return;
  const { enabled, automations } = newsletterState;
  const broadcastTemplates = nlBroadcastTemplates();
  if (!newsletterState.composeTemplate && broadcastTemplates[0]) {
    newsletterState.composeTemplate = broadcastTemplates[0].id;
  }

  const statusPill = enabled
    ? '<span style="color:#4ade80">● Active</span>'
    : '<span style="color:#f87171">● Inactive</span>';

  const disabledNote = enabled
    ? ''
    : `<div class="nl-warn">Sending is off. Enable the <b>email_marketing</b> feature and set <b>RESEND_API_KEY</b> to activate. You can still configure automations and drafts below.</div>`;

  const automationRows = automations
    .map((a) => {
      const parts = nlDelayParts(a.delayMinutes);
      return `
      <div class="nl-auto-row" data-id="${escHtml(a.id)}">
        <div class="nl-auto-main">
          <label class="nl-switch">
            <input type="checkbox" class="nl-auto-enabled" ${a.enabled ? 'checked' : ''} />
            <span class="nl-switch-track"></span>
          </label>
          <div class="nl-auto-text">
            <div class="nl-auto-title">${escHtml(a.label)}</div>
            <div class="nl-auto-desc">${escHtml(a.description)}</div>
          </div>
        </div>
        <div class="nl-auto-delay">
          <span class="nl-delay-lead">Send</span>
          <input type="number" min="0" class="nl-delay-value" value="${parts.value}" />
          <select class="nl-delay-unit">
            <option value="minutes" ${parts.unit === 'minutes' ? 'selected' : ''}>min</option>
            <option value="hours" ${parts.unit === 'hours' ? 'selected' : ''}>hours</option>
            <option value="days" ${parts.unit === 'days' ? 'selected' : ''}>days</option>
          </select>
          <span class="nl-delay-lead">after ${a.trigger === 'contact_created' ? 'signup' : 'completion'}</span>
        </div>
      </div>`;
    })
    .join('');

  const templateOptions = broadcastTemplates
    .map(
      (t) =>
        `<option value="${escHtml(t.id)}" ${t.id === newsletterState.composeTemplate ? 'selected' : ''}>${escHtml(t.icon)} ${escHtml(t.label)}</option>`,
    )
    .join('');

  const sendRows = newsletterState.sends.length
    ? newsletterState.sends
        .map((s) => {
          const when = s.sentAt || s.dueAt || s.createdAt;
          const whenLabel = when ? new Date(when).toLocaleString() : '';
          const color =
            s.status === 'sent'
              ? '#4ade80'
              : s.status === 'failed'
                ? '#f87171'
                : s.status === 'skipped'
                  ? '#a1a1aa'
                  : '#c084fc';
          return `
        <div class="nl-log-row">
          <span class="nl-log-status" style="color:${color}">${escHtml(s.status)}</span>
          <span class="nl-log-to">${escHtml(s.toEmail)}</span>
          <span class="nl-log-subj">${escHtml(s.subject || s.templateId)}</span>
          <span class="nl-log-src">${escHtml(s.source)}</span>
          <span class="nl-log-when">${escHtml(whenLabel)}</span>
        </div>`;
        })
        .join('')
    : '<div class="de-empty" style="padding:0.75rem">No emails sent yet.</div>';

  root.innerHTML = `
    <div class="nl-wrap">
      <div class="nl-head">
        <div>
          <div class="nl-title">Newsletter &amp; Automation</div>
          <div class="nl-sub">Lifecycle emails + broadcasts · ${statusPill}</div>
        </div>
        <button type="button" class="nl-btn nl-refresh">Refresh</button>
      </div>
      ${disabledNote}

      <div class="nl-card">
        <div class="nl-card-title">Automations <span class="nl-card-hint">— when lifecycle emails fire</span></div>
        <div class="nl-auto-list">${automationRows || '<div class="de-empty">No automations.</div>'}</div>
      </div>

      <div class="nl-card">
        <div class="nl-card-title">Send a broadcast <span class="nl-card-hint">— one-off email to all contacts</span></div>
        <label class="nl-field"><span>Template</span>
          <select class="nl-compose-template">${templateOptions}</select>
        </label>
        <label class="nl-field"><span>Subject <em>(optional — template default used if blank)</em></span>
          <input type="text" class="nl-compose-subject" placeholder="Subject line" />
        </label>
        <label class="nl-field"><span>Heading / lead line <em>(optional)</em></span>
          <input type="text" class="nl-compose-heading" placeholder="Opening line" />
        </label>
        <label class="nl-field"><span>Body <em>(optional — blank paragraphs use template copy)</em></span>
          <textarea class="nl-compose-body" rows="5" placeholder="Write your message. Separate paragraphs with a blank line."></textarea>
        </label>
        <div class="nl-field-row">
          <label class="nl-field"><span>Button link <em>(optional)</em></span>
            <input type="text" class="nl-compose-cta-url" placeholder="https://…" />
          </label>
          <label class="nl-field"><span>Button label</span>
            <input type="text" class="nl-compose-cta-label" placeholder="Learn more" />
          </label>
        </div>
        <div class="nl-actions">
          <button type="button" class="nl-btn nl-preview">Preview</button>
          <button type="button" class="nl-btn nl-btn-primary nl-send">Send to all contacts</button>
          <span class="nl-send-status"></span>
        </div>
        <div class="nl-preview-box" style="display:none"></div>
      </div>

      <div class="nl-card">
        <div class="nl-card-title">Recent sends</div>
        <div class="nl-log">${sendRows}</div>
      </div>
    </div>`;

  wireNewsletterEditor(root);
}

function nlComposePayload(root) {
  return {
    templateId: root.querySelector('.nl-compose-template')?.value || '',
    subject: root.querySelector('.nl-compose-subject')?.value.trim() || undefined,
    heading: root.querySelector('.nl-compose-heading')?.value.trim() || undefined,
    body: root.querySelector('.nl-compose-body')?.value.trim() || undefined,
    ctaUrl: root.querySelector('.nl-compose-cta-url')?.value.trim() || undefined,
    ctaLabel: root.querySelector('.nl-compose-cta-label')?.value.trim() || undefined,
  };
}

function wireNewsletterEditor(root) {
  root.querySelector('.nl-refresh')?.addEventListener('click', () => void loadNewsletterTab());

  root.querySelector('.nl-compose-template')?.addEventListener('change', (e) => {
    newsletterState.composeTemplate = e.target.value;
  });

  // Automation autosave (enable toggle + delay).
  root.querySelectorAll('.nl-auto-row').forEach((rowEl) => {
    const id = rowEl.getAttribute('data-id');
    const saveDelay = async () => {
      const value = rowEl.querySelector('.nl-delay-value')?.value;
      const unit = rowEl.querySelector('.nl-delay-unit')?.value;
      await nlSaveAutomation(id, { delayMinutes: nlPartsToMinutes(value, unit) });
    };
    rowEl.querySelector('.nl-auto-enabled')?.addEventListener('change', async (e) => {
      await nlSaveAutomation(id, { enabled: e.target.checked });
    });
    rowEl.querySelector('.nl-delay-value')?.addEventListener('change', saveDelay);
    rowEl.querySelector('.nl-delay-unit')?.addEventListener('change', saveDelay);
  });

  root.querySelector('.nl-preview')?.addEventListener('click', async () => {
    const box = root.querySelector('.nl-preview-box');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<div class="de-loading">Rendering preview…</div>';
    try {
      const res = await fetch('/api/newsletter/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nlComposePayload(root)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const frame = document.createElement('iframe');
      frame.className = 'nl-preview-frame';
      frame.setAttribute('sandbox', '');
      box.innerHTML = `<div class="nl-preview-subj">Subject: ${escHtml(data.subject)}</div>`;
      box.appendChild(frame);
      frame.srcdoc = data.html;
    } catch (e) {
      box.innerHTML = `<div class="de-error">Preview failed: ${escHtml(e.message)}</div>`;
    }
  });

  root.querySelector('.nl-send')?.addEventListener('click', async () => {
    const statusEl = root.querySelector('.nl-send-status');
    const btn = root.querySelector('.nl-send');
    if (!confirm('Send this email to ALL contacts with an email address? This cannot be undone.')) return;
    btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Sending…';
    try {
      const res = await fetch('/api/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nlComposePayload(root), audience: 'all', sendNow: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (statusEl)
        statusEl.textContent = `Queued ${data.queued} · sent ${data.sent || 0} · skipped ${(data.skippedUnsubscribed || 0) + (data.skippedNoEmail || 0)}`;
      setTimeout(() => void loadNewsletterTab(), 800);
    } catch (e) {
      if (statusEl) statusEl.textContent = `Failed: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  });
}

async function nlSaveAutomation(id, patch) {
  try {
    const res = await fetch('/api/newsletter/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const idx = newsletterState.automations.findIndex((a) => a.id === id);
    if (idx !== -1 && data.automation) newsletterState.automations[idx] = data.automation;
  } catch (e) {
    alert(`Could not save automation: ${e.message}`);
    void loadNewsletterTab();
  }
}
export {
  newsletterState,
  loadNewsletterTab,
  getNewsletterEditor,
};
