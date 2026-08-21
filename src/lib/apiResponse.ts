/** Shared JSON helpers for Astro API routes. */

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

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return { ok: true, body };
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }
}
