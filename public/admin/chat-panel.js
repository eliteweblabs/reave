/**
 * chat panel — extracted from os-map-loader.js
 */
import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  createSlidingPillSelect,
  createPanelBackBtn,
  createPaneSubheader,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  bindListMultiSelect,
  exitListMultiSelect,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  paneDeleteIcon,
  paneShareIcon,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  showCopyButtonFeedback,
  bindConfirmDeleteButton,
} from './admin-ui.js?v=20260805a';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, sidebarAuthorIconHtml, ensureContactAuthorIconsReady, mountPanelSkeleton } from './shared.js?v=20260803a';
import { navigateToWork, refreshWorkLinkTrackStatus, workClientSubline } from './work-panel.js?v=20260805b';
import { scheduleShareBookingUrl, formatScheduleRange } from './schedule-panel.js?v=20260728l';
import { formatPhoneInput } from './clients-panel.js?v=20260728p';
// Drag-to-reorder disabled — see todo-panel.js attachSidebarListReorder.
// import { attachSidebarListReorder, persistChatOrder } from './todo-panel.js?v=20260728l';

/** Injected by os-map-loader via initChatPanel(). */
let shell = {};

export function initChatPanel(deps) {
  shell = deps;
}

export const DEFAULT_SESSION_TITLE = 'New session';
const LEGACY_DEFAULT_SESSION_TITLE = 'New chat';

export function isDefaultSessionTitle(title) {
  const t = (title || '').trim();
  return !t || t === DEFAULT_SESSION_TITLE || t === LEGACY_DEFAULT_SESSION_TITLE;
}

export function displaySessionTitle(title) {
  return isDefaultSessionTitle(title) ? DEFAULT_SESSION_TITLE : (title || '').trim();
}

// ---- extracted from os-map-loader.js:14745-16533 ----
// ---- chats tab ----

const CHAT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const CHAT_MAX_IMAGES = 5;
const CHAT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function parseChatMsgContent(content) {
  if (typeof content !== 'string' || !content.startsWith('{"v":')) {
    return { text: content || '', images: [] };
  }
  try {
    const parsed = JSON.parse(content);
    if (parsed?.v === 1) {
      const images = Array.isArray(parsed.images)
        ? parsed.images.filter((img) => img?.mediaType && img?.data)
        : [];
      return { text: String(parsed.text ?? ''), images };
    }
  } catch (_) {}
  return { text: content, images: [] };
}

function chatMsgPlainText(content) {
  const { text, images } = parseChatMsgContent(content);
  if (images.length && !text.trim()) {
    return images.length === 1 ? '[Image]' : `[${images.length} images]`;
  }
  if (images.length && text.trim()) {
    return `${text}\n[${images.length} image${images.length === 1 ? '' : 's'} attached]`;
  }
  return text;
}

function serializeChatMsgContent(text, images) {
  if (!images?.length) return text;
  return JSON.stringify({
    v: 1,
    text,
    images: images.map(({ mediaType, data }) => ({ mediaType, data })),
  });
}

function fileToChatImage(file) {
  return new Promise((resolve, reject) => {
    if (!CHAT_IMAGE_TYPES.has(file.type)) {
      reject(new Error(`Unsupported image type: ${file.type || 'unknown'}`));
      return;
    }
    if (file.size > CHAT_MAX_IMAGE_BYTES) {
      reject(new Error('Image too large (max 5 MB)'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve({
        mediaType: file.type,
        data: comma >= 0 ? result.slice(comma + 1) : result,
        previewUrl: result,
        name: file.name || 'image',
      });
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

async function collectChatImageFiles(files) {
  const out = [];
  for (const file of files) {
    if (!file?.type?.startsWith('image/')) continue;
    try {
      out.push(await fileToChatImage(file));
    } catch (e) {
      showChatToast(e.message);
    }
  }
  return out;
}

function appendChatMessageImages(bubble, images, beforeEl) {
  if (!images.length) return;
  const gallery = document.createElement('div');
  gallery.className = 'ch-msg-images';
  for (const img of images) {
    const el = document.createElement('img');
    el.className = 'ch-msg-img';
    el.src = `data:${img.mediaType};base64,${img.data}`;
    el.alt = 'Attached image';
    el.loading = 'lazy';
    gallery.appendChild(el);
  }
  bubble.insertBefore(gallery, beforeEl);
}

let _chToastTimer = null;

function showChatToast(message, nearEl) {
  let toast = document.getElementById('ch-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ch-toast';
    toast.className = 'ch-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('ch-toast-visible');
  if (nearEl) {
    const r = nearEl.getBoundingClientRect();
    toast.classList.add('ch-toast-anchored');
    toast.style.left = `${Math.min(window.innerWidth - 120, Math.max(12, r.left))}px`;
    toast.style.top = `${Math.max(12, r.top - 36)}px`;
  } else {
    toast.classList.remove('ch-toast-anchored');
    toast.style.left = '';
    toast.style.top = '';
  }
  clearTimeout(_chToastTimer);
  _chToastTimer = setTimeout(() => toast.classList.remove('ch-toast-visible'), 1800);
}

async function copyChatText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) showCopyButtonFeedback(btn);
    else showChatToast('Copied');
    return true;
  } catch {
    showChatToast('Copy failed — check browser permissions');
    return false;
  }
}

async function shareChatText(text, role, btn) {
  const brandName = window.__companyBrand?.name || 'Assistant';
  const label = role === 'user' ? 'You' : 'Assistant';
  const payload = { text, title: `${label} — ${brandName} session` };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const ok = await copyChatText(text, btn);
  if (ok) showChatToast('Copied — paste to share');
  return ok;
}

function clientPortalShareUrl(uid, tab) {
  if (!uid) return '';
  const base = `${window.location.origin}/c/${encodeURIComponent(uid)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

async function sharePortalLink(url, title, btn) {
  if (!url) return false;
  if (navigator.share) {
    try {
      await navigator.share({ url, title: title || undefined });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const ok = await copyChatText(url, btn);
  if (ok) showChatToast('Link copied — paste to share');
  return ok;
}

async function createTrackedProjectShareUrl(jobSlug, contactUid, tab) {
  if (!jobSlug || !contactUid) return '';
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(jobSlug)}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_uid: contactUid, tab: tab || 'work', channel: 'share' }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.url || '';
  } catch (e) {
    showChatToast(e?.message || 'Could not create tracked link');
    return clientPortalShareUrl(contactUid, tab);
  }
}

function formatLinkTrackWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function dismissLinkTrackView(opts = {}) {
  const { token, jobSlug } = opts;
  if (!token || !jobSlug) return false;
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(jobSlug)}/link`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    return res.ok && data.ok;
  } catch {
    return false;
  }
}

async function dismissLinkTrackSent(opts = {}) {
  const { token, jobSlug } = opts;
  if (!token || !jobSlug) return false;
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(jobSlug)}/link`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, dismiss: 'sent' }),
    });
    const data = await res.json();
    return res.ok && data.ok;
  } catch {
    return false;
  }
}

function refreshLinkTrackStatusAfterDismiss(container, jobSlug) {
  if (jobSlug) void refreshWorkLinkTrackStatus(container, jobSlug);
  else if (container) container.hidden = true;
}

function renderLinkTrackStatus(container, links, opts = {}) {
  if (!container) return;
  container.innerHTML = '';
  const latest = Array.isArray(links) && links.length ? links[0] : null;
  if (!latest) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const sent = formatLinkTrackWhen(latest.sent_at);
  const opened = latest.first_clicked_at ? formatLinkTrackWhen(latest.first_clicked_at) : '';
  const wrap = document.createElement('span');
  wrap.className = 'wk-link-track-pill' + (opened ? ' wk-link-track-pill--viewed' : '');

  const label = document.createElement('span');
  label.className = 'wk-link-track-label';
  if (opened) {
    label.textContent = `Viewed ${opened}${latest.click_count > 1 ? ` (${latest.click_count}×)` : ''}`;
  } else {
    const sentLabel =
      latest.channel === 'sms' ? 'Text sent' : latest.channel === 'email' ? 'Email sent' : 'Link sent';
    label.textContent = sent ? `${sentLabel} ${sent} · Not opened yet` : `${sentLabel} · Not opened yet`;
  }
  wrap.appendChild(label);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'wk-link-track-dismiss';
  dismissBtn.setAttribute('aria-label', opened ? 'Dismiss viewed tag' : 'Dismiss link sent notice');
  dismissBtn.title = 'Dismiss';
  dismissBtn.textContent = '×';
  dismissBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void (async () => {
      dismissBtn.disabled = true;
      const ok = opened
        ? await dismissLinkTrackView({
            token: latest.token,
            jobSlug: opts.jobSlug,
          })
        : await dismissLinkTrackSent({
            token: latest.token,
            jobSlug: opts.jobSlug,
          });
      if (ok) {
        refreshLinkTrackStatusAfterDismiss(container, opts.jobSlug);
      } else {
        dismissBtn.disabled = false;
        showChatToast('Could not dismiss');
      }
    })();
  });
  wrap.appendChild(dismissBtn);
  container.appendChild(wrap);
}

function shareSendLogEntries(links) {
  if (!Array.isArray(links)) return [];
  return links.filter((l) => l && (l.channel === 'email' || l.channel === 'sms'));
}

function formatShareSendDest(link) {
  const dest = link.dest?.trim();
  if (!dest) return '';
  if (link.channel === 'sms') {
    try {
      return formatPhoneInput(dest);
    } catch {
      return dest;
    }
  }
  return dest;
}

function renderShareSendLog(container, links, opts = {}) {
  if (!container) return;
  container.innerHTML = '';
  const entries = shareSendLogEntries(links);
  const section = container.closest('.wk-share-log-section');
  if (!entries.length) {
    if (section) section.hidden = true;
    return;
  }
  if (section) section.hidden = false;

  for (const link of entries) {
    const row = document.createElement('div');
    row.className = 'wk-share-log-item';
    const channelLabel = link.channel === 'sms' ? 'Texted' : 'Emailed';
    const when = formatLinkTrackWhen(link.sent_at);
    const dest = formatShareSendDest(link);
    const opened = link.first_clicked_at ? formatLinkTrackWhen(link.first_clicked_at) : '';

    const main = document.createElement('span');
    main.className = 'wk-share-log-main';
    main.textContent = dest
      ? `${channelLabel} ${dest}${when ? ` · ${when}` : ''}`
      : `${channelLabel}${when ? ` · ${when}` : ''}`;

    const meta = document.createElement('span');
    meta.className = 'wk-share-log-meta' + (opened ? ' wk-share-log-meta--opened' : '');
    meta.textContent = opened
      ? `Opened ${opened}${link.click_count > 1 ? ` (${link.click_count}×)` : ''}`
      : 'Not opened yet';

    row.appendChild(main);
    row.appendChild(meta);
    container.appendChild(row);
  }
}


let _reaveShareState = null;

function closeReaveShareSheet() {
  window.IosSheet?.close('reave-share-backdrop');
  _reaveShareState = null;
  setReaveShareQr('');
}

function setReaveShareQr(qrDataUrl) {
  const wrap = document.getElementById('reave-share-qr');
  const img = document.getElementById('reave-share-qr-img');
  if (!wrap || !img) return;
  if (!qrDataUrl) {
    wrap.hidden = true;
    img.removeAttribute('src');
    return;
  }
  img.src = qrDataUrl;
  wrap.hidden = false;
}

async function resolveReaveShareQrDataUrl(opts = {}) {
  if (opts.qrDataUrl) return opts.qrDataUrl;
  if (opts.kind !== 'work' || !opts.jobSlug) return '';
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(opts.jobSlug)}`);
    const data = await res.json();
    if (res.ok && data.ok && data.qr_data_url) return data.qr_data_url;
  } catch {
    /* ignore */
  }
  return '';
}

