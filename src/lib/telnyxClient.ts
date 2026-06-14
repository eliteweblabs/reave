/**
 * Telnyx API client — SMS outbound, Call Control, and webhook verification.
 * Replaces Twilio for SMS and adds inbound/outbound voice agent support.
 *
 * Docs: https://developers.telnyx.com/api
 */
import { createVerify } from 'crypto';
import { serverEnv } from './serverEnv';

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

// ─── Configuration ─────────────────────────────────────────────────────────

export function isTelnyxConfigured(): boolean {
  return Boolean(serverEnv('TELNYX_API_KEY'));
}

function apiKey(): string | undefined {
  return serverEnv('TELNYX_API_KEY')?.trim();
}

function fromNumber(): string {
  return serverEnv('TELNYX_FROM_NUMBER')?.trim() || '';
}

function ttsVoice(): string {
  return serverEnv('TELNYX_VOICE')?.trim() || 'Polly.Joanna';
}

function ttsLanguage(): string {
  return serverEnv('TELNYX_VOICE_LANGUAGE')?.trim() || 'en-US';
}

// ─── Result types ───────────────────────────────────────────────────────────

export type TelnyxResult = { ok: true; id?: string } | { ok: false; error: string };
export type TelnyxCallResult = { ok: boolean; error?: string };

// ─── SMS ────────────────────────────────────────────────────────────────────

export async function sendTelnyxSms(opts: {
  to: string;
  text: string;
  from?: string;
}): Promise<TelnyxResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'TELNYX_API_KEY is not set' };
  const from = (opts.from ?? fromNumber()).trim();
  if (!from) return { ok: false, error: 'TELNYX_FROM_NUMBER is not set' };
  const to = opts.to.trim();
  if (!to) return { ok: false, error: 'recipient phone is required' };

  try {
    const res = await fetch(`${TELNYX_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ from, to, text: opts.text }),
    });
    const raw = await res.text();
    let json: unknown;
    try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'errors' in json
          ? JSON.stringify((json as { errors: unknown }).errors).slice(0, 300)
          : raw.slice(0, 200) || res.statusText;
      return { ok: false, error: err };
    }
    const data = json && typeof json === 'object' && 'data' in json
      ? (json as { data: unknown }).data : null;
    const id = data && typeof data === 'object' && 'id' in data
      ? String((data as { id: unknown }).id) : undefined;
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Call Control ────────────────────────────────────────────────────────────

async function callAction(
  callControlId: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<TelnyxCallResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'TELNYX_API_KEY is not set' };
  try {
    const res = await fetch(
      `${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/${action}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: txt.slice(0, 200) || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function telnyxAnswerCall(callControlId: string): Promise<TelnyxCallResult> {
  return callAction(callControlId, 'answer');
}

export function telnyxHangupCall(callControlId: string): Promise<TelnyxCallResult> {
  return callAction(callControlId, 'hangup');
}

/** Speak text on a call (no gather — one-shot). Fires call.speak.ended when done. */
export function telnyxSpeakOnCall(
  callControlId: string,
  text: string,
  opts: { clientState?: string } = {},
): Promise<TelnyxCallResult> {
  return callAction(callControlId, 'speak', {
    payload: text,
    voice: ttsVoice(),
    language: ttsLanguage(),
    payload_type: 'text',
    ...(opts.clientState ? { client_state: encodeClientState(opts.clientState) } : {}),
  });
}

/**
 * Speak a prompt and then listen for speech. Fires call.gather.ended with
 * speech_result when the caller stops speaking.
 */
export function telnyxGatherUsingSpeak(
  callControlId: string,
  prompt: string,
  opts: { clientState?: string; speechEndTimeoutMs?: number } = {},
): Promise<TelnyxCallResult> {
  return callAction(callControlId, 'gather_using_speak', {
    payload: prompt,
    voice: ttsVoice(),
    language: ttsLanguage(),
    payload_type: 'text',
    speech_end_timeout_ms: opts.speechEndTimeoutMs ?? 1500,
    gather_ends_with: 'speech',
    ...(opts.clientState ? { client_state: encodeClientState(opts.clientState) } : {}),
  });
}

/** Transfer the call to another number (manual operator takeover). */
export function telnyxTransferCall(callControlId: string, to: string): Promise<TelnyxCallResult> {
  return callAction(callControlId, 'transfer', { to });
}

/**
 * Initiate an outbound call.
 * Requires TELNYX_APP_ID (Call Control Application ID from the Telnyx portal).
 */
export async function telnyxMakeCall(opts: {
  to: string;
  from?: string;
  clientState?: string;
}): Promise<{ ok: boolean; callControlId?: string; error?: string }> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'TELNYX_API_KEY is not set' };
  const appId = serverEnv('TELNYX_APP_ID')?.trim();
  if (!appId) return { ok: false, error: 'TELNYX_APP_ID is not set' };
  const from = (opts.from ?? fromNumber()).trim();
  if (!from) return { ok: false, error: 'TELNYX_FROM_NUMBER is not set' };

  try {
    const res = await fetch(`${TELNYX_API_BASE}/calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        connection_id: appId,
        from,
        to: opts.to.trim(),
        ...(opts.clientState ? { client_state: encodeClientState(opts.clientState) } : {}),
      }),
    });
    const raw = await res.text();
    let json: unknown;
    try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
    if (!res.ok) {
      return { ok: false, error: raw.slice(0, 200) || res.statusText };
    }
    const data = json && typeof json === 'object' && 'data' in json
      ? (json as { data: unknown }).data : null;
    const ccId = data && typeof data === 'object' && 'call_control_id' in data
      ? String((data as { call_control_id: unknown }).call_control_id)
      : undefined;
    return { ok: true, callControlId: ccId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Webhook signature verification ─────────────────────────────────────────

/**
 * Verify a Telnyx webhook using ED25519.
 * publicKey: base64-encoded raw 32-byte key from the Telnyx portal.
 * signature: value of `telnyx-signature-ed25519` header.
 * timestamp: value of `telnyx-timestamp` header.
 */
export function verifyTelnyxWebhook(opts: {
  rawBody: string;
  signature: string;
  timestamp: string;
  publicKey: string;
}): boolean {
  try {
    // Telnyx gives a raw 32-byte ed25519 key in base64.
    // Node.js crypto needs it in SPKI DER format — prepend the standard prefix.
    const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const rawKey = Buffer.from(opts.publicKey, 'base64');
    const derKey = Buffer.concat([derPrefix, rawKey]);

    const verifier = createVerify('ed25519');
    verifier.update(`${opts.timestamp}|${opts.rawBody}`);
    return verifier.verify(
      { key: derKey, format: 'der', type: 'spki' },
      Buffer.from(opts.signature, 'base64'),
    );
  } catch (e) {
    console.error('[telnyx] webhook signature error:', e);
    return false;
  }
}

// ─── client_state helpers ─────────────────────────────────────────────────

/**
 * Telnyx passes `client_state` through call events as a base64 string.
 * Use these helpers to pack/unpack state across webhook calls.
 */
export function encodeClientState(data: string | object): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return Buffer.from(str).toString('base64');
}

export function decodeClientState(encoded: string): string {
  try { return Buffer.from(encoded, 'base64').toString('utf8'); } catch { return encoded; }
}
