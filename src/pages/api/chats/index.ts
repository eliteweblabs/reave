/**
 * GET  /api/chats — list chat threads for the signed-in user
 * POST /api/chats — create a new empty thread { sourceEmailId?, sourceJobSlug? }
 */

import type { APIContext } from 'astro';
import { chatStorageBackend, storeCreateChatThread, storeListChatThreads } from '../../../lib/chatStore';
import { assignEmailToJob, linkProjectItem, listJobsForItems } from '../../../lib/projectLinks';
import { storeGetEmailInbox } from '../../../lib/emailInboxStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function enrichThreadsWithLinks(
  threads: Awaited<ReturnType<typeof storeListChatThreads>>,
) {
  const jobMap = await listJobsForItems(
    'chat',
    threads.map((t) => t.id),
  );
  return threads.map((t) => ({
    ...t,
    linked_jobs: jobMap.get(t.id) ?? [],
  }));
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const archivedOnly = context.url.searchParams.get('archived') === '1';
  const threads = await storeListChatThreads(userId, { archivedOnly });
  const enriched = await enrichThreadsWithLinks(threads);
  return json({ ok: true, threads: enriched, storage: chatStorageBackend() });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try {
    const text = await context.request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const sourceEmailId = String(body.sourceEmailId ?? body.source_email_id ?? '').trim() || null;
  const sourceJobSlug = String(body.sourceJobSlug ?? body.source_job_slug ?? '').trim() || null;

  const thread = await storeCreateChatThread(userId, { sourceEmailId });
  if (!thread) return json({ ok: false, error: 'Failed to create chat' }, 500);

  if (sourceEmailId) {
    const email = await storeGetEmailInbox(sourceEmailId);
    const jobSlug = sourceJobSlug || email?.jobSlug?.trim() || null;
    if (jobSlug) {
      await linkProjectItem(jobSlug, 'chat', thread.id);
      if (email && !email.jobSlug) {
        await assignEmailToJob(sourceEmailId, jobSlug);
      }
    }
  } else if (sourceJobSlug) {
    await linkProjectItem(sourceJobSlug, 'chat', thread.id);
  }

  const [enriched] = await enrichThreadsWithLinks([thread]);
  return json({ ok: true, thread: enriched, storage: chatStorageBackend() });
}
