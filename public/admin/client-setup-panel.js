/**
 * First-run client setup wizard — device install, keys, contact import, CardDAV.
 */
import { adminFetch, readAdminJson, escHtml } from './shared.js?v=20260810a';
import {
  isStandalonePwa,
  needsPwaInstall,
  subscribeAdminPush,
} from './push-client.js?v=20260811a';

/** @type {Record<string, unknown> | null} */
let setupState = null;
/** @type {number} */
let activeStepIdx = 0;
/** @type {HTMLElement | null} */
let wizardRoot = null;

function pendingSteps(state) {
  return (state?.steps || []).filter((step) => !step.done);
}

function shouldShowWizard(state) {
  if (!state?.enabled) return false;
  if (state.finished) return false;
  if (state.dismissed) return false;
  return pendingSteps(state).length > 0;
}

async function postSetup(action, stepId = '') {
  const res = await adminFetch('/api/admin/client-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, stepId }),
  });
  const json = await readAdminJson(res, 'client-setup');
  if (!json.ok) throw new Error(json.error || 'Setup update failed');
  setupState = json;
  return json;
}

async function refreshSetupState() {
  const res = await adminFetch('/api/admin/client-setup');
  const json = await readAdminJson(res, 'client-setup');
  if (!json.ok) throw new Error(json.error || 'Setup load failed');
  setupState = json;
  return json;
}

function stepDots(steps, currentId) {
  return steps
    .map((step) => {
      const cls = step.done ? 'is-done' : step.id === currentId ? 'is-on' : '';
      return `<span class="cs-wizard-dot ${cls}" aria-hidden="true"></span>`;
    })
    .join('');
}

function renderPwaStep() {
  const installed = isStandalonePwa();
  const needsInstall = needsPwaInstall();
  return `
    <h3 class="cs-wizard-step-title">Install this device</h3>
    <p class="cs-wizard-lead">Add the admin app to your home screen or Dock so it opens like a native app. We cannot do this step remotely.</p>
    <ol>
      <li><strong>iPhone / iPad:</strong> Share → Add to Home Screen.</li>
      <li><strong>Android:</strong> Browser menu → Install app.</li>
      <li><strong>Mac / Windows:</strong> Use the install icon in the address bar when offered.</li>
    </ol>
    ${
      installed
        ? '<p class="cs-wizard-note">This browser session is already running as an installed app.</p>'
        : needsInstall
          ? '<p class="cs-wizard-note">Install before you leave — notifications on iPhone require the home-screen app.</p>'
          : '<p class="cs-wizard-note">If no install prompt appears, use your browser menu to add this site to the home screen.</p>'
    }
  `;
}

function renderOtherDevicesStep() {
  return `
    <h3 class="cs-wizard-step-title">Phone and laptop</h3>
    <p class="cs-wizard-lead">Repeat the install on every device you work from. Each device keeps its own notification permission.</p>
    <ul>
      <li>Same URL — sign in with your staff account on each device.</li>
      <li>Bookmark or install on desktop; Add to Home Screen on mobile.</li>
    </ul>
  `;
}

function renderEmailKeyStep(state) {
  const host = escHtml(state.inboundHost || 'inbound.your-domain.com');
  return `
    <h3 class="cs-wizard-step-title">Your email API key</h3>
    <p class="cs-wizard-lead">Create a Resend API key on the account that owns your domain. Paste it in Railway → this service → Variables as <code>RESEND_API_KEY</code>.</p>
    <p class="cs-wizard-note">Inbound copy arrives at <code>inbox@${host}</code>. Keep Gmail or Outlook MX — this OS receives a copy; it does not replace your mailbox.</p>
  `;
}

function renderMailProviderStep(state) {
  const host = escHtml(state.inboundHost || 'inbound.your-domain.com');
  return `
    <h3 class="cs-wizard-step-title">Google Workspace or Microsoft 365</h3>
    <p class="cs-wizard-lead">If staff already read mail in Gmail or Outlook, keep that provider. Do not point MX at Reave.</p>
    <ul>
      <li>Staff keep using <strong>@your-domain</strong> in Gmail or Outlook.</li>
      <li>Reave ingests a copy at <code>inbox@${host}</code> for triage and CRM linking.</li>
    </ul>
  `;
}

