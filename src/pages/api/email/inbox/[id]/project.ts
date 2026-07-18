/**
 * POST /api/email/inbox/[id]/project — create a project from email or link to existing
 * Body: { mode: 'create', title?, contact_uid?, client?, body?, status? }
 *    | { mode: 'link', slug }
 *
 * Email content is merged into project notes via Claude (not raw append).
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox, storeUpdateEmailInbox } from '../../../../../lib/emailInboxStore';
import { emailToMergeSource, mergeEmailIntoProjectBody, pickMergedProjectValue } from '../../../../../lib/emailProjectMerge';
import { assignEmailToJob } from '../../../../../lib/projectLinks';
import {
  ensureWorkContact,
  isSafeWorkSlug,
  slugFromTitle,
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

async function markEmailLinked(
  id: string,
  jobTitle: string,
  contact?: { uid: string; name: string },
) {
  return storeUpdateEmailInbox(id, {
    category: 'client',
    action: 'matched',
    status: 'MATCHED',
    routeNote: `Linked to project "${jobTitle}"`,
    ...(contact
      ? { contactUid: contact.uid, contactName: contact.name }
      : {}),
  });
}

async function writeMergedBody(
  slug: string,
  job: NonNullable<Awaited<ReturnType<typeof storeReadWork>>>,
  email: ReturnType<typeof emailToMergeSource>,
  isNewProject: boolean,
) {
  const { body, value: extractedValue, usedAi } = await mergeEmailIntoProjectBody({
    existingBody: job.body,
    email,
    projectTitle: job.title,
    isNewProject,
  });

  const mergedValue = pickMergedProjectValue(job.value, extractedValue);

  const result = await storeWriteWork(slug, {
    title: job.title,
    contact_uid: job.contact_uid,
    contact_name: job.contact_name,
    status: job.status,
    priority: job.priority,
    due_date: job.due_date,
    ...(mergedValue !== undefined ? { value: mergedValue } : {}),
    tags: job.tags,
    source: job.source,
    body,
    record_origin: job.record_origin,
  });

  return { result, usedAi };
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const emailRecord = await storeGetEmailInbox(id);
  if (!emailRecord) return json({ ok: false, error: 'Not found' }, 404);

  const email = emailToMergeSource(emailRecord);

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

    const { result, usedAi } = await writeMergedBody(slug, job, email, false);
    if (!result.ok) return json({ ok: false, error: result.error }, 400);

    await assignEmailToJob(id, slug, job.title);
    const event = await markEmailLinked(id, job.title);
    if (!event) return json({ ok: false, error: 'Failed to update inbox' }, 500);

    return json({
      ok: true,
      mode: 'link',
      slug: job.slug,
      title: job.title,
      usedAi,
      event,
    });
  }

  if (mode === 'create') {
    const title = String(body.title ?? emailRecord.subject ?? '').trim() || 'New project';

    const contact = await ensureWorkContact({
      contact_uid: (body.contact_uid as string | undefined) ?? emailRecord.contactUid,
      contact_name: (body.contact_name as string | undefined) ?? emailRecord.contactName,
      client: (body.client as string | undefined) ?? emailRecord.contactName,
      from: emailRecord.from,
    });
    if (!contact.ok) return json({ ok: false, error: contact.error }, 400);

    const parsed = parseWorkJobInput({
      title,
      contact_uid: contact.uid,
      contact_name: contact.name,
      status: body.status ?? 'inquiry',
      source: body.source ?? 'email',
      body: '',
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

    const { body: mergedBody, value: extractedValue, usedAi } = await mergeEmailIntoProjectBody({
      existingBody: '',
      email,
      projectTitle: title,
      isNewProject: true,
    });

    const mergedValue = pickMergedProjectValue(null, extractedValue);

    const result = await storeWriteWork(slug, {
      ...parsed,
      body: mergedBody,
      ...(mergedValue !== undefined ? { value: mergedValue } : {}),
    });
    if (!result.ok) return json({ ok: false, error: result.error }, 400);

    await assignEmailToJob(id, slug, result.doc.title);
    const event = await markEmailLinked(id, result.doc.title, {
      uid: contact.uid,
      name: contact.name,
    });
    if (!event) return json({ ok: false, error: 'Failed to update inbox' }, 500);

    return json({
      ok: true,
      mode: 'create',
      slug: result.doc.slug,
      title: result.doc.title,
      usedAi,
      contactCreated: contact.created,
      event,
    });
  }

  return json({ ok: false, error: 'mode must be create or link' }, 400);
}
