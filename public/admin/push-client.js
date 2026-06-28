/**
 * Register admin PWA service worker and Web Push subscriptions.
 */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerAdminServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
  } catch (e) {
    console.warn('[push] SW register failed', e);
    return null;
  }
}

async function getExistingPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/admin/');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function isAdminPushEnabled() {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const sub = await getExistingPushSubscription();
  return !!sub;
}

function resetPushButtonIcon(btn) {
  if (!btn.querySelector('span[aria-hidden="true"]')) {
    btn.innerHTML = '<span aria-hidden="true">🔔</span>';
  }
}

export async function syncAdminPushButton(buttonId = 'push-enable-btn') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  resetPushButtonIcon(btn);
  btn.classList.remove('push-on');
  btn.disabled = false;

  if (!('Notification' in window) || !('PushManager' in window)) {
    btn.hidden = true;
    return;
  }

  await registerAdminServiceWorker();

  try {
    const enabled = await isAdminPushEnabled();
    btn.hidden = enabled;
  } catch {
    btn.hidden = false;
  }
}

export async function subscribeAdminPush() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Push not supported in this browser');
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied');

  const reg = await registerAdminServiceWorker();
  if (!reg) throw new Error('Service worker unavailable');

  const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
  const keyData = await keyRes.json();
  if (!keyRes.ok || !keyData.publicKey) {
    throw new Error(keyData.error || 'Push not configured on server');
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Subscribe failed');
  return sub;
}

export function initAdminPushButton(buttonId = 'push-enable-btn') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  void syncAdminPushButton(buttonId);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await subscribeAdminPush();
      btn.hidden = true;
    } catch (e) {
      alert(e.message || String(e));
      btn.disabled = false;
    }
  });
}

// Auto-init when loaded as module from admin page
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initAdminPushButton());
  window.addEventListener('pageshow', () => syncAdminPushButton());
}
