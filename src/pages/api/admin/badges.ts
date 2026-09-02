/**
 * GET /api/admin/badges — lightweight footer badge counts (avoids full dashboard aggregation).
 */

import type { APIContext } from 'astro';
import { storeListChatThreadsForOwner } from '../../../lib/chatOwnerAccess';
import { listContacts, isContactApiConfigured } from '../../../lib/contactApi';
import { storeEmailInboxDigest } from '../../../lib/emailInboxStore';
import { getReviewsPendingCount } from '../../../lib/reviewsPendingCount';
import { storeListWork } from '../../../lib/workStore';
import { isTodoDbConfigured, storeListTodos } from '../../../lib/todoStore';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const [{ threads }, inboxDigest, jobs, reviewsPending] = await Promise.all([
    storeListChatThreadsForOwner(userId, { archivedOnly: false }),
    storeEmailInboxDigest(true),
    storeListWork(),
    getReviewsPendingCount(),
  ]);

  let todosOpen = 0;
  if (isTodoDbConfigured()) {
    const allOpen = await storeListTodos({ status: 'open' });
    todosOpen = allOpen.length;
  }

  let clientsTotal: number | null = null;
  if (isContactApiConfigured()) {
    const listed = await listContacts({ limit: 1 });
    if (listed.ok) clientsTotal = listed.data.total;
  }

  const projectsPending = jobs.filter(
    (j) => j.status === 'inquiry' || j.status === 'audit' || j.status === 'active',
  ).length;

  return jsonResponse({
    ok: true,
    stats: {
      reviewsPending,
      automationPending: reviewsPending,
      chats: threads.filter((t) => !t.archived).length,
      emailsTotal: inboxDigest.visible,
      emails: inboxDigest.visible,
      emailsUnread: inboxDigest.unread,
      meetingsTotal: null,
      projectsTotal: jobs.length,
      projectsPending,
      todosOpen,
      clients: clientsTotal,
    },
  });
}
