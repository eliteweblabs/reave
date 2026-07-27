import type { APIContext } from 'astro';

type StaffLocals = Pick<APIContext['locals'], 'auth' | 'authStatus' | 'authToken'>;

/** True when Clerk sees an authenticated staff session (admin), not a client visitor. */
export function isStaffSession(locals: StaffLocals): boolean {
  const status = String(locals.authStatus ?? '').toLowerCase();
  if (status === 'signed-in') return true;

  try {
    if (locals.auth?.().userId) return true;
  } catch {
    /* Clerk unavailable in this context */
  }

  if (locals.authToken) return true;
  return false;
}

/** Owner/QA preview flag on public tracked routes (/go, deck pings, etc.). */
export function isOwnerPreviewRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get('preview') === '1';
}

/** Link unfurlers / preview bots — must not count as a client "view". */
export function isLinkPreviewRequest(request: Request): boolean {
  if (request.method === 'HEAD') return true;
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (!ua) return false;
  return /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|linkedin|twitter|embed|linkpreview|vkshare|pinterest/i.test(
    ua,
  );
}
