/**
 * GET /api/admin/dashboard — aggregated at-a-glance stats for the home dashboard.
 */

import type { APIContext } from 'astro';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { storeListChatThreads } from '../../../lib/chatStore';
import { listContacts, isContactApiConfigured } from '../../../lib/contactApi';
import { computeInboxDigest, storeListEmailInbox } from '../../../lib/emailInboxStore';
import { countReviewNotifications, listReviewNotifications } from '../../../lib/emailAutomation';
import { getDeployStatus } from '../../../lib/deployStatus';
import {
  bookingList,
  bookingsToday,
  isBookingConfigured,
  type DashboardEvent,
} from '../../../lib/bookingClient';
import { storeListWork } from '../../../lib/workStore';
import { getUptimeSummaryView, getUptimeMonitorsView, getUptimeAccountView } from '../../../lib/uptimeMonitoring';
import { ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { hasFeature } from '../../../lib/features';
import { craterBillingDashboardStats, isCraterConfigured, type BillingDashboardStats } from '../../../lib/craterClient';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function countOpenTodos(): number {
  const dir = process.env.TODO_DIR?.trim() || join(projectRoot(), 'src', 'knowledge', 'todo');
  if (!existsSync(dir)) return 0;
  const itemRe = /^- \[([ xX])\] /;
  let open = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const content = readFileSync(join(dir, file), 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(itemRe);
      if (m && m[1].toLowerCase() !== 'x') open += 1;
    }
  }
  return open;
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

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const [events, inboxForCount, jobs, threads, deploy] = await Promise.all([
    storeListEmailInbox(100, { hideJunk: true }),
    storeListEmailInbox(10_000, { hideJunk: true, forDigest: true }),
    storeListWork(),
    storeListChatThreads(userId, { archivedOnly: false }),
    getDeployStatus().catch(() => null),
  ]);

  const digest = computeInboxDigest(events, true);
  const emailsTotal = computeInboxDigest(inboxForCount, true).visible;
  const projectsTotal = jobs.length;
  const automationNotifications = listReviewNotifications(events);
  const reviewsPending = countReviewNotifications(events);

  const projectsPending = jobs.filter((j) => j.status === 'inquiry' || j.status === 'active').length;
  const projectsActive = jobs.filter((j) => j.status === 'active').length;

  let clientsTotal: number | null = null;
  if (isContactApiConfigured()) {
    const listed = await listContacts({ limit: 1 });
    if (listed.ok) clientsTotal = listed.data.total;
  }

  const recentEmails = events.slice(0, 5).map((e) => ({
    id: e.id,
    subject: e.subject || '(no subject)',
    from: e.from || '',
    receivedAt: e.receivedAt,
    category: e.category,
  }));

  const eventsToday = await loadEventsToday();
  const schedulingConfigured = isBookingConfigured();

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
    uptime = await getUptimeSummaryView();
    const monitorsView = await getUptimeMonitorsView();
    uptimeMonitors = monitorsView.monitors;
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
      todosOpen: countOpenTodos(),
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
