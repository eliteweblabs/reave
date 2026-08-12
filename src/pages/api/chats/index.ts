/**
 * GET  /api/chats — list chat threads for the signed-in user
 * POST /api/chats — create a new empty thread { sourceEmailId?, sourceJobSlug? }
 */

import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { chatStorageBackend, storeCreateChatThread, storeListChatThreads, storeUpdateChatTitle } from '../../../lib/chatStore';
import { truncateChatTitle } from '../../../lib/chatTypes';
import { storeListChatThreadsForOwner } from '../../../lib/chatOwnerAccess';
import { enrichChatThreadsWithAuthors } from '../../../lib/chatThreadAuthors';
import { storeGetSidebarOrder, sortBySidebarOrder } from '../../../lib/sidebarOrderStore';
import { assignEmailToJob, linkProjectItem, listJobsForItems } from '../../../lib/projectLinks';
import { storeGetEmailInbox } from '../../../lib/emailInboxStore';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;


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
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const archivedOnly = context.url.searchParams.get('archived') === '1';
  const { threads, consolidated } = await storeListChatThreadsForOwner(userId, { archivedOnly });
  const orderMap = await storeGetSidebarOrder('chats');
  const sorted = sortBySidebarOrder(
    threads,
    orderMap,
    (t) => t.id,
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  const enriched = await enrichThreadsWithLinks(sorted);
  const withAuthors = await enrichChatThreadsWithAuthors(enriched);
  return json({
    ok: true,
    threads: withAuthors,
    storage: chatStorageBackend(),
    ...(consolidated > 0 ? { consolidated } : {}),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

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
    const subject = email?.subject?.trim();
    if (subject) {
      const title = truncateChatTitle(subject);
      await storeUpdateChatTitle(userId, thread.id, title);
      thread.title = title;
    }
  } else if (sourceJobSlug) {
    await linkProjectItem(sourceJobSlug, 'chat', thread.id);
  }

  const [enriched] = await enrichThreadsWithLinks([thread]);
  const [withAuthor] = await enrichChatThreadsWithAuthors([enriched]);
  return json({ ok: true, thread: withAuthor, storage: chatStorageBackend() });
}
