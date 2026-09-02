/** Shared JSON helpers for Astro API routes. */

/** Default cap for JSON API bodies — keeps public/authenticated routes bounded. */
export const MAX_JSON_BODY_BYTES = 1_048_576; // 1 MiB

export function jsonResponse(
  body: unknown,
  status = 200,
  opts?: { cache?: string; headers?: Record<string, string> },
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': opts?.cache ?? 'no-store',
    ...opts?.headers,
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function bodyTooLargeResponse(): Response {
  return jsonResponse({ ok: false, error: 'Request body too large' }, 413);
}

/** Reject oversized bodies before parsing — Content-Length fast path + byte check after read. */
export function isRequestBodyTooLarge(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): boolean {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const n = Number.parseInt(contentLength, 10);
    if (Number.isFinite(n) && n > maxBytes) return true;
  }
  return false;
}

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<{ ok: true; body: Record<string, unknown> } | Response> {
  if (isRequestBodyTooLarge(request, maxBytes)) return bodyTooLargeResponse();

  let text: string;
  try {
    text = await request.text();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  if (text.length > maxBytes) return bodyTooLargeResponse();
  if (!text.trim()) return { ok: true, body: {} };

  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
    }
    return { ok: true, body };
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }
}
