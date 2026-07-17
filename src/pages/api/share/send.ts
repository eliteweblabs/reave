/**
 * POST /api/share/send — branded outbound share delivery (admin).
 * Body: { kind, channel, recipient?, url?, message?, jobSlug?, tab?, booking?, template?, docTitle? }
 */
import type { APIContext } from 'astro';
import {
  deliverShare,
  type DeliverShareInput,
  type ShareChannel,
  type ShareKind,
} from '../../../lib/shareDelivery';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const KINDS = new Set<ShareKind>(['portal', 'work', 'booking', 'document']);

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const kindRaw = String(body.kind ?? '').trim();
  const kind = KINDS.has(kindRaw as ShareKind) ? (kindRaw as ShareKind) : null;
  if (!kind) return json({ ok: false, error: 'kind must be portal, work, booking, or document' }, 400);

  const channelRaw = String(body.channel ?? '').trim();
  const channel: ShareChannel | null =
    channelRaw === 'email' ? 'email' : channelRaw === 'sms' ? 'sms' : null;
  if (!channel) return json({ ok: false, error: 'channel must be "email" or "sms"' }, 400);

  const recipientRaw =
    body.recipient && typeof body.recipient === 'object'
      ? (body.recipient as Record<string, unknown>)
      : {};
  const recipient = {
    contactUid:
      typeof recipientRaw.contactUid === 'string' ? recipientRaw.contactUid.trim() : undefined,
    name: typeof recipientRaw.name === 'string' ? recipientRaw.name.trim() : undefined,
    email: typeof recipientRaw.email === 'string' ? recipientRaw.email.trim() : undefined,
    phone: typeof recipientRaw.phone === 'string' ? recipientRaw.phone.trim() : undefined,
  };

  const bookingRaw =
    body.booking && typeof body.booking === 'object' ? (body.booking as Record<string, unknown>) : null;
  const booking = bookingRaw
    ? {
        uid: String(bookingRaw.uid ?? '').trim(),
        title: typeof bookingRaw.title === 'string' ? bookingRaw.title.trim() : undefined,
        startTime: String(bookingRaw.startTime ?? '').trim(),
        endTime: typeof bookingRaw.endTime === 'string' ? bookingRaw.endTime.trim() : undefined,
        location: typeof bookingRaw.location === 'string' ? bookingRaw.location.trim() : undefined,
        description:
          typeof bookingRaw.description === 'string' ? bookingRaw.description.trim() : undefined,
      }
    : undefined;

  const input: DeliverShareInput = {
    kind: kind === 'work' ? 'work' : kind,
    channel,
    recipient,
    url: typeof body.url === 'string' ? body.url.trim() : undefined,
    message: typeof body.message === 'string' ? body.message.trim() : undefined,
    jobSlug: typeof body.jobSlug === 'string' ? body.jobSlug.trim() : undefined,
    tab: typeof body.tab === 'string' ? body.tab.trim() : kind === 'work' ? 'work' : undefined,
    booking,
    template: typeof body.template === 'string' ? body.template.trim() : undefined,
    docTitle: typeof body.docTitle === 'string' ? body.docTitle.trim() : undefined,
    sentBy: userId,
    request: context.request,
  };

  const result = await deliverShare(input);
  if (!result.ok) return json(result, 400);
  return json(result);
}