async function loadReaveShareQr(opts = {}) {
  const qrDataUrl = await resolveReaveShareQrDataUrl(opts);
  setReaveShareQr(qrDataUrl);
}

function setReaveShareStatus(msg, kind) {
  const el = document.getElementById('reave-share-status');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'reave-share-status';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.className = `reave-share-status is-${kind || 'pending'}`;
}

function reaveShareKindLabel(kind) {
  if (kind === 'work') return 'Project link';
  if (kind === 'booking') return 'Meeting details';
  if (kind === 'document') return 'Document to sign';
  return 'Client portal link';
}

async function resolveReaveShareUrl(state) {
  if (state.url) return state.url;
  // Copy/preview/share use direct portal URLs — tracked links are created server-side
  // on send only. Views are recorded on the portal after deep-link dwell or accordion expand.
  if (state.recipient?.contactUid) {
    return clientPortalShareUrl(state.recipient.contactUid, state.tab || (state.kind === 'work' ? 'work' : undefined));
  }
  if (state.kind === 'booking') return scheduleShareBookingUrl(state.booking);
  return '';
}

async function sendViaReaveShare(channel, state) {
  setReaveShareStatus('Sending…', 'pending');
  const noteEl = document.getElementById('reave-share-note');
  const message = noteEl?.value?.trim() || undefined;
  let url;
  if (state.kind === 'document') {
    url = state.url;
  } else if (state.kind === 'booking') {
    url = state.url || scheduleShareBookingUrl(state.booking);
  } else if (!state.jobSlug && state.recipient?.contactUid) {
    url = clientPortalShareUrl(state.recipient.contactUid, state.tab);
  } else if (state.url && !state.jobSlug) {
    url = state.url;
  }
  const payload = {
    kind: state.kind === 'work' ? 'work' : state.kind,
    channel,
    recipient: state.recipient,
    message,
    url: url || undefined,
    jobSlug: state.jobSlug || undefined,
    tab: state.tab || undefined,
    booking: state.booking || undefined,
    template: state.template || undefined,
    docTitle: state.docTitle || undefined,
  };

  const buttons = document.querySelectorAll('#reave-share-actions .reave-share-btn--primary');
  buttons.forEach((b) => { b.disabled = true; });

  try {
    const res = await fetch('/api/share/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setReaveShareStatus(`Sent via ${data.channel} to ${data.dest}`, 'ok');
    if (state.jobSlug) {
      void refreshWorkLinkTrackStatus(state.trackEl, state.jobSlug, state.shareLogEl);
    }
    state.onSent?.(data);
  } catch (e) {
    setReaveShareStatus(e?.message || 'Send failed', 'err');
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function buildReaveShareActions(state, opts = {}) {
  const actionsEl = document.getElementById('reave-share-actions');
  if (!actionsEl) return;

  const recipient = state.recipient || {};
  const name = recipient.name?.trim() || 'recipient';
  const brandName = window.__companyBrand?.name || 'Assistant';
  const email = recipient.email?.trim();
  const phone = recipient.phone?.trim();
  const phoneDisplay = phone ? formatPhoneInput(phone) : '';
  const canEmail = !!email || !!recipient.contactUid || state.kind === 'booking';
  const canSms = !!phone || !!email || !!recipient.contactUid;

  actionsEl.innerHTML = '';

  const mkBtn = (label, className, onClick, disabled, hint) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `reave-share-btn ${className}`.trim();
    btn.disabled = !!disabled;
    if (hint) {
      btn.innerHTML = `${escHtml(label)}<small>${escHtml(hint)}</small>`;
    } else {
      btn.textContent = label;
    }
    btn.addEventListener('click', onClick);
    return btn;
  };

  const emailLabel = email ? `Email ${name} at ${email}` : `Email ${name}`;
  const emailHint = email ? undefined : (canEmail ? `Via ${brandName}` : 'No email on file');
  const smsLabel = phoneDisplay ? `Text ${name} at ${phoneDisplay}` : `Text ${name}`;
  const smsHint = phoneDisplay ? undefined : (canSms ? `Via ${brandName}` : 'No phone on file');

  actionsEl.appendChild(
    mkBtn(
      emailLabel,
      'reave-share-btn--primary',
      () => sendViaReaveShare('email', state),
      !canEmail,
      emailHint,
    ),
  );
  actionsEl.appendChild(
    mkBtn(
      smsLabel,
      'reave-share-btn--primary',
      () => sendViaReaveShare('sms', state),
      !canSms,
      smsHint,
    ),
  );
  actionsEl.appendChild(
    mkBtn('Preview', 'reave-share-btn--ghost', async () => {
      const url = await resolveReaveShareUrl(state);
      if (!url) return;
      const previewUrl = `${url}${url.includes('?') ? '&' : '?'}preview=1`;
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }),
  );
  actionsEl.appendChild(
    mkBtn('Copy link', 'reave-share-btn--ghost', async (e) => {
      const url = await resolveReaveShareUrl(state);
      let text = url;
      if (state.kind === 'booking' && state.booking) {
        text = [formatScheduleRange(state.booking.startTime, state.booking.endTime), url]
          .filter(Boolean)
          .join('\n');
      }
      if (text) await copyChatText(text, e.currentTarget);
    }),
  );
  if (navigator.share) {
    actionsEl.appendChild(
      mkBtn('More options…', 'reave-share-btn--ghost', async () => {
        const url = await resolveReaveShareUrl(state);
        const sharePayload = { title: opts.shareTitle || `Share with ${name}` };
        if (url) sharePayload.url = url;
        if (opts.shareText) sharePayload.text = opts.shareText;
        try {
          await navigator.share(sharePayload);
        } catch (e) {
          if (e?.name !== 'AbortError') setReaveShareStatus(e?.message || 'Share cancelled', 'err');
        }
      }),
    );
  }
}

function setReaveShareDocPickerExpanded(expanded) {
  document.getElementById('reave-share-backdrop')?.classList.toggle('reave-share--doc-picker', !!expanded);
}

function removeDocSharePicker() {
  document.getElementById('reave-share-doc-picker')?.remove();
  setReaveShareDocPickerExpanded(false);
}

async function openReaveShareSheet(opts = {}) {
  const backdrop = document.getElementById('reave-share-backdrop');
  if (!backdrop) return;

  removeDocSharePicker();
  const recipient = { ...(opts.recipient || {}) };
  if (opts.contactUid && !recipient.contactUid) recipient.contactUid = opts.contactUid;
  const name = recipient.name?.trim() || 'Guest';
  recipient.name = name;
  const kind = opts.kind || 'portal';
  const brandName = window.__companyBrand?.name || 'Assistant';

  const state = {
    kind,
    recipient,
    url: opts.url,
    jobSlug: opts.jobSlug,
    tab: opts.tab,
    booking: opts.booking,
    trackEl: opts.trackEl,
    shareLogEl: opts.shareLogEl,
    onSent: opts.onSent,
  };
  _reaveShareState = state;

  const titleEl = document.getElementById('reave-share-title');
  const subEl = document.getElementById('reave-share-sub');
  const noteEl = document.getElementById('reave-share-note');
  if (titleEl) titleEl.textContent = `Share with ${name}`;
  if (subEl) {
    subEl.textContent =
      kind === 'booking'
        ? `Send meeting details via ${brandName} — branded email or SMS, not your personal account.`
        : `Send ${reaveShareKindLabel(kind).toLowerCase()} via ${brandName}.`;
  }
  if (noteEl) noteEl.value = '';
  setReaveShareStatus('', null);
  await loadReaveShareQr({ kind, jobSlug: opts.jobSlug, qrDataUrl: opts.qrDataUrl });
  buildReaveShareActions(state, opts);

  window.IosSheet?.open('reave-share-backdrop', {
    onClose: () => { _reaveShareState = null; },
  });
}

/**
 * Document share sheet: a client-only recipient picker on top of the branded
 * share sheet. Sends the client their personalised signing link for `slug`.
 */
async function openDocumentShareSheet(opts = {}) {
  const backdrop = document.getElementById('reave-share-backdrop');
  if (!backdrop) return;
  const slug = opts.slug;
  if (!slug) return;

  const brandName = window.__companyBrand?.name || 'Assistant';
  const docTitle = opts.title || slug;

  const state = {
    kind: 'document',
    recipient: {},
    template: slug,
    docTitle,
    url: undefined,
  };
  _reaveShareState = state;

  const titleEl = document.getElementById('reave-share-title');
  const subEl = document.getElementById('reave-share-sub');
  const noteEl = document.getElementById('reave-share-note');
  const actionsEl = document.getElementById('reave-share-actions');
  if (titleEl) titleEl.textContent = `Send ${docTitle}`;
  if (subEl) {
    subEl.textContent = `Choose a client to send "${docTitle}" to. They'll get a branded ${brandName} link to review and sign — no one else.`;
  }
  if (noteEl) noteEl.value = '';
  setReaveShareStatus('', null);
  setReaveShareQr('');
  if (actionsEl) actionsEl.innerHTML = '';

  // ── Inject a clients-only recipient picker above the note field ──
  removeDocSharePicker();
  const picker = document.createElement('div');
  picker.id = 'reave-share-doc-picker';
  picker.className = 'reave-share-picker';

  const selectedRow = document.createElement('div');
  selectedRow.className = 'reave-share-picked';
  selectedRow.style.display = 'none';
  const selectedName = document.createElement('span');
  selectedName.className = 'reave-share-picked-name';
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'de-btn de-btn-ghost';
  changeBtn.textContent = 'Change';
  selectedRow.appendChild(selectedName);
  selectedRow.appendChild(changeBtn);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'reave-share-client-search';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input reave-share-client-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search Clients…';
  searchInput.autocomplete = 'off';
  const dropdown = document.createElement('div');
  dropdown.className = 'reave-share-client-list';
  dropdown.setAttribute('role', 'listbox');
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);

  picker.appendChild(selectedRow);
  picker.appendChild(searchWrap);

  const noteLabel = backdrop.querySelector('.reave-share-note-label');
  const body = backdrop.querySelector('.reave-share-body');
  if (noteLabel && noteLabel.parentNode) noteLabel.parentNode.insertBefore(picker, noteLabel);
  else if (body) body.appendChild(picker);

  const setNoteVisible = (visible) => {
    const disp = visible ? '' : 'none';
    if (noteLabel) noteLabel.style.display = disp;
    if (noteEl) noteEl.style.display = disp;
  };

  function showSearch() {
    state.recipient = {};
    state.url = undefined;
    selectedRow.style.display = 'none';
    searchWrap.style.display = 'flex';
    if (actionsEl) actionsEl.innerHTML = '';
    setNoteVisible(false);
    setReaveShareStatus('', null);
    searchInput.value = '';
    dropdown.style.display = '';
    setReaveShareDocPickerExpanded(true);
    searchInput.focus();
    scheduleDocClientSearch();
  }

  function pick(client) {
    state.recipient = {
      contactUid: client.uid,
      name: client.name || 'Client',
      email: client.email || undefined,
      phone: client.phone || undefined,
    };
    state.url = `${window.location.origin}/doc/${encodeURIComponent(client.uid)}/${encodeURIComponent(slug)}`;
    selectedName.textContent = client.name || 'Client';
    selectedRow.style.display = 'flex';
    searchWrap.style.display = 'none';
    dropdown.style.display = 'none';
    setReaveShareDocPickerExpanded(false);
    setNoteVisible(true);
    buildReaveShareActions(state, {
      shareTitle: docTitle,
      shareText: `Please review and sign: ${docTitle}`,
    });
  }

  function renderDropdown(clients) {
    dropdown.innerHTML = '';
    if (!clients.length) {
      dropdown.innerHTML = '<div class="de-empty reave-share-client-empty">No clients found</div>';
      return;
    }
    for (const c of clients) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option reave-share-client-option';
      btn.setAttribute('role', 'option');
      btn.innerHTML = `${escHtml(c.name)}<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      btn.addEventListener('click', () => pick(c));
      dropdown.appendChild(btn);
    }
  }

  let docClientSearchTimer = null;
  function scheduleDocClientSearch() {
    clearTimeout(docClientSearchTimer);
    docClientSearchTimer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
        params.set('limit', '100');
        const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        renderDropdown(data.clients || []);
      } catch (e) {
        dropdown.innerHTML = `<div class="de-empty reave-share-client-empty">${escHtml(e.message)}</div>`;
      }
    }, 250);
  }

  changeBtn.addEventListener('click', showSearch);
  searchInput.addEventListener('focus', () => scheduleDocClientSearch());
  searchInput.addEventListener('input', () => scheduleDocClientSearch());

  setNoteVisible(false);
  setReaveShareDocPickerExpanded(true);

  window.IosSheet?.open('reave-share-backdrop', {
    onClose: () => {
      _reaveShareState = null;
      clearTimeout(docClientSearchTimer);
      removeDocSharePicker();
      setNoteVisible(true);
    },
  });

  scheduleDocClientSearch();
}

function createPortalShareBtn(uid, opts = {}) {
  const { tab, title, className = 'ios-icon-btn de-share-btn', jobSlug, trackEl, shareLogEl, recipient, qrDataUrl } = opts;
  if (!uid) return null;
  return createIosIconBtn({
    iconKey: 'share',
    label: 'Share with client',
    className,
    onClick: () =>
      openReaveShareSheet({
        kind: jobSlug ? 'work' : 'portal',
        contactUid: uid,
        recipient: recipient || { contactUid: uid, name: opts.recipientName },
        tab,
        jobSlug,
        trackEl,
        shareLogEl,
        qrDataUrl,
        shareTitle: title || 'Your client page',
      }),
  });
}

function appendPortalShareBtn(parent, uid, opts = {}) {
  const btn = createPortalShareBtn(uid, opts);
  if (btn && parent) parent.appendChild(btn);
  return btn;
}

function pasteIntoChatInput(input) {
  if (!input || input.disabled) return;
  const insert = (text) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText().then(insert).catch(() => {
      showChatToast('Paste blocked — use ⌘V / Ctrl+V');
    });
  } else {
    showChatToast('Paste with ⌘V / Ctrl+V');
    input.focus();
  }
}

function insertChatDraft(input, text) {
  if (!input || input.disabled) return;
  input.value = text;
  input.selectionStart = input.selectionEnd = text.length;
  input.focus();
  showChatToast('Message loaded — edit and send');
}

function createChatMsgAction(label, iconKey, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ch-msg-action';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS[iconKey] || '';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

function bindChatMessageContextMenu(row, message, composeInput, onEdit) {
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const items = [
      { label: 'Copy', action: () => copyChatText(message.content) },
      { label: 'Share', action: () => shareChatText(message.content, message.role) },
    ];
    if (message.role === 'user' && onEdit) {
      items.push({ label: 'Edit message', action: onEdit });
    }
    if (composeInput) {
      items.push({ label: 'Paste into message', action: () => pasteIntoChatInput(composeInput) });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
}

let chatState = {
  threads: [],
  search: '',
  categoryFilter: 'all',
  listRefreshing: false,
  activeId: null,
  messages: [],
  title: '',
  linkedJobs: [],
  sending: false,
  sendAbort: null,
  pendingDraft: null,
  pendingAutoSend: false,
  disposableChatId: null,
  composeDirty: false,
  // Thread ids with an in-flight agent run (own tab + polled background runs
  // in other threads/tabs) — drives the sidebar "working…" spinner.
  runningIds: new Set(),
};

const CHAT_LAST_ACTIVE_KEY = 'chat:lastActiveId-v1';
const CHAT_LAST_SEEN_KEY = 'chat:lastSeenAt-v1';

/** Per-thread "I have seen the latest message" timestamps, keyed by thread id. */
function readChatSeenMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_LAST_SEEN_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/**
 * Marks a thread seen both locally (instant, works offline) and on the
 * server (so the unread dot agrees on every device signed in as this user —
 * without the server round trip, opening a chat on desktop would leave it
 * showing unread on the mobile app, and vice versa, since localStorage is
 * private to each browser/app instance).
 */
function markChatSeen(threadId, atIso) {
  if (!threadId) return;
  const at = atIso || new Date().toISOString();
  try {
    const map = readChatSeenMap();
    map[threadId] = at;
    localStorage.setItem(CHAT_LAST_SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
  const thread = chatState.threads.find((t) => t.id === threadId);
  if (thread) thread.last_seen_at = at;
  fetch(`/api/chats/${encodeURIComponent(threadId)}/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seenAt: at }),
  }).catch(() => {
    /* best-effort — local state above already covers this device/tab */
  });
}

