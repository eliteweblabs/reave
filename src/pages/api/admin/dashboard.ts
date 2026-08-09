/**
 * GET /api/admin/dashboard — aggregated at-a-glance stats for the admin dashboard.
 */

import type { APIContext } from 'astro';
import { storeListChatThreadsForOwner } from '../../../lib/chatOwnerAccess';
import { listContacts, isContactApiConfigured } from '../../../lib/contactApi';
import {
  computeInboxDigest,
  isEmailInboxActive,
  storeEmailInboxDigest,
  storeListEmailInbox,
} from '../../../lib/emailInboxStore';
import { listReviewNotifications } from '../../../lib/emailAutomation';
import { listReceiptExpenseNotifications } from '../../../lib/emailReceiptExpense';
import {
  listProjectCommentNotifications,
} from '../../../lib/workCommentNotifications';
import {
  listEngagementNotifications,
} from '../../../lib/engagementNotifications';
import {
  listPushAlertNotifications,
} from '../../../lib/pushAlertNotifications';
import { getDeployStatus } from '../../../lib/deployStatus';
import { syncRecentUptimeIncidentsToPushAlerts } from '../../../lib/uptimePushAlertSync';
import {
  bookingList,
  bookingsToday,
  bookingsNext24Hours,
  isBookingConfigured,
  type DashboardEvent,
} from '../../../lib/bookingClient';
import { storeListWork } from '../../../lib/workStore';
import { isTodoDbConfigured, storeListTodos, storeCountOpenTodos } from '../../../lib/todoStore';
import { getUptimeSummaryView, getUptimeMonitorsView, getUptimeAccountView, syncUptimeMonitorsFromApiIfStale } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { ensureEmailCleanupScheduler } from '../../../lib/emailCleanupScheduler';
import { enrichUptimeMonitorView } from '../../../lib/uptimerobotClient';
import { hasFeature } from '../../../lib/features';
import { craterBillingDashboardStats, isCraterConfigured, type BillingDashboardStats } from '../../../lib/craterClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  healStaleWorkNotificationSlugs,
  partitionNotificationsByExistingWork,
} from '../../../lib/notificationWorkLinks';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function loadEventsToday(): Promise<DashboardEvent[]> {
  if (!isBookingConfigured()) return [];
  const out = await bookingsToday();
  if (!out.ok) {
    console.error('[dashboard] bookingsToday failed:', out.error);
    return [];
  }
  return out.data.events;
}

async function loadEventsNext24Hours(): Promise<DashboardEvent[]> {
  if (!isBookingConfigured()) return [];
  const out = await bookingsNext24Hours();
  if (!out.ok) {
    console.error('[dashboard] bookingsNext24Hours failed:', out.error);
    return [];
  }
  return out.data.events;
}

export type DashboardUpcomingTodo = {
  id: number;
  title: string;
  due_date: string;
  priority: string;
  section: string | null;
  job_slug: string | null;
  assignee: string | null;
};

