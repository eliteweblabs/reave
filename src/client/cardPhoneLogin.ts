import { initCardPasskeyGate, registerCardPasskeyAfterLogin } from './cardPasskey';

type ClerkLike = {
  loaded?: boolean;
  client?: {
    signIn: {
      create: (args: { identifier: string }) => Promise<{
        supportedFirstFactors?: Array<{ strategy: string; phoneNumberId?: string }>;
      }>;
      prepareFirstFactor: (args: {
        strategy: string;
        phoneNumberId: string;
      }) => Promise<unknown>;
      attemptFirstFactor: (args: { strategy: string; code: string }) => Promise<{
        status: string;
        createdSessionId?: string;
      }>;
    };
    signUp: {
      create: (args: { phoneNumber: string }) => Promise<unknown>;
      preparePhoneNumberVerification: (args: { strategy: string }) => Promise<unknown>;
      attemptPhoneNumberVerification: (args: { code: string }) => Promise<{
        status: string;
        createdSessionId?: string;
      }>;
    };
  };
  signUp?: unknown;
  user?: unknown;
  setActive: (args: { session: string }) => Promise<unknown>;
  signOut?: () => Promise<unknown>;
};

type ClerkErr = {
  errors?: Array<{ code?: string; longMessage?: string; message?: string }>;
  message?: string;
};

function readLoginConfig(root: HTMLElement) {
  const phoneE164 = root.dataset.phoneE164?.trim() || '';
  const redirectUrl = root.dataset.redirectUrl?.trim() || '/admin/';
  const allowSignUp = root.dataset.allowSignUp !== '0';
  const passkeyGated = root.dataset.passkeyGated === '1';
  return { phoneE164, redirectUrl, allowSignUp, passkeyGated };
}

const SSR_SYNC_KEY = 'reave-clerk-ssr-sync-once';

function serverHasStaffSession() {
  return Boolean(document.body?.dataset?.userId?.trim());
}

function ssrSyncAlreadyTried() {
  try {
    return sessionStorage.getItem(SSR_SYNC_KEY) === '1';
  } catch {
    return false;
  }
}