function renderCompanyStep(state) {
  return `
    <h3 class="cs-wizard-step-title">Office address</h3>
    <p class="cs-wizard-lead">Courts, bookings, and map pins need your street address. Open <strong>Account → Company</strong> after setup and fill the address field.</p>
    ${
      state.companyAddress
        ? `<p class="cs-wizard-note">Current address on file: ${escHtml(state.companyAddress)}</p>`
        : '<p class="cs-wizard-note">Only you know the correct pin — the deploy wizard cannot guess it.</p>'
    }
  `;
}

function renderPushStep() {
  return `
    <h3 class="cs-wizard-step-title">Notifications</h3>
    <p class="cs-wizard-lead">Allow alerts for inbox, bookings, and monitoring. Browsers block us from enabling this without a tap on your device.</p>
    <p class="cs-wizard-note">Use the button below, or skip and enable later from Settings.</p>
    <button type="button" class="brand-btn" data-cs-enable-push>Enable notifications</button>
    <p class="cs-wizard-push-status" data-cs-push-status hidden></p>
  `;
}

function renderContactsImportStep(state) {
  const count = Number(state.contactCount) || 0;
  if (count > 0) {
    return `
      <h3 class="cs-wizard-step-title">Import your contacts</h3>
      <p class="cs-wizard-lead">${count} contact${count === 1 ? '' : 's'} already in ${escHtml(state.brand?.name || 'this workspace')}.</p>
      <p class="cs-wizard-note">You can import more anytime from Contacts → Import, or upload another file below.</p>
    `;
  }
  return `
    <h3 class="cs-wizard-step-title">Import your contacts</h3>
    <p class="cs-wizard-lead">Bring your existing rolodex in one shot. CardDAV (next step) keeps phones in sync afterward — it does not bulk-import iCloud or Google contacts by itself.</p>
    <div class="cs-wizard-tabs" role="tablist">
      <button type="button" class="cs-wizard-tab is-on" data-cs-import-tab="upload" role="tab">Upload file</button>
      <button type="button" class="cs-wizard-tab" data-cs-import-tab="help" role="tab">How to export</button>
    </div>
    <div class="cs-wizard-pane" data-cs-import-pane="upload">
      <form class="cs-wizard-import-form" data-cs-import-form>
        <label class="cs-wizard-import-label">
          <span>CSV or vCard (.vcf)</span>
          <input type="file" name="file" accept=".csv,.vcf,.vcard" required class="cs-wizard-import-file" />
        </label>
        <button type="submit" class="brand-btn">Import now</button>
      </form>
      <p class="cs-wizard-import-status" data-cs-import-status hidden></p>
    </div>
    <div class="cs-wizard-pane" hidden data-cs-import-pane="help">
      <ul>
        <li><strong>iPhone (all contacts):</strong> icloud.com → Contacts → Select All → Export vCard.</li>
        <li><strong>Mac Contacts:</strong> File → Export → Export vCard.</li>
        <li><strong>CSV:</strong> Headers <code>name,email,phone,company,notes</code>.</li>
      </ul>
      <p class="cs-wizard-note">Need the full page? <a href="/admin/import-contacts?returnTo=${encodeURIComponent('/admin?clientSetup=1')}">Open import contacts</a>.</p>
    </div>
  `;
}

function renderCardDavStep(state) {
  const domain = escHtml(state.brand?.domain || window.location.hostname);
  const user = escHtml(state.carddavUsername || '(not set yet)');
  const configured = Boolean(state.carddavConfigured);
  return `
    <h3 class="cs-wizard-step-title">Contacts on iPhone (CardDAV)</h3>
    <p class="cs-wizard-lead">After your bulk import, add CardDAV for ongoing two-way sync — edits on your phone flow back here, and new contacts here appear on the phone.</p>
    ${
      configured
        ? `<p class="cs-wizard-note">Server credentials are set on this install. Password is in Railway Variables — never paste it in chat.</p>`
        : `<p class="cs-wizard-note">CardDAV credentials are not on this install yet. The deploy wizard sets <code>CARDDAV_USERNAME</code> and <code>CARDDAV_PASSWORD</code> when the CardDAV module is applied.</p>`
    }
    <p><strong>Settings → Contacts → Accounts → Add Account → Other → CardDAV</strong></p>
    <ul>
      <li><strong>Server:</strong> <code>${domain}</code> (hostname only)</li>
      <li><strong>User Name:</strong> <code>${user}</code></li>
      <li><strong>Password:</strong> from Railway Variables</li>
    </ul>
    <p class="cs-wizard-note"><strong>Advanced (required on iOS):</strong> SSL On · Port 443 · Path <code>/carddav</code></p>
  `;
}