/** True when a thread's latest message is an unseen assistant reply. */
function isChatUnread(t) {
  if (!t || !t.id || t.id === chatState.activeId) return false;
  if (t.last_role !== 'assistant') return false;
  const updated = Date.parse(t.updated_at || '');
  if (!Number.isFinite(updated)) return false;
  // Later of the server-synced value (agrees across devices) and this
  // device's own localStorage record (instant, no round trip needed).
  const localSeenAt = readChatSeenMap()[t.id];
  const localSeen = localSeenAt ? Date.parse(localSeenAt) : NaN;
  const serverSeen = t.last_seen_at ? Date.parse(t.last_seen_at) : NaN;
  const seen = Math.max(
    Number.isFinite(localSeen) ? localSeen : -Infinity,
    Number.isFinite(serverSeen) ? serverSeen : -Infinity,
  );
  if (!Number.isFinite(seen)) return true;
  return updated > seen;
}

const CH_SPINNER_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="42" stroke-dashoffset="15" opacity="0.9"/>' +
  '</svg>';

function readChatLastActiveId() {
  try {
    return localStorage.getItem(CHAT_LAST_ACTIVE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function rememberChatActiveId(id) {
  if (!id) return;
  try {
    localStorage.setItem(CHAT_LAST_ACTIVE_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}

function clearChatLastActiveId() {
  try {
    localStorage.removeItem(CHAT_LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function isDisposableChat(id) {
  if (!id || chatState.disposableChatId !== id) return false;
  if (chatState.messages.length > 0 || chatState.sending || chatState.composeDirty) return false;
  if (chatState.pendingDraft || chatState.pendingAutoSend) return false;
  const title =
    chatState.activeId === id
      ? chatState.title
      : chatState.threads.find((t) => t.id === id)?.title;
  return isDefaultSessionTitle(title);
}

async function abandonDisposableChat(id) {
  if (!isDisposableChat(id)) return;
  chatState.disposableChatId = null;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status !== 404) await readApiJson(res);
    chatState.threads = chatState.threads.filter((t) => t.id !== id);
    if (chatState.activeId === id) {
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      chatState.linkedJobs = [];
      chatState.composeDirty = false;
    }
  } catch {
    /* best effort */
  }
}

function sortChatThreads(threads) {
  const byUpdated = (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
  const active = threads.filter((t) => !t.archived).sort(byUpdated);
  const archived = threads.filter((t) => t.archived).sort(byUpdated);
  return [...active, ...archived];
}

async function fetchChatThreads() {
  const [activeRes, archivedRes] = await Promise.all([
    fetch('/api/chats', { cache: 'no-store' }),
    fetch('/api/chats?archived=1', { cache: 'no-store' }),
  ]);
  const activeData = await activeRes.json();
  const archivedData = await archivedRes.json();
  if (!activeRes.ok) throw new Error(activeData.error || `HTTP ${activeRes.status}`);
  if (!archivedRes.ok) throw new Error(archivedData.error || `HTTP ${archivedRes.status}`);
  const active = (activeData.threads || []).map((t) => ({ ...t, archived: false }));
  const archived = (archivedData.threads || []).map((t) => ({ ...t, archived: true }));
  return sortChatThreads([...active, ...archived]);
}

function getChatPanel() { return document.getElementById('chat-panel'); }

function formatChatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

async function loadChatsTab(opts = {}) {
  const root = getChatPanel();
  if (!root) return;
  await ensureContactAuthorIconsReady();

  // Fix #1: when returning to the Chats tab and the live React chat tree is
  // already mounted for the current thread, keep it instead of tearing it down.
  // Rebuilding the panel unmounts React, which aborts any in-flight streaming
  // agent run (the SSE fetch) — making chats appear to "die" on tab switch.
  // Only preserve when we aren't deep-linking to a different chat and there's
  // no pending draft/auto-send that needs a fresh mount to deliver.
  const mountedThreadRoot = root.querySelector('#ch-thread-root');
  const pendingDeepLink = pendingChatDeepLinkId || parseChatDeepLinkFromUrl();
  const canPreserveMounted =
    mountedThreadRoot &&
    chatState.activeId &&
    !chatState.pendingDraft &&
    !chatState.pendingAutoSend &&
    (!pendingDeepLink || pendingDeepLink === chatState.activeId);
  if (canPreserveMounted) {
    pendingChatDeepLinkId = null;
    root.classList.add('ch-pane-active');
    syncChatSidebarActiveState({ scroll: true });
    void refreshChatsListQuiet();
    return;
  }

  unmountChatThreadRoot(root);
  const keepSession = opts.keepSession === true && chatState.activeId;
  const savedActiveId = keepSession ? chatState.activeId : null;
  const savedTitle = keepSession ? chatState.title : '';
  const savedMessages = keepSession ? chatState.messages : [];
  const savedDraft = keepSession ? chatState.pendingDraft : null;
  const savedAutoSend = keepSession ? chatState.pendingAutoSend : false;
  const wasSending = chatState.sending;

  mountPanelSkeleton(root, 'list', 'Loading sessions…', { contentSelector: '.ch-sidebar' });
  try {
    chatState.threads = await fetchChatThreads();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    return;
  }

  if (savedActiveId) {
    if (!chatState.threads.some((t) => t.id === savedActiveId)) {
      chatState.threads.unshift({ id: savedActiveId, title: savedTitle || 'Session' });
    }
    chatState.pendingDraft = savedDraft;
    chatState.pendingAutoSend = savedAutoSend;
    if (wasSending) {
      chatState.sending = false;
      await openChat(savedActiveId, { force: true });
    } else {
      chatState.activeId = savedActiveId;
      chatState.title = savedTitle;
      chatState.messages = savedMessages;
      renderChatPanel();
    }
    const deepChatId = pendingChatDeepLinkId || parseChatDeepLinkFromUrl();
    pendingChatDeepLinkId = null;
    if (deepChatId && deepChatId !== savedActiveId) openChat(deepChatId).catch(() => {});
    return;
  }

  const deepChatId = pendingChatDeepLinkId || parseChatDeepLinkFromUrl();
  pendingChatDeepLinkId = null;
  const restoreId = deepChatId || chatState.activeId || readChatLastActiveId();

  if (restoreId) {
    if (chatState.activeId && chatState.activeId !== restoreId) {
      await finalizeChatTitleIfNeeded(chatState.activeId);
      await abandonDisposableChat(chatState.activeId);
    }
    if (!chatState.threads.some((t) => t.id === restoreId)) {
      clearChatLastActiveId();
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      chatState.pendingAutoSend = false;
      chatState.composeDirty = false;
      chatState.disposableChatId = null;
      chatState.sending = false;
      getChatPanel()?.classList.remove('ch-pane-active');
      renderChatPanel();
      return;
    }
    chatState.sending = false;
    await openChat(restoreId, { force: true });
    return;
  }

  if (chatState.activeId) {
    await finalizeChatTitleIfNeeded(chatState.activeId);
    await abandonDisposableChat(chatState.activeId);
  }
  chatState.activeId = null;
  chatState.messages = [];
  chatState.title = '';
  chatState.pendingAutoSend = false;
  chatState.composeDirty = false;
  chatState.disposableChatId = null;
  chatState.sending = false;
  getChatPanel()?.classList.remove('ch-pane-active');
  renderChatPanel();
}

function formatLinkedJobsSub(jobs) {
  if (!jobs?.length) return '';
  return jobs.length === 1 ? jobs[0].title || jobs[0].slug : `${jobs.length} projects`;
}

function createSidebarChatTitle(title) {
  const titleEl = document.createElement('span');
  titleEl.className = 'ch-item-title';
  titleEl.textContent = title;
  return titleEl;
}

function syncSidebarChatTitle(threadId, title) {
  const el = getChatPanel()?.querySelector(
    `.ch-list-item[data-id="${CSS.escape(threadId)}"] .ch-item-title`,
  );
  if (el) el.textContent = title;
}

async function saveChatTitle(threadId, title) {
  const trimmed = (title || '').trim();
  if (!trimmed || !threadId) return false;
  const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: trimmed }),
  });
  await readApiJson(res);
  chatState.title = trimmed;
  const thread = chatState.threads.find((t) => t.id === threadId);
  if (thread) thread.title = trimmed;
  syncSidebarChatTitle(threadId, trimmed);
  return true;
}

function applyFinalizedChatTitle(threadId, title) {
  if (!threadId || !title || isDefaultSessionTitle(title)) return;
  if (chatState.activeId === threadId) chatState.title = title;
  const thread = chatState.threads.find((t) => t.id === threadId);
  if (thread) thread.title = title;
  syncSidebarChatTitle(threadId, title);
  if (chatState.activeId === threadId) syncChatPaneHeaderTitle(title);
  if (chatState.disposableChatId === threadId) chatState.disposableChatId = null;
}

/** Auto-title sessions still named "New session" from their first message (best effort). */
async function finalizeChatTitleIfNeeded(threadId) {
  if (!threadId) return;
  const title =
    chatState.activeId === threadId
      ? chatState.title
      : chatState.threads.find((t) => t.id === threadId)?.title;
  if (title?.trim() && !isDefaultSessionTitle(title)) return;
  if (chatState.activeId === threadId && !chatState.messages.length) return;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalizeTitle: true }),
    });
    const data = await readApiJson(res);
    if (data.title) applyFinalizedChatTitle(threadId, data.title);
  } catch {
    /* best effort */
  }
}

