/**
 * PATCH /api/admin/alerts/[id] — archive/dismiss a push alert notification.
 */

import type { APIContext } from 'astro';
import { dismissEmailRelatedNotifications } from '../../../../lib/emailNotificationSync';
import { emailIdFromPushAlertTag } from '../../../../lib/notificationFormat';
import { storeAckPushAlert } from '../../../../lib/pushAlertStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function emailIdFromAlertUrl(url?: string | null): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    return new URL(raw, 'https://reave.app').searchParams.get('email')?.trim() || null;
  } catch {
    return null;
  }
}

async function ackAlert(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim() ?? '';
  if (!id) return json({ ok: false, error: 'Invalid alert id' }, 400);

  const result = await storeAckPushAlert(id);
  if (!result.ok) return json({ ok: false, error: result.error }, 404);

  // Archiving a triage/inbox push must also clear any sibling automation banner
  // for the same email (otherwise dismissing "Uncertain" can unmask "Confirm").
  const emailId =
    emailIdFromPushAlertTag(result.tag) || emailIdFromAlertUrl(result.url) || null;
  if (emailId) {
    await dismissEmailRelatedNotifications(emailId, { markAutomationAck: true }).catch(
      () => undefined,
    );
  }

  return json({ ok: true, alertId: result.id });
}

export async function PATCH(context: APIContext): Promise<Response> {
  return ackAlert(context);
}

/** POST alias — some mobile/PWA stacks handle POST more reliably than PATCH. */
export async function POST(context: APIContext): Promise<Response> {
  return ackAlert(context);
}
