import { browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export type CardPasskeyGateOptions = {
  /** Login block is rendered but hidden until passkey gating resolves. */
  gated: boolean;
  redirectUrl: string;
  onTrusted?: (displayName: string) => void;
  onRevealLogin?: () => void;
};

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Passkey request failed.');
  }
  return data;
}

export async function registerCardPasskeyAfterLogin(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    const data = await fetchJson('/api/card/passkey/register/options', { method: 'POST' });
    const options = data.options as Parameters<typeof startRegistration>[0]['optionsJSON'];
    if (!options) return false;
    const attestation = await startRegistration({ optionsJSON: options });
    await fetchJson('/api/card/passkey/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: attestation }),
    });
    return true;
  } catch {
    return false;
  }
}

function revealTrustedUi(displayName: string, redirectUrl: string) {
  const loginRoot = document.querySelector('[data-card-phone-login]');
  if (loginRoot) loginRoot.hidden = true;

  const existing = document.getElementById('nfc-passkey-trusted');
  if (existing) {
    existing.hidden = false;
    const meta = existing.querySelector('.nfc-login-meta');
    if (meta) meta.textContent = `Continue as ${displayName}`;
    return;
  }

  const link = document.createElement('a');
  link.id = 'nfc-passkey-trusted';
  link.className = 'nfc-login-btn';
  link.href = redirectUrl;
  link.setAttribute('aria-label', `Open dashboard as ${displayName}`);
  link.innerHTML = `
    <span class="nfc-login-ico" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
    </span>
    <span class="nfc-login-copy">
      <span class="nfc-login-label">Dashboard</span>
      <span class="nfc-login-meta">Continue as ${displayName.replace(/</g, '&lt;')}</span>
    </span>`;
  loginRoot?.insertAdjacentElement('afterend', link);
}

function revealLoginBlock() {
  const loginRoot = document.querySelector('[data-card-phone-login]');
  if (loginRoot) loginRoot.hidden = false;
}

async function tryConditionalPasskeyAuth(): Promise<{ displayName: string } | null> {
  if (!window.PublicKeyCredential) return null;

  let autofillSupported = false;
  try {
    autofillSupported = await browserSupportsWebAuthnAutofill();
  } catch {
    autofillSupported = false;
  }
  if (!autofillSupported) return null;

  const data = await fetchJson('/api/card/passkey/auth/options', { method: 'POST' });
  const options = data.options as Parameters<typeof startAuthentication>[0]['optionsJSON'];
  if (!options) return null;

  let assertion;
  try {
    assertion = await startAuthentication({
      optionsJSON: options,
      useBrowserAutofill: true,
      verifyBrowserAutofillInput: true,
    });
  } catch {
    return null;
  }

  const verified = await fetchJson('/api/card/passkey/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: assertion }),
  });

  const displayName =
    typeof verified.displayName === 'string' && verified.displayName.trim()
      ? verified.displayName.trim()
      : 'You';
  return { displayName };
}

/**
 * Hide login from NFC visitors once an owner passkey exists; recognize owner devices silently.
 */
export async function initCardPasskeyGate(opts: CardPasskeyGateOptions): Promise<void> {
  const loginRoot = document.querySelector('[data-card-phone-login]') as HTMLElement | null;
  if (!loginRoot) return;

  if (!opts.gated) {
    loginRoot.hidden = false;
    return;
  }

  loginRoot.hidden = true;

  try {
    const status = await fetchJson('/api/card/passkey/status');
    const trusted = status.trusted as { displayName?: string } | null;
    if (trusted?.displayName) {
      revealTrustedUi(trusted.displayName, opts.redirectUrl);
      opts.onTrusted?.(trusted.displayName);
      return;
    }

    const recognized = await tryConditionalPasskeyAuth();
    if (recognized) {
      revealTrustedUi(recognized.displayName, opts.redirectUrl);
      opts.onTrusted?.(recognized.displayName);
      return;
    }

    let autofillSupported = false;
    try {
      autofillSupported = await browserSupportsWebAuthnAutofill();
    } catch {
      autofillSupported = false;
    }

    if (!autofillSupported) {
      revealLoginBlock();
      opts.onRevealLogin?.();
    }
  } catch {
    revealLoginBlock();
    opts.onRevealLogin?.();
  }
}
