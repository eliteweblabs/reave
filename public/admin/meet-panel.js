/**
 * Video meet — guest invite links + open Galene room.
 */
import { createBrandBtn, createCopyIconBtn } from './admin-ui.js?v=20260903a';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260903a';

let mounted = false;
let lastInviteUrl = '';

function meetRoomUrl() {
  const base = window.__galeneMeetUrl?.trim().replace(/\/$/, '');
  if (base) return `${base}/group/meet/`;
  const domain = window.__companyBrand?.domain?.trim();
  if (domain) return `https://meet.${domain}/group/meet/`;
  return '';
}

function meetSharePopupUrl(group = 'meet') {
  const origin = window.location.origin.replace(/\/$/, '');
  return `${origin}/admin/meet-invite?group=${encodeURIComponent(group)}`;
}

function formatExpiry(iso) {
  if (!iso) return '7 days';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

async function createGuestInvite(group = 'meet') {
  const res = await adminFetch('/api/admin/meet/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group }),
  });
  return readAdminJson(res);
}

function paint(root) {
  const room = meetRoomUrl();
  root.innerHTML =
    `<div class="meet-panel-scroll ml-panel-scroll">` +
    `<div class="meet-panel-inner">` +
    `<p class="prof-hint prof-hint--block">` +
    `Share a secure guest link — recipients open it and join automatically (no login form). ` +
    `Links expire after 7 days. Moderators still use <code>host</code> + the room password.` +
    `</p>` +
    `<section class="prof-card meet-panel-card">` +
    `<h3 class="meet-panel-title">Default room</h3>` +
    `<p class="meet-panel-room-label"><code>${escHtml(room || 'meet.{domain}/group/meet/')}</code></p>` +
    `<div class="meet-panel-actions" id="meet-panel-actions"></div>` +
    `<div class="meet-panel-invite" id="meet-invite-block" hidden>` +
    `<label class="prof-field">Guest link</label>` +
    `<div class="meet-panel-invite-row">` +
    `<input type="text" class="prof-input meet-panel-invite-input" id="meet-invite-input" readonly />` +
    `<span id="meet-invite-copy-slot"></span>` +
    `</div>` +
    `<p class="prof-hint" id="meet-invite-expiry"></p>` +
    `</div>` +
    `<p class="prof-hint meet-panel-error" id="meet-panel-error" hidden></p>` +
    `</section>` +
    `</div>` +
    `</div>`;
}

function bind(root) {
  const header = createPaneHeader({
    title: 'Meet',
    subtitle: 'Galene video rooms',
  });
  root.prepend(header);

  const actions = root.querySelector('#meet-panel-actions');
  if (actions) {
    actions.appendChild(
      createBrandBtn({
        variant: 'filled',
        label: 'Share guest link',
        iconKey: 'share',
        onClick: () => void shareGuestLink(root),
      }),
    );
    const room = meetRoomUrl();
    if (room) {
      actions.appendChild(
        createBrandBtn({
          variant: 'glass',
          label: 'Open room',
          iconKey: 'video',
          href: room,
        }),
      );
    }
  }
}

async function shareGuestLink(root) {
  const errEl = root.querySelector('#meet-panel-error');
  const block = root.querySelector('#meet-invite-block');
  const input = root.querySelector('#meet-invite-input');
  const expiryEl = root.querySelector('#meet-invite-expiry');
  const copySlot = root.querySelector('#meet-invite-copy-slot');
  if (errEl) errEl.hidden = true;

  const popup = window.open(
    meetSharePopupUrl('meet'),
    'reave-meet-share',
    'width=460,height=360,noopener,noreferrer',
  );

  if (popup) return;

  const data = await createGuestInvite('meet');
  if (!data?.ok || !data.invite?.url) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = data?.error || 'Could not create guest link.';
    }
    return;
  }

  lastInviteUrl = data.invite.url;
  if (block) block.hidden = false;
  if (input) input.value = lastInviteUrl;
  if (expiryEl) expiryEl.textContent = `Expires ${formatExpiry(data.invite.expires)}`;
  if (copySlot && !copySlot.querySelector('button')) {
    copySlot.appendChild(
      createCopyIconBtn({
        getText: () => lastInviteUrl,
        label: 'Copy guest link',
      }),
    );
  }
  try {
    await navigator.clipboard.writeText(lastInviteUrl);
  } catch {
    /* manual copy via icon */
  }
}

export function loadMeetTab() {
  const root = document.getElementById('meet-panel');
  if (!root) return;
  if (!mounted) {
    mountPanelSkeleton(root, 'settings');
    paint(root);
    bind(root);
    mounted = true;
  }
}
