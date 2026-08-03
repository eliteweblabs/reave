/**
 * POST /api/kap/upload — Kap plugin upload (X-Kap-Key or Bearer).
 * Returns a permanent tokenized view URL at /r/:token.
 */

import type { APIContext } from 'astro';
import {
  isKapRecordingMediaType,
  kapRecordingViewUrl,
  KAP_RECORDING_MAX_BYTES,
  storeKapRecording,
} from '../../../lib/kapRecordings';
import { secretMatches } from '../../../lib/secretCompare';
import { serverEnv } from '../../../lib/serverEnv';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function isKapUploadAuthorized(request: Request): boolean {
  const expected = serverEnv('KAP_UPLOAD_KEY')?.trim();
  if (!expected) return false;

  const headerKey = request.headers.get('X-Kap-Key');
  if (secretMatches(headerKey, expected)) return true;

  const auth = request.headers.get('Authorization')?.trim() ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return secretMatches(auth.slice(7).trim(), expected);
  }

  return false;
}

export async function POST(context: APIContext): Promise<Response> {
  const rate = checkInMemoryRateLimit(`kap:${clientIp(context.request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 15,
  });
  if (!rate.ok) {
    return json({ ok: false, error: 'Too many uploads. Please try again later.' }, 429);
  }

  if (!serverEnv('KAP_UPLOAD_KEY')?.trim()) {
    return json({ ok: false, error: 'KAP_UPLOAD_KEY is not configured on this service' }, 503);
  }
  if (!isKapUploadAuthorized(context.request)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ ok: false, error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || !file.size) {
    return json({ ok: false, error: 'Missing file' }, 400);
  }

  const mediaType = file.type.trim().toLowerCase();
  if (!isKapRecordingMediaType(mediaType)) {
    return json(
      { ok: false, error: 'File must be GIF, APNG, MP4, or WebM' },
      400,
    );
  }
  if (file.size > KAP_RECORDING_MAX_BYTES) {
    return json(
      { ok: false, error: `File too large (max ${KAP_RECORDING_MAX_BYTES / (1024 * 1024)} MB)` },
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeKapRecording({
    filename: file.name.trim() || undefined,
    mediaType,
    sizeBytes: buffer.length,
    dataBase64: buffer.toString('base64'),
  });
  if (!stored.ok) return json({ ok: false, error: stored.error }, 400);

  const url = kapRecordingViewUrl(stored.record.token, context.request);
  return json({
    ok: true,
    token: stored.record.token,
    url,
    filename: stored.record.filename,
    mediaType: stored.record.mediaType,
    sizeBytes: stored.record.sizeBytes,
  });
}
