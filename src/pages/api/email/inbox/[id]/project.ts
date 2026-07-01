/**
 * POST /api/email/inbox/[id]/project — create a project from email or link to existing
 * Body: { mode: 'create', title?, contact_uid?, client?, body?, status? }
 *    | { mode: 'link', slug }
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox, storeUpdateEmailInbox } from '../../../../../lib/emailInboxStore';
import { assignEmailToJob } from '../../../../../lib/projectLinks';
import {
  isSafeWorkSlug,
  slugFromTitle,
  storeAppendWorkNote,
  storeReadWork,
  storeWriteWork,
} from '../../../../../lib/workStore';
import { parseWorkJobInput } from '../../../../../lib/workJobInput';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function emailProjectBody(ev: {
  from: string;
  subject: string;
  summary: string;
  bodySnippet: string;
}): string {
  const lines = ['## Source email', '', `**From:** ${ev.from || '(unknown)'}`, `**Subject:** ${ev.subject || '(no subject)'}`, ''];
  const summary = ev.summary?.trim();
  const snippet = ev.bodySnippet?.trim();
  if (summary) lines.push(summary);
  if (snippet && snippet !== summary) {
    if (summary) lines.push('');
    lines.push(snippet);
  }
  return lines.join('\n').trim();
}

async function markEmailLinked(id: string, jobTitle: string) {
  return storeUpdateEmailInbox(id, {
    category: 'client',
    action: 'matched',
    status: 'MATCHED',
    routeNote: `Linked to project "${jobTitle}"`,
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const email = await storeGetEmailInbox(id);
  if (!email) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const mode = String(body.mode ?? '').trim().toLowerCase();

  if (mode === 'link') {
    const slug = String(body.slug ?? '').trim();
    if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
    const job = await storeReadWork(slug);
    if (!job) return json({ ok: false, error: 'Project not found' }, 404);

    await assignEmailToJob(id, slug, job.title);
    const note = email.summary?.trim() || email.bodySnippet?.trim();
    if (note) {
      await storeAppendWorkNote(slug, note, {
        subject: email.subject,
        from: email.from,
      });
    }
    const event = await markEmailLinked(id, job.title);
    if (!event) return json({ ok: false, error: 'Failed to update inbox' }, 500);

    return json({
      ok: true,
      mode: 'link',
      slug: job.slug,
      title: job.title,
      event,
    });
  }

  if (mode === 'create') {
    const title = String(body.title ?? email.subject ?? '').trim() || 'New project';
    const parsed = parseWorkJobInput({
      title,
      contact_uid: body.contact_uid ?? email.contactUid ?? '',
      contact_name: body.contact_name ?? email.contactName ?? '',
      client: body.client ?? email.contactName ?? '',
      status: body.status ?? 'inquiry',
      source: body.source ?? 'email',
      body: String(body.body ?? emailProjectBody(email)).trim(),
      record_origin: 'dashboard',
    });
    if ('error' in parsed) return json({ ok: false, error: parsed.error }, 400);

    let slug = String(body.slug ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-');
    if (!slug) slug = slugFromTitle(title);
    if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
    if (await storeReadWork(slug)) return json({ ok: false, error: 'Slug already exists', slug }, 409);

    const result = await storeWriteWork(slug, parsed);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);

    await assignEmailToJob(id, slug, result.doc.title);
    const event = await markEmailLinked(id, result.doc.title);
    if (!event) return json({ ok: false, error: 'Failed to update inbox' }, 500);

    return json({
      ok: true,
      mode: 'create',
      slug: result.doc.slug,
      title: result.doc.title,
      event,
    });
  }

  return json({ ok: false, error: 'mode must be create or link' }, 400);
}