function startChatTitleEdit(titleEl, threadId, originalTitle) {
  if (!titleEl || titleEl.dataset.editing === '1') return;
  const wrap = titleEl.closest('.de-header-title-field');
  const prior = displaySessionTitle(originalTitle || titleEl.textContent);
  titleEl.dataset.editing = '1';
  if (wrap) wrap.classList.add('de-header-title-field--editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'de-doc-name de-header-title-input ch-header-title-input';
  input.value = prior;
  input.setAttribute('aria-label', 'Session title');

  const finish = async (save) => {
    titleEl.dataset.editing = '0';
    if (wrap) wrap.classList.remove('de-header-title-field--editing');
    const next = (input.value || '').trim() || prior;
    if (save && next !== prior) {
      try {
        await saveChatTitle(threadId, next);
        titleEl.textContent = next;
      } catch (e) {
        titleEl.textContent = prior;
        shell.osAlert({ title: 'Rename failed', bodyHtml: escHtml(e.message) });
      }
    } else {
      titleEl.textContent = prior;
    }
    input.remove();
    titleEl.hidden = false;
  };

  titleEl.hidden = true;
  (wrap || titleEl.parentElement).appendChild(input);
  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void finish(true);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      void finish(false);
    }
  });
  input.addEventListener('blur', () => void finish(true));
}