function renderMapsStep() {
  return `
    <h3 class="cs-wizard-step-title">Google Maps key</h3>
    <p class="cs-wizard-lead">Reviews and address autocomplete need a Google Cloud API key. Add <code>GOOGLE_MAPS_API_KEY</code> or <code>GOOGLE_PLACES_API_KEY</code> in Railway Variables.</p>
    <p class="cs-wizard-note">Enable Places API (and Maps JavaScript API if needed) on your Google Cloud project.</p>
  `;
}

function renderStepBody(step, state) {
  switch (step.id) {
    case 'pwa':
      return renderPwaStep();
    case 'other-devices':
      return renderOtherDevicesStep();
    case 'email-key':
      return renderEmailKeyStep(state);
    case 'mail-provider':
      return renderMailProviderStep(state);
    case 'company':
      return renderCompanyStep(state);
    case 'push':
      return renderPushStep();
    case 'contacts-import':
      return renderContactsImportStep(state);
    case 'carddav':
      return renderCardDavStep(state);
    case 'maps':
      return renderMapsStep();
    default:
      return `<p class="cs-wizard-lead">${escHtml(step.summary || '')}</p>`;
  }
}

function bindStepInteractions(body, step) {
  if (step.id === 'push') {
    const btn = body.querySelector('[data-cs-enable-push]');
    const status = body.querySelector('[data-cs-push-status]');
    btn?.addEventListener('click', async () => {
      btn.disabled = true;
      if (status) {
        status.hidden = false;
        status.textContent = 'Requesting permission…';
      }
      try {
        await subscribeAdminPush();
        if (status) status.textContent = 'Notifications enabled on this device.';
      } catch (e) {
        if (status) status.textContent = e instanceof Error ? e.message : String(e);
        btn.disabled = false;
      }
    });
  }

  if (step.id === 'contacts-import') {
    body.querySelectorAll('[data-cs-import-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-cs-import-tab');
        body.querySelectorAll('[data-cs-import-tab]').forEach((t) => t.classList.toggle('is-on', t === tab));
        body.querySelectorAll('[data-cs-import-pane]').forEach((pane) => {
          pane.hidden = pane.getAttribute('data-cs-import-pane') !== key;
        });
      });
    });

    const form = body.querySelector('[data-cs-import-form]');
    const statusEl = body.querySelector('[data-cs-import-status]');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = form.querySelector('input[type="file"]');
      if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.length) return;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Importing…';
      }
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.className = 'cs-wizard-import-status cs-wizard-import-status--info';
        statusEl.textContent = 'Importing contacts…';
      }
      try {
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        fd.append('updateExisting', 'false');
        const res = await adminFetch('/api/contacts/import', { method: 'POST', body: fd });
        const result = await readAdminJson(res, 'contacts import');
        if (!result.ok) throw new Error(result.error || 'Import failed');
        const { created = 0, updated = 0, skipped = 0, errors = [] } = result.results || {};
        const okCount = created + updated;
        if (statusEl) {
          statusEl.className = 'cs-wizard-import-status cs-wizard-import-status--success';
          statusEl.textContent = `Imported ${okCount} contact${okCount === 1 ? '' : 's'} (${skipped} skipped${errors.length ? `, ${errors.length} errors` : ''}).`;
        }
        if (okCount > 0) {
          await refreshSetupState();
          renderWizard();
        }
      } catch (err) {
        if (statusEl) {
          statusEl.className = 'cs-wizard-import-status cs-wizard-import-status--error';
          statusEl.textContent = err instanceof Error ? err.message : String(err);
        }
      } finally {
        if (submitBtn instanceof HTMLButtonElement) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Import now';
        }
      }
    });
  }
}

