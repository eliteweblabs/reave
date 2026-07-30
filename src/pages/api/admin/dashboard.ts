/**
 * GET /api/admin/dashboard — aggregated at-a-glance stats for the home dashboard.
 */

import type { APIContext } from 'astro';
import { storeListChatThreads } from '../../../lib/chatStore';
import { listContacts, isContactApiConfigured } from '../../../lib/contactApi';
import {
  computeInboxDigest,
  isEmailInboxActive,
  storeEmailInboxDigest,
  storeListEmailInbox,
} from '../../../lib/emailInboxStore';
import { countReviewNotifications, listReviewNotifications } from '../../../lib/emailAutomation';
import {
  countProjectCommentNotifications,
  listProjectCommentNotifications,
} from '../../../lib/workCommentNotifications';
import {
  countEngagementNotifications,
  listEngagementNotifications,
} from '../../../lib/engagementNotifications';
import {
  countPushAlertNotifications,
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
import { isTodoDbConfigured, storeListTodos } from '../../../lib/todoStore';
import { getUptimeSummaryView, getUptimeMonitorsView, getUptimeAccountView, syncUptimeMonitorsFromApiIfStale } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { enrichUptimeMonitorView } from '../../../lib/uptimerobotClient';
import { hasFeature } from '../../../lib/features';
import { craterBillingDashboardStats, isCraterConfigured, type BillingDashboardStats } from '../../../lib/craterClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

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

  await syncRecentUptimeIncidentsToPushAlerts().catch(() => undefined);

  const [events, inboxDigest, jobs, threads, deploy] = await Promise.all([
    storeListEmailInbox(100, { hideJunk: true }),
    storeEmailInboxDigest(true),
    storeListWork(),
    storeListChatThreads(userId, { archivedOnly: false }),
    getDeployStatus().catch(() => null),
  ]);

  const digest = computeInboxDigest(events, true);
  const emailsTotal = inboxDigest.visible;
  const projectsTotal = jobs.length;
  const [
    emailNotifications,
    commentNotifications,
    engagementNotifications,
    pushAlertNotifications,
    commentReviewsPending,
    engagementReviewsPending,
    pushAlertsPending,
  ] = await Promise.all([
    Promise.resolve(listReviewNotifications(events)),
    listProjectCommentNotifications(),
    listEngagementNotifications(),
    listPushAlertNotifications(),
    countProjectCommentNotifications(),
    countEngagementNotifications(),
    countPushAlertNotifications(),
  ]);
  const automationNotifications = [
    ...emailNotifications,
    ...commentNotifications,
    ...engagementNotifications,
    ...pushAlertNotifications,
  ].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const emailReviewsPending = countReviewNotifications(events);
  const reviewsPending =
    emailReviewsPending + commentReviewsPending + engagementReviewsPending + pushAlertsPending;

  const projectsPending = jobs.filter((j) => j.status === 'inquiry' || j.status === 'active').length;
  const projectsActive = jobs.filter((j) => j.status === 'active').length;

  let clientsTotal: number | null = null;
  if (isContactApiConfigured()) {
    const listed = await listContacts({ limit: 1 });
    if (listed.ok) clientsTotal = listed.data.total;
  }

  const recentEmails = inboxForCount.filter(isEmailInboxActive).slice(0, 5).map((e) => ({
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
    const allOpen = await storeListTodos({ status: 'open' });
    todosOpen = allOpen.length;
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