function createHeaderChatTitle(threadId, title) {
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name ch-header-title';
  titleEl.textContent = displaySessionTitle(title);
  const start = () => startChatTitleEdit(titleEl, threadId, titleEl.textContent);
  return wrapEditableHeaderTitle(titleEl, {
    clickable: true,
    onActivate: start,
    hint: 'Click to rename',
    ariaLabel: 'Rename session',
  });
}

function syncChatPaneHeaderTitle(title) {
  const titleEl = getChatPanel()?.querySelector('.ch-pane-header .ch-header-title');
  if (!(titleEl instanceof HTMLElement) || titleEl.dataset.editing === '1') return;
  titleEl.textContent = displaySessionTitle(title);
}

function syncChatSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getChatPanel();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.id === chatState.activeId;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
      activeEl = el;
    } else {
      el.removeAttribute('aria-current');
    }
  });
  if (scroll && activeEl) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list) {
      requestAnimationFrame(() => shell.scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

function createChatListItem(t) {
  const isActive = t.id === chatState.activeId;
  const isRunning = chatState.runningIds.has(t.id);
  const isUnread = isChatUnread(t);
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'ch-list-item' +
    (isActive ? ' active' : '') +
    (t.archived ? ' ch-list-item--archived' : '') +
    (isRunning ? ' ch-list-item--running' : '') +
    (isUnread ? ' ch-list-item--unread' : '');
  item.dataset.id = t.id;
  if (isActive) item.setAttribute('aria-current', 'page');
  const archivedIcon = t.archived
    ? `<span class="ch-item-archived-icon" title="Archived" aria-label="Archived">${shell.navIcon('archive', 13)}</span>`
    : '';
  const linkedSub = formatLinkedJobsSub(t.linked_jobs);
  const subLine = linkedSub
    ? `<span class="ch-item-sub project-link-sub">${escHtml(linkedSub)}</span>`
    : '';
  // One absolutely-positioned slot shared by both indicators (no reflow ever,
  // no extra placeholder in the row) — CSS shows the spinner when
  // ch-list-item--running is set, otherwise the dot when --unread is set.
  const statusIndicator =
    `<span class="ch-item-status" aria-hidden="true">` +
      `<span class="ch-item-status-spinner">${CH_SPINNER_SVG}</span>` +
      `<span class="ch-item-status-dot"></span>` +
    `</span>`;
  item.innerHTML =
    sidebarAuthorIconHtml({ contactUid: t.contact_uid, iconUrl: t.author_icon_url }) +
    statusIndicator +
    `<span class="ch-list-content">` +
      `<span class="ch-item-row">` +
        archivedIcon +
        `<span class="ch-item-title">${escHtml(displaySessionTitle(t.title))}</span>` +
      `</span>` +
      subLine +
      `<span class="ch-item-date ch-item-date--bottom">${escHtml(formatChatDate(t.updated_at))}</span>` +
    `</span>`;
  item.addEventListener('click', () => {
    if (t.id === chatState.activeId) return;
    void openChat(t.id);
  });
  return item;
}

/**
 * Patch running state directly on existing sidebar DOM nodes (called on
 * every running-poll tick) instead of rebuilding the whole list — just a
 * class toggle on the item, so it can't reflow or "jump" the row.
 */
function applyChatRunningIndicators() {
  const root = getChatPanel();
  if (!root) return;
  root.querySelectorAll('.ch-sidebar .ch-list-item[data-id]').forEach((el) => {
    el.classList.toggle('ch-list-item--running', chatState.runningIds.has(el.dataset.id));
  });
  updateChatFilterTabCounts(root);
}

function createChatSwipeRow(t) {
  return createSwipeRow(createChatListItem(t), [
    swipeArchiveAction({
      label: t.archived ? 'Unarchive' : 'Archive',
      onClick: () => archiveChat(t),
    }),
    swipeDeleteAction({
      onClick: () => deleteChat(t.id),
    }),
  ]);
}

function isChatProject(t) {
  return Boolean(t?.linked_jobs?.length);
}

function chatThreadsForCategoryFilter(threads = chatState.threads) {
  const f = chatState.categoryFilter;
  if (f === 'archive') return threads.filter((t) => t.archived);
  if (f === 'review') return threads.filter((t) => !t.archived && isChatUnread(t));
  if (f === 'working') return threads.filter((t) => chatState.runningIds.has(t.id));
  if (f === 'project') return threads.filter((t) => isChatProject(t));
  return threads.filter((t) => !t.archived);
}

function chatTabCounts() {
  const all = chatState.threads;
  return {
    all: all.filter((t) => !t.archived).length,
    review: all.filter((t) => !t.archived && isChatUnread(t)).length,
    working: all.filter((t) => chatState.runningIds.has(t.id)).length,
    project: all.filter((t) => isChatProject(t)).length,
    archive: all.filter((t) => t.archived).length,
  };
}

function chatCountForActiveTab() {
  return chatThreadsForCategoryFilter().length;
}

function chatSearchPlaceholder(count) {
  const n = Number.isFinite(count) ? count : chatCountForActiveTab();
  return `Search ${n} ${n === 1 ? 'Session' : 'Sessions'}`;
}

function chatSidebarEmptyText() {
  if (chatState.search.trim()) return 'No matches.';
  const labels = {
    all: 'No sessions yet.',
    review: 'No sessions to review.',
    working: 'No sessions in progress.',
    project: 'No project sessions.',
    archive: 'No archived sessions.',
  };
  return labels[chatState.categoryFilter] || labels.all;
}

function switchChatCategoryFilter(id) {
  if (chatState.categoryFilter === id) return;
  chatState.categoryFilter = id;
  const visible = chatThreadsForCategoryFilter().filter((t) =>
    matchesListSearch(chatState.search, t.title, t.id),
  );
  const clearedActive = chatState.activeId && !visible.some((t) => t.id === chatState.activeId);
  if (clearedActive) {
    chatState.activeId = null;
    chatState.messages = [];
    chatState.title = '';
    clearChatLastActiveId();
    getChatPanel()?.classList.remove('ch-pane-active');
    renderChatPanel();
    return;
  }
  refreshChatSidebarList();
}

async function bulkDeleteChatCategory(tab) {
  closeOpenSwipeRow();
  const threads = chatThreadsForCategoryFilter();
  if (threads.length === 0 || tab.id === 'all') return;
  await bulkDeleteChats(threads.map((t) => t.id));
}

function renderChatFilterTabs(savedScrollLeft = 0) {
  const counts = chatTabCounts();
  const nav = document.createElement('div');
  nav.className = 'em-filter-tabs em-filter-tabs--scroll';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Session filters');

  const tabs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'review', label: 'Review', count: counts.review },
    { id: 'working', label: 'Working', count: counts.working },
    { id: 'project', label: 'Project', count: counts.project },
    { id: 'archive', label: 'Archive', count: counts.archive },
  ];

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = chatState.categoryFilter === tab.id;
    const canBulkDelete = isActive && tab.id !== 'all' && tab.count > 0;
    const isAllRefresh = isActive && tab.id === 'all';
    btn.className =
      'em-filter-tab' +
      (isActive ? ' active' : '') +
      (canBulkDelete ? ' em-filter-tab--purge' : '') +
      (isAllRefresh ? ' em-filter-tab--refresh' : '') +
      (isAllRefresh && chatState.listRefreshing ? ' em-filter-tab--refreshing' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.dataset.filter = tab.id;

    if (canBulkDelete) {
      btn.innerHTML =
        `<span class="em-filter-tab-label">${escHtml(tab.label)}</span>` +
        `<span class="em-filter-purge-icon">${IOS_ICONS.trash}</span>`;
      btn.setAttribute('aria-label', `Delete all ${tab.label.toLowerCase()} sessions`);
      btn.title = `Delete all ${tab.label.toLowerCase()} sessions`;
      bindConfirmDeleteButton(btn, () => bulkDeleteChatCategory(tab), { ringSize: 44 });
    } else if (isAllRefresh) {
      btn.innerHTML =
        `<span class="em-filter-tab-label">${escHtml(tab.label)}</span>` +
        `<span class="em-filter-refresh-icon">${IOS_ICONS.refresh}</span>`;
      btn.setAttribute('aria-label', 'Refresh sessions');
      btn.title = 'Refresh sessions';
      btn.addEventListener('click', () => {
        if (chatState.listRefreshing) return;
        chatState.listRefreshing = true;
        refreshChatFilterTabsUi();
        void refreshChatsListQuiet().finally(() => {
          chatState.listRefreshing = false;
          refreshChatFilterTabsUi();
        });
      });
    } else {
      btn.innerHTML = `${escHtml(tab.label)} <span class="em-filter-count">${tab.count}</span>`;
      btn.addEventListener('click', () => switchChatCategoryFilter(tab.id));
    }

    nav.appendChild(btn);
  }

  shell.mountFilterTabsScroll?.(nav, savedScrollLeft);
  return nav;
}

