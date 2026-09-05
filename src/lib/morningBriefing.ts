/**
 * Morning briefing — short at-a-glance copy for the admin dashboard home.
 * Pure helpers so verify scripts can import without Postgres / Clerk.
 */

export type MorningBriefingLine = {
  text: string;
  tone?: 'default' | 'warn' | 'muted';
  /** Admin map tab to open when the line is tapped. */
  mapKey?: string;
};

export type MorningBriefing = {
  greeting: string;
  dateLabel: string;
  lines: MorningBriefingLine[];
  allClear: boolean;
};

export type MorningBriefingTodo = {
  due_date: string;
};

export type MorningBriefingInput = {
  firstName?: string | null;
  now?: Date;
  /** IANA zone for greeting + date (defaults to server local when omitted). */
  timeZone?: string | null;
  stats: {
    reviewsPending: number;
    emailsUnread?: number | null;
    projectsActive: number;
    todosOpen: number;
    uptimeDown?: number | null;
    siteHealthCritical?: number | null;
    billingOverdue?: number | null;
    billingOverdueDue?: number | null;
  };
  eventsTodayCount: number;
  upcomingTodos: MorningBriefingTodo[];
  sleepDeferredCount?: number;
  schedulingConfigured: boolean;
};

function isUtcDateOnlyInstant(raw: string, d: Date): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return true;
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

function parseTodoDueInstant(raw: string): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dueDayKey(raw: string, d: Date): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, day).toDateString();
  }
  if (isUtcDateOnlyInstant(trimmed, d)) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString();
  }
  return d.toDateString();
}

export function countTodosDueTodayAndOverdue(
  todos: MorningBriefingTodo[],
  now = new Date(),
): { dueToday: number; overdue: number } {
  let dueToday = 0;
  let overdue = 0;
  const todayKey = now.toDateString();

  for (const todo of todos) {
    const raw = String(todo.due_date || '').trim();
    if (!raw) continue;
    const d = parseTodoDueInstant(raw);
    if (!d) continue;
    const dueDay = dueDayKey(raw, d);
    if (d.getTime() < now.getTime() && dueDay !== todayKey) {
      overdue += 1;
    } else if (dueDay === todayKey) {
      dueToday += 1;
    }
  }

  return { dueToday, overdue };
}

function hourInTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  if (hour === 24) hour = 0;
  return hour;
}

function timeOfDayGreeting(now: Date, timeZone?: string | null): string {
  const hour = timeZone?.trim()
    ? hourInTimeZone(now, timeZone.trim())
    : now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatBriefingDate(now: Date, timeZone?: string | null): string {
  const tz = timeZone?.trim();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
  });
}

function plural(count: number, singular: string, pluralWord?: string): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${pluralWord ?? `${singular}s`}`;
}

export function buildMorningBriefing(input: MorningBriefingInput): MorningBriefing {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone?.trim() || null;
  const first = String(input.firstName || '').trim();
  const greeting = first
    ? `${timeOfDayGreeting(now, timeZone)}, ${first}`
    : timeOfDayGreeting(now, timeZone);

  const lines: MorningBriefingLine[] = [];
  const { reviewsPending, emailsUnread, projectsActive, uptimeDown, siteHealthCritical, billingOverdue } =
    input.stats;
  const sleepDeferred = Math.max(0, input.sleepDeferredCount ?? 0);
  const { dueToday, overdue } = countTodosDueTodayAndOverdue(input.upcomingTodos, now);
  const eventsToday = Math.max(0, input.eventsTodayCount);

  if (reviewsPending > 0) {
    lines.push({
      text: `${plural(reviewsPending, 'item')} need${reviewsPending === 1 ? 's' : ''} your review`,
      tone: 'warn',
      mapKey: 'email',
    });
  }

  if (sleepDeferred > 0) {
    lines.push({
      text: `${plural(sleepDeferred, 'email')} held overnight during sleep mode`,
      tone: 'warn',
      mapKey: 'email',
    });
  }

  const sitesDown = uptimeDown ?? 0;
  if (sitesDown > 0) {
    lines.push({
      text: `${plural(sitesDown, 'site')} ${sitesDown === 1 ? 'is' : 'are'} down`,
      tone: 'warn',
      mapKey: 'analytics',
    });
  }

  const siteIssues = siteHealthCritical ?? 0;
  if (siteIssues > 0) {
    lines.push({
      text: `${plural(siteIssues, 'site')} ${siteIssues === 1 ? 'has' : 'have'} critical health issues`,
      tone: 'warn',
      mapKey: 'analytics',
    });
  }

  if (overdue > 0) {
    lines.push({
      text: `${plural(overdue, 'overdue task')}`,
      tone: 'warn',
      mapKey: 'todo',
    });
  }

  if (input.schedulingConfigured && eventsToday > 0) {
    lines.push({
      text: `${plural(eventsToday, 'event')} on the calendar today`,
      tone: 'default',
      mapKey: 'schedule',
    });
  }

  if (dueToday > 0) {
    lines.push({
      text: `${plural(dueToday, 'task')} due today`,
      tone: overdue > 0 ? 'warn' : 'default',
      mapKey: 'todo',
    });
  }

  if (projectsActive > 0) {
    lines.push({
      text: `${plural(projectsActive, 'active project')}`,
      tone: 'default',
      mapKey: 'work',
    });
  }

  const unread = emailsUnread ?? 0;
  if (unread > 0 && reviewsPending === 0) {
    lines.push({
      text: `${plural(unread, 'unread email')} in the inbox`,
      tone: 'default',
      mapKey: 'email',
    });
  }

  const overdueInvoices = billingOverdue ?? 0;
  if (overdueInvoices > 0) {
    lines.push({
      text: `${plural(overdueInvoices, 'overdue invoice')}`,
      tone: 'warn',
      mapKey: 'billing',
    });
  }

  const allClear = lines.length === 0;
  if (allClear) {
    lines.push({
      text: input.schedulingConfigured
        ? 'You’re all caught up — nothing urgent on the calendar or task list.'
        : 'You’re all caught up for now.',
      tone: 'muted',
    });
  }

  return {
    greeting,
    dateLabel: formatBriefingDate(now, timeZone),
    lines,
    allClear,
  };
}
