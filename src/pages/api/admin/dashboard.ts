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
import {
  loadDashboardReviewNotifications,
  scheduleHealStaleDashboardReviewSlugs,
} from '../../../lib/dashboardReviewNotifications';
import { getDeployStatus } from '../../../lib/deployStatus';
import { syncRecentUptimeIncidentsToPushAlerts } from '../../../lib/uptimePushAlertSync';
import { bookingDashboardSlice } from '../../../lib/bookingClient';
import { storeListWork } from '../../../lib/workStore';
import { isTodoDbConfigured, storeListTodos } from '../../../lib/todoStore';
import { getUptimeSummaryView, getUptimeMonitorsView, getUptimeAccountView, syncUptimeMonitorsFromApiIfStale } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { ensureEmailCleanupScheduler } from '../../../lib/emailCleanupScheduler';
import { ensureSeededInboxClearedOnLiveEmail } from '../../../lib/seededInboxCleanup';
import { ensureCalcomIdentityScheduler } from '../../../lib/calcomIdentitySync';
import { ensureCalendarReminderScheduler } from '../../../lib/calendarReminderScheduler';
import { ensureOnlineReviewsScheduler } from '../../../lib/onlineReviewsScheduler';
import { ensureSocialLeadScannerScheduler } from '../../../lib/socialLeadScannerScheduler';
import { enrichUptimeMonitorView } from '../../../lib/uptimerobotClient';
import { hasFeature } from '../../../lib/features';
import { craterBillingDashboardStats, isCraterConfigured, type BillingDashboardStats } from '../../../lib/craterClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  buildAnalyticsDashboardPreview,
  peekCachedAnalyticsDashboardPreview,
  type AnalyticsFleetPreview,
} from '../../../lib/analyticsFleet';
import { isPlausibleConfigured } from '../../../lib/plausibleClient';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { jsonResponse } from '../../../lib/apiResponse';
import { mergeDashboardSiteCards } from '../../../lib/analyticsSiteMerge';
import {
  peekCachedSiteHealthFleet,
  scheduleSiteHealthFleetRefresh,
  type SiteHealthFleet,
} from '../../../lib/siteHealthGrade';
import { buildMorningBriefing, type MorningBriefing } from '../../../lib/morningBriefing';
import { storeListSleepDeferredEmails } from '../../../lib/emailInboxStore';

export const prerender = false;