async function loadUpcomingTodos(limit = 24): Promise<DashboardUpcomingTodo[]> {
  if (!isTodoDbConfigured()) return [];
  const todos = await storeListTodos({ status: 'open' });
  return todos
    .filter((t): t is typeof t & { due_date: string } => Boolean(t.due_date))
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      priority: t.priority,
      section: t.section,
      job_slug: t.job_slug,
      assignee: t.assignee,
    }));
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  ensureEmailCleanupScheduler();
  await syncRecentUptimeIncidentsToPushAlerts().catch(() => undefined);

  const [{ threads }, events, inboxDigest, jobs, deploy] = await Promise.all([
    storeListChatThreadsForOwner(userId, { archivedOnly: false }),
    storeListEmailInbox(100, { hideJunk: true }),
    storeEmailInboxDigest(true),
    storeListWork(),
    getDeployStatus().catch(() => null),
  ]);
  const digest = computeInboxDigest(events, true);
  const emailsTotal = inboxDigest.visible;
  const projectsTotal = jobs.length;
  const [
    emailNotifications,
    receiptExpenseNotifications,
    commentNotifications,
    engagementNotifications,
    pushAlertNotifications,
  ] = await Promise.all([
    Promise.resolve(listReviewNotifications(events)),
    Promise.resolve(listReceiptExpenseNotifications(events)),
    listProjectCommentNotifications(),
    listEngagementNotifications(),
    listPushAlertNotifications(),
  ]);
  const validWorkSlugs = new Set(jobs.map((j) => j.slug));
  const mergedNotifications = [
    ...emailNotifications,
    ...receiptExpenseNotifications,
    ...commentNotifications,
    ...engagementNotifications,
    ...pushAlertNotifications,
  ].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const { kept: automationNotifications, staleSlugs } = partitionNotificationsByExistingWork(
    mergedNotifications,
    validWorkSlugs,
  );
  if (staleSlugs.size > 0) {
    void healStaleWorkNotificationSlugs(staleSlugs);
  }
  const reviewsPending = automationNotifications.length;

  const projectsPending = jobs.filter((j) => j.status === 'inquiry' || j.status === 'active').length;
  const projectsActive = jobs.filter((j) => j.status === 'active').length;

  let clientsTotal: number | null = null;
  if (isContactApiConfigured()) {
    const listed = await listContacts({ limit: 1 });
    if (listed.ok) clientsTotal = listed.data.total;
  }

  const recentEmails = events.filter(isEmailInboxActive).slice(0, 5).map((e) => ({
    id: e.id,
    subject: e.subject || '(no subject)',
    from: e.from || '',
    receivedAt: e.receivedAt,
    category: e.category,
  }));

  const eventsToday = await loadEventsToday();
  const eventsNext24h = await loadEventsNext24Hours();
  const upcomingTodos = await loadUpcomingTodos();
  const schedulingConfigured = isBookingConfigured();

  // Count open todos from DB (not legacy markdown files)
  let todosOpen = 0;
  if (isTodoDbConfigured()) {
    todosOpen = await storeCountOpenTodos();
  }

  let meetingsTotal: number | null = null;
  if (schedulingConfigured) {
    const [upcomingRes, pastRes] = await Promise.all([
      bookingList({ upcoming: true, status: 'accepted', limit: 500 }),
      bookingList({ upcoming: false, status: 'accepted', limit: 500 }),
    ]);
    if (upcomingRes.ok && pastRes.ok) {
      const seen = new Set<string>();
      for (const b of [...upcomingRes.data.bookings, ...pastRes.data.bookings]) {
        seen.add(b.uid);
      }
      meetingsTotal = seen.size;
    }
  }

  let uptime: Awaited<ReturnType<typeof getUptimeSummaryView>> | null = null;
  let uptimeMonitors: Awaited<ReturnType<typeof getUptimeMonitorsView>>['monitors'] = [];
  let uptimeAccount: Awaited<ReturnType<typeof getUptimeAccountView>> | null = null;
  if (hasFeature('uptime_monitoring')) {
    ensureUptimePollScheduler();
    await syncUptimeMonitorsFromApiIfStale();
    uptime = await getUptimeSummaryView();
    const monitorsView = await getUptimeMonitorsView();
    uptimeMonitors = monitorsView.monitors.map(enrichUptimeMonitorView);
    uptimeAccount = await getUptimeAccountView();
  }

  const billingConfigured = hasFeature('billing') && isCraterConfigured();
  let billing: BillingDashboardStats | null = null;
  let billingError: string | null = null;
  if (billingConfigured) {
    const out = await craterBillingDashboardStats();
    if (out.ok) {
      billing = out.data;
    } else {
      billingError = out.error;
      console.error('[dashboard] craterBillingDashboardStats failed:', out.error);
    }
  }

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    stats: {
      emails: reviewsPending,
      emailsTotal,
      emailsReview: digest.review,
      reviewsPending,
      automationPending: reviewsPending,
      eventsToday: eventsToday.length,
      meetingsTotal,
      projectsPending,
      projectsActive,
      projectsTotal,
      todosOpen,
      clients: clientsTotal,
      chats: threads.filter((t) => !t.archived).length,
      deployState: deploy?.state ?? 'unknown',
      deployUpToDate: deploy?.up_to_date ?? null,
      uptimeDown: uptime?.summary?.down ?? null,
      uptimeOpenIncidents: uptime?.summary?.open_incidents ?? null,
      billingTotalDue: billing?.totalDue ?? null,
      billingOutstanding: billing?.outstandingCount ?? null,
      billingOverdue: billing?.overdueCount ?? null,
      billingRecurring: billing?.recurringActive ?? null,
    },
    recentEmails,
    automationNotifications,
    eventsToday,
    eventsNext24h,
    upcomingTodos,
    schedulingConfigured,
    billingConfigured,
    billingError,
    uptime,
    uptimeMonitors,
    uptimeAccount,
    deploy: deploy
      ? {
          state: deploy.state,
          upToDate: deploy.up_to_date,
          deployedShort: deploy.deployed_short,
        }
      : null,
  });
}