function updateChatFilterTabCounts(root) {
  const counts = chatTabCounts();
  root.querySelectorAll('.em-filter-tab[data-filter]').forEach((btn) => {
    const id = btn.dataset.filter;
    if (!id) return;
    if (id === 'all' && chatState.categoryFilter === 'all') return;
    const countEl = btn.querySelector('.em-filter-count');
    if (!countEl) return;
    countEl.textContent = String(counts[id] ?? 0);
  });
}

function refreshChatFilterTabsUi() {
  const root = getChatPanel();
  const tabs = root?.querySelector('.em-filter-tabs');
  if (tabs) tabs.replaceWith(renderChatFilterTabs(tabs.scrollLeft));
}

function visibleChatThreads() {
  return chatThreadsForCategoryFilter().filter((t) =>
    matchesListSearch(chatState.search, t.title, t.id),
  );
}

function fillChatSidebarList(list) {
  exitListMultiSelect(list);
  const target = pullRefreshContentRoot(list);
  const visibleThreads = visibleChatThreads();
  target.innerHTML = '';
  for (const t of visibleThreads) {
    target.appendChild(createChatSwipeRow(t));
  }
  if (visibleThreads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = chatSidebarEmptyText();
    target.appendChild(empty);
  }
  // Drag-to-reorder disabled — re-enable via attachSidebarListReorder in todo-panel.js.
  // else if (!chatState.search.trim()) {
  //   attachSidebarListReorder(list, visibleThreads.map((t) => t.id), persistChatOrder);
  // }
}