function renderWizard() {
  if (!wizardRoot || !setupState) return;
  const steps = setupState.steps || [];
  const pending = pendingSteps(setupState);
  if (!shouldShowWizard(setupState)) {
    wizardRoot.hidden = true;
    return;
  }

  if (activeStepIdx >= pending.length) activeStepIdx = Math.max(0, pending.length - 1);
  const step = pending[activeStepIdx];
  if (!step) {
    wizardRoot.hidden = true;
    return;
  }

  wizardRoot.hidden = false;
  wizardRoot.innerHTML = `
    <div class="cs-wizard-card" role="dialog" aria-modal="true" aria-labelledby="cs-wizard-title">
      <div class="cs-wizard-head">
        <div>
          <p class="cs-wizard-kicker">First-run setup · ${escHtml(setupState.brand?.name || 'your office')}</p>
          <h2 class="cs-wizard-title" id="cs-wizard-title">${escHtml(step.title)}</h2>
        </div>
        <button type="button" class="brand-btn brand-btn-glass" data-cs-later>Later</button>
      </div>
      <div class="cs-wizard-progress" aria-hidden="true">${stepDots(steps, step.id)}</div>
      <div class="cs-wizard-body" data-cs-body></div>
      <div class="cs-wizard-foot">
        <div class="cs-wizard-foot-left">
          ${activeStepIdx > 0 ? '<button type="button" class="brand-btn brand-btn-glass" data-cs-back>Back</button>' : ''}
          ${!step.required ? '<button type="button" class="brand-btn brand-btn-glass" data-cs-skip>Skip</button>' : ''}
        </div>
        <div class="cs-wizard-foot-right">
          <button type="button" class="brand-btn" data-cs-next>${activeStepIdx >= pending.length - 1 ? 'Finish' : 'Done'}</button>
        </div>
      </div>
    </div>
  `;

  const body = wizardRoot.querySelector('[data-cs-body]');
  if (body) {
    body.innerHTML = renderStepBody(step, setupState);
    bindStepInteractions(body, step);
  }

  wizardRoot.querySelector('[data-cs-later]')?.addEventListener('click', async () => {
    await postSetup('later');
    wizardRoot.hidden = true;
  });
  wizardRoot.querySelector('[data-cs-back]')?.addEventListener('click', () => {
    activeStepIdx = Math.max(0, activeStepIdx - 1);
    renderWizard();
  });
  wizardRoot.querySelector('[data-cs-skip]')?.addEventListener('click', async () => {
    await postSetup('skip', step.id);
    activeStepIdx = 0;
    renderWizard();
  });
  wizardRoot.querySelector('[data-cs-next]')?.addEventListener('click', async () => {
    if (activeStepIdx >= pending.length - 1) {
      await postSetup('finish');
      wizardRoot.hidden = true;
      return;
    }
    await postSetup('complete', step.id);
    activeStepIdx = 0;
    renderWizard();
  });
}

function ensureWizardRoot() {
  if (wizardRoot) return wizardRoot;
  wizardRoot = document.createElement('div');
  wizardRoot.id = 'client-setup-wizard';
  wizardRoot.className = 'cs-wizard';
  wizardRoot.hidden = true;
  document.body.appendChild(wizardRoot);
  return wizardRoot;
}

/** Show first-run wizard when enabled. Safe to call on every admin boot. */
export async function mountClientSetupWizard() {
  if (!document.body?.dataset?.userId?.trim()) return;
  try {
    await refreshSetupState();
    if (!shouldShowWizard(setupState)) return;
    ensureWizardRoot();
    activeStepIdx = 0;
    renderWizard();
  } catch (e) {
    console.warn('[client-setup] could not load', e);
  }
}

/** Re-open from account menu or ?clientSetup=1 deep link. */
export async function reopenClientSetupWizard() {
  try {
    await postSetup('reopen');
    ensureWizardRoot();
    activeStepIdx = 0;
    renderWizard();
  } catch (e) {
    console.warn('[client-setup] reopen failed', e);
  }
}
