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

  registerAdminServiceWorker();

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await subscribeAdminPush();
      btn.textContent = '🔔 On';
      btn.title = 'Push notifications enabled';
      btn.classList.add('push-on');
    } catch (e) {
      alert(e.message || String(e));
      btn.disabled = false;
    }
  });
}

// Auto-init when loaded as module from admin page
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initAdminPushButton());
}