async function refreshChatsListQuiet() {
  try {
    chatState.threads = await fetchChatThreads();
    refreshChatSidebarList();
  } catch {
    /* keep current list on refresh failure */
  }
}

let chatRunningPollTimer = null;

/**
 * Poll which threads currently have an in-flight agent run (cheap, in-memory
 * endpoint) so the sidebar spinner stays live even for runs happening in
 * another thread — including ones that keep going in the background after a
 * dropped connection. When a run we were tracking disappears, also refresh
 * the full thread list so title/updated_at/last_role catch up (which is what
 * lights up the "unread" dot once a background report finishes).
 */
async function refreshChatRunningIndicatorsQuiet() {
  try {
    const res = await fetch('/api/chats/running', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const nextIds = new Set(Array.isArray(data.running) ? data.running : []);
    let justFinished = false;
    chatState.runningIds.forEach((id) => {
      if (!nextIds.has(id)) justFinished = true;
    });
    chatState.runningIds = nextIds;
    applyChatRunningIndicators();
    if (justFinished) void refreshChatsListQuiet();
  } catch {
    /* ignore transient poll errors */
  }
}

function stopChatRunningPoll() {
  if (chatRunningPollTimer) {
    clearInterval(chatRunningPollTimer);
    chatRunningPollTimer = null;
  }
}

function syncChatRunningPoll() {
  stopChatRunningPoll();
  if (shell.MAP.type === 'chats' && !document.hidden) {
    void refreshChatRunningIndicatorsQuiet();
    chatRunningPollTimer = setInterval(refreshChatRunningIndicatorsQuiet, 3000);
  }
}

function refreshChatSidebarList() {
  const root = getChatPanel();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderChatPanel();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    searchInput.placeholder = chatSearchPlaceholder(chatCountForActiveTab());
  }
  refreshChatFilterTabsUi();
  fillChatSidebarList(list);
}

