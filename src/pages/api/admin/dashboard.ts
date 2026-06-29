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
import { getDeployStatus } from '../../../lib/deployStatus';
import { bookingsToday, isBookingConfigured } from '../../../lib/bookingClient';
import { storeListWork } from '../../../lib/workStore';

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

/** Sample events when Cal.com booking API is not configured. */
function mockEventsToday() {
  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const base = `${y}-${mo}-${d}`;
  return [
    {
      id: 'mock-1',
      time: `${base}T10:00:00`,
      title: 'Client check-in — site review',
      type: 'call',
      mock: true,
    },
    {
      id: 'mock-2',
      time: `${base}T14:00:00`,
      title: 'Launch QA walkthrough',
      type: 'meeting',
      mock: true,
    },
    {
      id: 'mock-3',
      time: `${base}T16:30:00`,
      title: 'Send revised proposal',
      type: 'task',
      mock: true,
    },
  ];
}

async function loadEventsToday(): Promise<{ events: ReturnType<typeof mockEventsToday>; mock: boolean }> {
  if (!isBookingConfigured()) {
    return { events: mockEventsToday(), mock: true };
  }
  const out = await bookingsToday();
  if (!out.ok || !out.data.configured) {
    return { events: mockEventsToday(), mock: true };
  }
  return { events: out.data.events, mock: false };
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const [events, jobs, threads, deploy] = await Promise.all([
    storeListEmailInbox(100, { hideJunk: true }),
    storeListWork(),
    storeListChatThreads(userId, { archivedOnly: false }),
    getDeployStatus().catch(() => null),
  ]);

  const digest = computeInboxDigest(events, true);
  const emailsNeedingAttention = events.filter(
    (e) => e.category !== 'junk' && e.action !== 'filed',
  ).length;

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

  const { events: eventsToday, mock: eventsMock } = await loadEventsToday();

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    stats: {
      emails: emailsNeedingAttention,
      emailsReview: digest.review,
      eventsToday: eventsToday.length,
      projectsPending,
      projectsActive,
      todosOpen: countOpenTodos(),
      clients: clientsTotal,
      chats: threads.filter((t) => !t.archived).length,
      deployState: deploy?.state ?? 'unknown',
      deployUpToDate: deploy?.up_to_date ?? null,
    },
    recentEmails,
    eventsToday,
    eventsMock,
    schedulingConfigured: isBookingConfigured(),
    deploy: deploy
      ? {
          state: deploy.state,
          upToDate: deploy.up_to_date,
          deployedShort: deploy.deployed_short,
        }
      : null,
  });
}