function dashboardGreetingFirstName(context: APIContext): string {
  const claims = context.locals.auth().sessionClaims as Record<string, unknown> | null | undefined;
  if (!claims) return '';
  for (const key of ['first_name', 'firstName', 'given_name']) {
    const v = claims[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}


async function loadClientsTotal(): Promise<number | null> {
  if (!isContactApiConfigured()) return null;
  const listed = await listContacts({ limit: 1 });
  return listed.ok ? listed.data.total : null;
}

async function loadTodoSlice(): Promise<{ todosOpen: number; upcomingTodos: DashboardUpcomingTodo[] }> {
  if (!isTodoDbConfigured()) return { todosOpen: 0, upcomingTodos: [] };
  const allOpen = await storeListTodos({ status: 'open' });
  return {
    todosOpen: allOpen.length,
    upcomingTodos: await loadUpcomingTodosFromOpen(allOpen),
  };
}

async function loadUptimeSlice(): Promise<{
  uptime: Awaited<ReturnType<typeof getUptimeSummaryView>> | null;
  uptimeMonitors: Awaited<ReturnType<typeof getUptimeMonitorsView>>['monitors'];
  uptimeAccount: Awaited<ReturnType<typeof getUptimeAccountView>> | null;
}> {
  if (!hasFeature('uptime_monitoring')) {
    return { uptime: null, uptimeMonitors: [], uptimeAccount: null };
  }
  ensureUptimePollScheduler();
  await syncUptimeMonitorsFromApiIfStale();
  const [uptime, monitorsView, uptimeAccount] = await Promise.all([
    getUptimeSummaryView(),
    getUptimeMonitorsView(),
    getUptimeAccountView(),
  ]);
  return {
    uptime,
    uptimeMonitors: monitorsView.monitors.map(enrichUptimeMonitorView),
    uptimeAccount,
  };
}

async function loadAnalyticsSlice(
  companyDomain: string,
): Promise<{
  analytics: AnalyticsFleetPreview | null;
  analyticsConfigured: boolean;
}> {
  const analyticsConfigured = isPlausibleConfigured();
  if (!analyticsConfigured) {
    return { analytics: null, analyticsConfigured: false };
  }
  const cached = peekCachedAnalyticsDashboardPreview(companyDomain, { allowStale: true });
  const fresh = peekCachedAnalyticsDashboardPreview(companyDomain);
  void buildAnalyticsDashboardPreview(companyDomain, { fresh: !fresh }).catch((e) => {
    console.error('[dashboard] analytics preview failed:', e instanceof Error ? e.message : e);
  });
  return { analytics: cached, analyticsConfigured };
}

async function loadBillingSlice(): Promise<{
  billing: BillingDashboardStats | null;
  billingError: string | null;
  billingConfigured: boolean;
}> {
  const billingConfigured = hasFeature('billing') && isCraterConfigured();
  if (!billingConfigured) {
    return { billing: null, billingError: null, billingConfigured: false };
  }
  const out = await craterBillingDashboardStats();
  if (out.ok) return { billing: out.data, billingError: null, billingConfigured };
  console.error('[dashboard] craterBillingDashboardStats failed:', out.error);
  return { billing: null, billingError: out.error, billingConfigured };
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

async function loadUpcomingTodosFromOpen(
  allOpen: Awaited<ReturnType<typeof storeListTodos>>,
  limit = 24,
): Promise<DashboardUpcomingTodo[]> {
  return allOpen
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
  await ensureSeededInboxClearedOnLiveEmail().catch(() => undefined);
  ensureCalendarReminderScheduler();
  ensureCalcomIdentityScheduler();
  ensureOnlineReviewsScheduler();
  ensureSocialLeadScannerScheduler();
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
  const { notifications: automationNotifications, staleSlugs } =
    await loadDashboardReviewNotifications({ events, jobs });
  scheduleHealStaleDashboardReviewSlugs(staleSlugs);
  const reviewsPending = automationNotifications.length;

  const projectsPending = jobs.filter(
    (j) => j.status === 'inquiry' || j.status === 'audit' || j.status === 'active',
  ).length;
  const projectsActive = jobs.filter((j) => j.status === 'active').length;

  const recentEmails = events.filter(isEmailInboxActive).slice(0, 5).map((e) => ({
    id: e.id,
    subject: e.subject || '(no subject)',
    from: e.from || '',
    receivedAt: e.receivedAt,
    category: e.category,
  }));

  const company = await getCompanyConfig(context.request);
  const [clientsTotal, bookingSlice, todoSlice, uptimeSlice, billingSlice, analyticsSlice] =
    await Promise.all([
      loadClientsTotal(),
      bookingDashboardSlice(),
      loadTodoSlice(),
      loadUptimeSlice(),
      loadBillingSlice(),
      loadAnalyticsSlice(company.domain),
    ]);
  const { eventsToday, eventsNext24h, meetingsTotal, configured: schedulingConfigured } =
    bookingSlice;
  const { todosOpen, upcomingTodos } = todoSlice;
  const { uptime, uptimeMonitors, uptimeAccount } = uptimeSlice;
  const { billing, billingError, billingConfigured } = billingSlice;
  const { analytics, analyticsConfigured } = analyticsSlice;

  const siteCards = mergeDashboardSiteCards(uptimeMonitors, analytics?.sites ?? []);
  const siteHealthCached = peekCachedSiteHealthFleet({ allowStale: true });
  scheduleSiteHealthFleetRefresh(
    siteCards.map((card) => ({
      siteId: card.siteId,
      website: card.analytics?.website ?? null,
      monitor: card.monitor,
      analytics: card.analytics,
    })),
  );
  const siteHealth: SiteHealthFleet | null = siteHealthCached;

  const firstName = dashboardGreetingFirstName(context);
  const sleepDeferred = await storeListSleepDeferredEmails(50);
  const briefing: MorningBriefing = buildMorningBriefing({
    firstName,
    stats: {
      reviewsPending,
      emailsUnread: inboxDigest.unread ?? digest.unread,
      projectsActive,
      todosOpen,
      uptimeDown: uptime?.summary?.down ?? null,
      siteHealthCritical: siteHealth?.criticalSites ?? null,
      billingOverdue: billing?.overdueCount ?? null,
      billingOverdueDue: billing?.overdueDue ?? null,
    },
    eventsTodayCount: eventsToday.length,
    upcomingTodos,
    sleepDeferredCount: sleepDeferred.length,
    schedulingConfigured,
  });

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    briefing,
    stats: {
      emails: reviewsPending,
      emailsTotal,
      emailsUnread: inboxDigest.unread ?? digest.unread,
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
      billingOverdueDue: billing?.overdueDue ?? null,
      billingRecurring: billing?.recurringActive ?? null,
      analyticsVisitors: analytics?.visitors ?? null,
      analyticsRealtime: analytics?.realtimeVisitors ?? null,
      analyticsSites: analytics?.siteCount ?? null,
      analyticsUnregistered: analytics?.unregisteredCount ?? null,
      siteHealthCritical: siteHealth?.criticalSites ?? null,
      siteHealthCheckedAt: siteHealth?.checkedAt ?? null,
    },
    recentEmails,
    automationNotifications,
    eventsToday,
    eventsNext24h,
    upcomingTodos,
    schedulingConfigured,
    billingConfigured,
    billingError,
    analyticsConfigured,
    analytics,
    siteHealth,
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