function renderChatSidebar(savedFilterScroll = 0) {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const countForTab = chatCountForActiveTab();
  const subheader = listSearchSubheader({
    itemCount: countForTab,
    search: {
      value: chatState.search,
      placeholder: chatSearchPlaceholder(countForTab),
      onInput: (value) => {
        chatState.search = value;
        refreshChatSidebarList();
      },
    },
    below: renderChatFilterTabs(savedFilterScroll),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, {
    onBulkArchive: bulkArchiveChats,
    onBulkDelete: bulkDeleteChats,
  });
  fillChatSidebarList(list);
  attachIosPullToRefresh(list, () => {
    if (shell.MAP.type !== 'chats') return;
    return refreshChatsListQuiet();
  });
  sidebar.appendChild(list);
  return sidebar;
}

function renderChatMessages(container, composeInput) {
  container.innerHTML = '';
  if (chatState.messages.length === 0 && !chatState.sending) {
    const ph = document.createElement('div');
    ph.className = 'de-placeholder';
    ph.innerHTML = shell.placeholderHtml('agent', 'Send a message to start.');
    container.appendChild(ph);
    return;
  }
  for (const m of chatState.messages) {
    const row = document.createElement('div');
    row.className = 'ch-msg-row ' + (m.role === 'user' ? 'ch-msg-row-user' : 'ch-msg-row-assistant');

    const bubble = document.createElement('div');
    bubble.className = 'ch-msg ' + (m.role === 'user' ? 'ch-msg-user' : 'ch-msg-assistant');

    const parsed = parseChatMsgContent(m.content);
    const plainText = chatMsgPlainText(m.content);

    const body = document.createElement('div');
    body.className = 'ch-msg-body';
    if (parsed.text) body.textContent = parsed.text;
    appendChatMessageImages(bubble, parsed.images, body);
    if (!parsed.text && parsed.images.length) body.hidden = true;
    bubble.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'ch-msg-actions';
    if (m.role !== 'user') {
      actions.appendChild(
        createChatMsgAction('Copy', 'copy', (btn) => copyChatText(plainText, btn)),
      );
      actions.appendChild(
        createChatMsgAction('Share', 'share', (btn) => shareChatText(plainText, m.role, btn)),
      );
      bubble.appendChild(actions);
    }
    row.appendChild(bubble);

    if (m.role !== 'user') {
      bindChatMessageContextMenu(row, { ...m, content: plainText }, composeInput, null);
    }

    container.appendChild(row);
  }
  if (chatState.sending) {
    const thinking = document.createElement('div');
    thinking.className = 'ch-thinking';
    thinking.textContent = 'Thinking…';
    container.appendChild(thinking);
  }
  const bottom = document.createElement('div');
  bottom.className = 'ch-scroll-anchor';
  bottom.setAttribute('aria-hidden', 'true');
  container.appendChild(bottom);
  scrollChatToBottom(container);
}

function scrollChatToBottom(container, smooth = true) {
  if (!container) return;
  const run = () => {
    const anchor = container.querySelector('.ch-scroll-anchor');
    if (anchor) {
      anchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function getAgentModelForChat() {
  return shell.agentModelState.model || undefined;
}

async function refreshChatLinkedJobs() {
  if (!chatState.activeId) return;
  try {
    const linkRes = await fetch(`/api/chats/${encodeURIComponent(chatState.activeId)}`, {
      cache: 'no-store',
    });
    const linkData = await readApiJson(linkRes);
    chatState.linkedJobs = linkData.thread?.linked_jobs || [];
    const thread = chatState.threads.find((t) => t.id === chatState.activeId);
    if (thread) thread.linked_jobs = chatState.linkedJobs;
  } catch {
    /* ignore */
  }
}

function unmountChatThreadRoot(root) {
  const host = root?.querySelector('#ch-thread-root');
  if (host) window.__reaveAgentChat?.unmount(host);
}

function mountChatThreadRoot(threadHost) {
  const chatApi = window.__reaveAgentChat;
  if (!chatApi) {
    threadHost.innerHTML =
      '<div class="de-loading de-error">Session UI failed to load. Hard-refresh the page.</div>';
    return;
  }
  const pendingDraft = chatState.pendingDraft;
  const pendingAutoSend = chatState.pendingAutoSend;
  chatState.pendingDraft = null;
  chatState.pendingAutoSend = false;
  chatApi.mount(threadHost, {
    threadId: chatState.activeId,
    companyName: window.__companyBrand?.name || 'Assistant',
    initialMessages: chatState.messages,
    pendingDraft,
    pendingAutoSend,
    getModel: getAgentModelForChat,
    onComposeFocus: (focused) => shell.setChatComposeFocused(focused),
    onComposeDirty: (dirty) => {
      chatState.composeDirty = dirty;
      if (dirty && chatState.activeId === chatState.disposableChatId) {
        chatState.disposableChatId = null;
      }
    },
    onAgentRunChange: (running) => {
      chatState.sending = running;
      const id = chatState.activeId;
      if (!id) return;
      if (running) chatState.runningIds.add(id);
      else chatState.runningIds.delete(id);
      applyChatRunningIndicators();
    },
    onRefreshMessages: async () => {
      if (!chatState.activeId) return;
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatState.activeId)}`, {
          cache: 'no-store',
        });
        const data = await readApiJson(res);
        chatState.messages = data.thread.messages || [];
        chatState.title = data.thread.title;
        renderChatPanel();
      } catch {
        /* keep current messages on refresh failure */
      }
    },
    onTitleUpdate: (title) => {
      chatState.title = title;
      const thread = chatState.threads.find((t) => t.id === chatState.activeId);
      if (thread) thread.title = title;
      syncSidebarChatTitle(chatState.activeId, title);
      syncChatPaneHeaderTitle(title);
      if (title.trim() && !isDefaultSessionTitle(title)) {
        chatState.disposableChatId = null;
      }
    },
    onMessagesPersist: (userContent, assistantContent) => {
      chatState.messages.push({ role: 'user', content: userContent });
      chatState.messages.push({ role: 'assistant', content: assistantContent });
      chatState.composeDirty = false;
      if (chatState.activeId === chatState.disposableChatId) {
        chatState.disposableChatId = null;
      }
      // Already watching this thread live — no need for an "unread" dot on it.
      if (chatState.activeId) {
        const now = new Date().toISOString();
        markChatSeen(chatState.activeId, now);
        const thread = chatState.threads.find((t) => t.id === chatState.activeId);
        if (thread) {
          thread.last_role = 'assistant';
          thread.updated_at = now;
        }
      }
    },
    onLinkedJobsRefresh: () => {
      void refreshChatLinkedJobs().then(() => {
        const header = getChatPanel()?.querySelector('.ch-pane-header');
        if (header && shell.chatHasConversation()) {
          const next = shell.buildChatPaneHeader();
          header.replaceWith(next);
        }
      });
    },
  });
}

function renderChatPanel() {
  const root = getChatPanel();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const savedFilterScroll = shell.captureFilterTabsScroll?.(root) ?? 0;
  unmountChatThreadRoot(root);
  root.innerHTML = '';

  root.appendChild(renderChatSidebar(savedFilterScroll));

  const pane = document.createElement('div');
  pane.className = 'ch-pane';

  if (!chatState.activeId) {
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'chats',
      iconName: 'agent',
      bodyHtml: '<p>Select a session or start a new one.</p>',
      btnLabel: 'Start New Session',
      onCreate: () => void startNewChat(),
    });
    root.appendChild(pane);
    shell.clearTopbarPanelContext();
    shell.setChatComposeFocused(false);
    shell.syncFooterNav();
    shell.finishSidebarListScroll(root, savedSidebarScroll);
    return;
  }

  if (chatState.activeId) pane.appendChild(shell.buildChatPaneHeader());

  const threadHost = document.createElement('div');
  threadHost.className = 'ch-thread-root';
  threadHost.id = 'ch-thread-root';
  pane.appendChild(threadHost);

  root.appendChild(pane);
  getChatPanel()?.classList.add('ch-pane-active');
  shell.syncTopbarPanelContext();
  shell.syncFooterNav();
  mountChatThreadRoot(threadHost);
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

async function startNewChat(opts = {}) {
  const prevId = chatState.activeId;
  if (prevId) {
    await finalizeChatTitleIfNeeded(prevId);
    await abandonDisposableChat(prevId);
  }
  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await readApiJson(res);
    const thread = data.thread;
    chatState.threads.unshift(thread);
    chatState.activeId = thread.id;
    chatState.title = thread.title;
    chatState.messages = [];
    chatState.linkedJobs = thread.linked_jobs || [];
    chatState.composeDirty = false;
    chatState.disposableChatId = opts.disposable === false ? null : thread.id;
    rememberChatActiveId(thread.id);
    renderChatPanel();
  } catch (e) {
    alert(`Could not create session: ${e.message}`);
  }
}

async function openChat(id, opts = {}) {
  const force = opts.force === true;
  if (id === chatState.activeId && !force) {
    syncChatSidebarActiveState({ scroll: true });
    return;
  }
  try {
    const prevId = chatState.activeId;
    if (prevId && prevId !== id) {
      await finalizeChatTitleIfNeeded(prevId);
      await abandonDisposableChat(prevId);
    }
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    chatState.activeId = id;
    chatState.title = data.thread.title;
    chatState.messages = data.thread.messages || [];
    chatState.linkedJobs = data.thread.linked_jobs || [];
    chatState.composeDirty = false;
    chatState.disposableChatId = null;
    chatState.sending = false;
    rememberChatActiveId(id);
    markChatSeen(id, data.thread.updated_at);
    const idx = chatState.threads.findIndex((t) => t.id === id);
    if (idx !== -1) {
      chatState.threads[idx] = { ...chatState.threads[idx], linked_jobs: chatState.linkedJobs };
    }
    renderChatPanel();
  } catch (e) {
    alert(`Could not load session: ${e.message}`);
  }
}

async function bulkDeleteChats(ids) {
  if (!ids.length) return;
  closeOpenSwipeRow();
  const idSet = new Set(ids);
  for (const id of ids) {
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.status !== 404) await readApiJson(res);
    } catch {
      /* continue with remaining */
    }
  }
  chatState.threads = chatState.threads.filter((t) => !idSet.has(t.id));
  if (chatState.activeId && idSet.has(chatState.activeId)) {
    chatState.activeId = null;
    chatState.messages = [];
    chatState.title = '';
    if (chatState.disposableChatId && idSet.has(chatState.disposableChatId)) {
      chatState.disposableChatId = null;
    }
    clearChatLastActiveId();
    getChatPanel()?.classList.remove('ch-pane-active');
  }
  renderChatPanel();
}

async function bulkArchiveChats(ids) {
  if (!ids.length) return;
  closeOpenSwipeRow();
  for (const id of ids) {
    const t = chatState.threads.find((e) => e.id === id);
    if (!t || t.archived) continue;
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true, finalizeTitle: true }),
      });
      const data = await readApiJson(res);
      if (data.title) applyFinalizedChatTitle(id, data.title);
      const idx = chatState.threads.findIndex((e) => e.id === id);
      if (idx !== -1) chatState.threads[idx] = { ...chatState.threads[idx], archived: true };
    } catch {
      /* continue with remaining */
    }
  }
  chatState.threads = sortChatThreads(chatState.threads);
  if (chatState.activeId && ids.includes(chatState.activeId)) {
    chatState.activeId = null;
    chatState.messages = [];
    chatState.title = '';
    clearChatLastActiveId();
    getChatPanel()?.classList.remove('ch-pane-active');
  }
  renderChatPanel();
}

async function deleteChat(id) {
  if (!id) return;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status !== 404) await readApiJson(res);
    chatState.threads = chatState.threads.filter((t) => t.id !== id);
    if (chatState.activeId === id) {
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      if (chatState.disposableChatId === id) chatState.disposableChatId = null;
      clearChatLastActiveId();
      getChatPanel()?.classList.remove('ch-pane-active');
    }
    renderChatPanel();
  } catch (e) {
    shell.osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}

async function archiveChat(t) {
  closeOpenSwipeRow();
  const unarchive = !!t.archived;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(t.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !unarchive, finalizeTitle: !unarchive }),
    });
    const data = await readApiJson(res);
    if (data.title) applyFinalizedChatTitle(t.id, data.title);
    const idx = chatState.threads.findIndex((e) => e.id === t.id);
    if (idx !== -1) {
      chatState.threads[idx] = { ...chatState.threads[idx], archived: !unarchive };
    }
    chatState.threads = sortChatThreads(chatState.threads);
    if (!unarchive && chatState.activeId === t.id) {
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      clearChatLastActiveId();
      getChatPanel()?.classList.remove('ch-pane-active');
    }
    renderChatPanel();
  } catch (e) {
    shell.osAlert({
      title: unarchive ? 'Could not restore session' : 'Could not archive session',
      bodyHtml: escHtml(e.message),
    });
  }
}
let pendingChatDeepLinkId = null;

function parseChatDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('chat')?.trim() || null;
  } catch {
    return null;
  }
}

function navigateToChat(id) {
  if (!id) return;
  pendingChatDeepLinkId = id;
  shell.setActiveMap('chats', { force: true, chatId: id, keepChatSession: true });
}

/** Called from os-map-loader activateMapPanel when switching tabs with a chat id. */
function queueChatDeepLink(id) {
  pendingChatDeepLinkId = id;
}

export {
  chatState,
  loadChatsTab,
  navigateToChat,
  renderChatPanel,
  parseChatDeepLinkFromUrl,
  syncChatRunningPoll,
  stopChatRunningPoll,
  showChatToast,
  copyChatText,
  formatChatDate,
  finalizeChatTitleIfNeeded,
  abandonDisposableChat,
  fetchChatThreads,
  createHeaderChatTitle,
  deleteChat,
  createPortalShareBtn,
  renderLinkTrackStatus,
  renderShareSendLog,
  sharePortalLink,
  queueChatDeepLink,
  startNewChat,
  getChatPanel,
  clearChatLastActiveId,
  chatMsgPlainText,
  shareChatText,
  archiveChat,
  openChat,
  openReaveShareSheet,
  refreshChatSidebarList,
  openDocumentShareSheet,
};