function markSsrSyncTried() {
  try {
    sessionStorage.setItem(SSR_SYNC_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearSsrSyncMark() {
  try {
    sessionStorage.removeItem(SSR_SYNC_KEY);
  } catch {
    /* ignore */
  }
}

function clerkMessage(err: unknown) {
  const e = err as ClerkErr;
  const first = e?.errors?.[0];
  return first?.longMessage || first?.message || e?.message || 'Could not send a code.';
}

function waitForClerk(): Promise<ClerkLike> {
  return new Promise((resolve, reject) => {
    const clerk = (window as Window & { Clerk?: ClerkLike }).Clerk;
    if (clerk?.loaded && clerk.client) {
      resolve(clerk);
      return;
    }
    const started = Date.now();
    const onReady = () => {
      const ready = (window as Window & { Clerk?: ClerkLike }).Clerk;
      if (ready?.loaded && ready.client) {
        cleanup();
        resolve(ready);
      }
    };
    const cleanup = () => {
      window.removeEventListener('clerk-loaded', onReady, true);
      clearInterval(timer);
    };
    window.addEventListener('clerk-loaded', onReady, true);
    const timer = setInterval(() => {
      const ready = (window as Window & { Clerk?: ClerkLike }).Clerk;
      if (ready?.loaded && ready.client) {
        cleanup();
        resolve(ready);
      } else if (Date.now() - started > 20000) {
        cleanup();
        reject(new Error('Sign-in is still loading. Try again.'));
      }
    }, 50);
  });
}

async function syncCardSessionOnce(
  postLoginTarget: string,
  clerkHandshakeUrl: (target: string) => string,
) {
  if (serverHasStaffSession()) {
    clearSsrSyncMark();
    return false;
  }
  if (ssrSyncAlreadyTried()) {
    try {
      await (window as Window & { Clerk?: ClerkLike }).Clerk?.signOut?.();
    } catch {
      /* ignore */
    }
    clearSsrSyncMark();
    return false;
  }
  markSsrSyncTried();
  window.location.assign(clerkHandshakeUrl(postLoginTarget));
  return true;
}

async function sendCode(clerk: ClerkLike, phoneE164: string, allowSignUp: boolean) {
  try {
    const created = await clerk.client!.signIn.create({ identifier: phoneE164 });
    const factor = (created.supportedFirstFactors || []).find(
      (row) => row.strategy === 'phone_code' && row.phoneNumberId,
    );
    if (!factor?.phoneNumberId) {
      throw new Error('Phone codes are not enabled for this number.');
    }
    await clerk.client!.signIn.prepareFirstFactor({
      strategy: 'phone_code',
      phoneNumberId: factor.phoneNumberId,
    });
    return 'sign-in' as const;
  } catch (err) {
    const code = (err as ClerkErr)?.errors?.[0]?.code;
    if (code !== 'form_identifier_not_found' || !allowSignUp) throw err;
    await clerk.client!.signUp.create({ phoneNumber: phoneE164 });
    await clerk.client!.signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
    return 'sign-up' as const;
  }
}

async function verifyCode(clerk: ClerkLike, mode: 'sign-in' | 'sign-up', code: string) {
  if (mode === 'sign-up') {
    const result = await clerk.client!.signUp.attemptPhoneNumberVerification({ code });
    if (result.status !== 'complete' || !result.createdSessionId) {
      throw new Error('That code did not finish sign-in.');
    }
    await clerk.setActive({ session: result.createdSessionId });
    return;
  }
  const result = await clerk.client!.signIn.attemptFirstFactor({
    strategy: 'phone_code',
    code,
  });
  if (result.status !== 'complete' || !result.createdSessionId) {
    throw new Error('That code did not finish sign-in.');
  }
  await clerk.setActive({ session: result.createdSessionId });
}

function bindOtpUi(
  phoneE164: string,
  allowSignUp: boolean,
  postLoginTarget: string,
  clerkHandshakeUrl: (target: string) => string,
) {
  const sendBtn = document.getElementById('nfc-login-send');
  const sendMeta = document.getElementById('nfc-login-send-meta');
  const loginErrEl = document.getElementById('nfc-login-err');
  const form = document.getElementById('nfc-otp-form');
  const input = document.getElementById('nfc-otp-code') as HTMLInputElement | null;
  const errEl = document.getElementById('nfc-otp-err');
  const submitBtn = document.getElementById('nfc-otp-submit') as HTMLButtonElement | null;
  const resendBtn = document.getElementById('nfc-otp-resend');
  if (!sendBtn || !form || !input || !submitBtn || !resendBtn) return;

  const loginSendBtn = sendBtn as HTMLButtonElement;
  const otpForm = form;
  const otpInput = input;
  const otpSubmitBtn = submitBtn;
  const otpResendBtn = resendBtn;

  let mode: 'sign-in' | 'sign-up' = 'sign-in';
  let sending = false;

  function showLoginError(message: string) {
    if (loginErrEl) {
      loginErrEl.hidden = !message;
      loginErrEl.textContent = message || '';
    }
    if (sendMeta) {
      sendMeta.textContent = message || 'Text a one-time code';
      (sendMeta as HTMLElement).style.color = message ? '#b42318' : '';
    }
  }

  function showError(message: string) {
    if (!errEl) return;
    errEl.hidden = !message;
    errEl.textContent = message || '';
  }

  function showOtp() {
    showLoginError('');
    loginSendBtn.hidden = true;
    otpForm.hidden = false;
    otpInput.value = '';
    otpInput.focus();
  }

  async function startOtp() {
    if (sending) return;
    sending = true;
    loginSendBtn.disabled = true;
    if (sendMeta) {
      sendMeta.textContent = 'Sending code…';
      (sendMeta as HTMLElement).style.color = '';
    }
    showLoginError('');
    showError('');
    try {
      const clerk = await waitForClerk();
      mode = await sendCode(clerk, phoneE164, allowSignUp);
      showOtp();
    } catch (err) {
      showLoginError(clerkMessage(err));
      loginSendBtn.hidden = false;
      loginSendBtn.disabled = false;
    } finally {
      sending = false;
    }
  }

  loginSendBtn.addEventListener('click', () => {
    void startOtp();
  });

  otpResendBtn.addEventListener('click', () => {
    loginSendBtn.hidden = false;
    otpForm.hidden = true;
    void startOtp();
  });

  async function submitCode(event?: Event) {
    event?.preventDefault();
    const code = otpInput.value.replace(/\D/g, '');
    if (code.length < 4) {
      showError('Enter the code from the text.');
      return;
    }
    otpSubmitBtn.disabled = true;
    otpInput.disabled = true;
    showError('');
    try {
      const clerk = await waitForClerk();
      await verifyCode(clerk, mode, code);
      await registerCardPasskeyAfterLogin();
      clearSsrSyncMark();
      window.location.assign(clerkHandshakeUrl(postLoginTarget));
    } catch (err) {
      showError(clerkMessage(err));
      otpSubmitBtn.disabled = false;
      otpInput.disabled = false;
      otpInput.focus();
    }
  }

  otpForm.addEventListener('submit', submitCode);
  otpInput.addEventListener('input', () => {
    otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
    showError('');
    if (otpInput.value.length === 6) void submitCode();
  });
}

/** NFC /card — Clerk phone OTP (bundled from card.astro, not inlined in the component). */
export async function initCardPhoneLogin() {
  const root = document.querySelector('[data-card-phone-login]') as HTMLElement | null;
  if (!root) return;

  const { phoneE164, redirectUrl, allowSignUp, passkeyGated } = readLoginConfig(root);
  if (!phoneE164) return;

  const assetVersion =
    typeof __PUBLIC_ASSET_VERSION__ !== 'undefined' ? __PUBLIC_ASSET_VERSION__ : '';
  const shared = (await import(`/admin/shared.js?v=${assetVersion}`)) as {
    clerkHandshakeUrl: (target: string) => string;
  };
  const { clerkHandshakeUrl } = shared;

  const postLoginTarget =
    redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') ? redirectUrl : '/admin/';

  if (passkeyGated) {
    initCardPasskeyGate({ gated: true, redirectUrl });
  }

  void waitForClerk()
    .then(async (clerk) => {
      if (clerk.user && !serverHasStaffSession()) {
        await syncCardSessionOnce(postLoginTarget, clerkHandshakeUrl);
      }
    })
    .catch(() => {
      /* Clerk not configured or still loading */
    });

  bindOtpUi(phoneE164, allowSignUp, postLoginTarget, clerkHandshakeUrl);
}
