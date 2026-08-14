/**
 * Human-readable scheduled-email grouping and copy for the dashboard,
 * project Email tab, and agent briefing.
 *
 * Kept free of store/template/booking imports so unit checks can load it
 * without the full app graph.
 */

export type ScheduledSendInput = {
  id: string;
  templateId: string;
  source: string;
  trigger?: string;
  status: string;
  dueAt: string;
  createdAt: string;
  subject: string;
  toEmail: string;
  firstName: string;
  contactUid: string | null;
  jobSlug: string | null;
  campaignId: string | null;
  context?: Record<string, unknown>;
};

export type ScheduledEmailKind = 'single' | 'broadcast';

export interface ScheduledEmailItem {
  id: string;
  kind: ScheduledEmailKind;
  campaignId: string | null;
  sendIds: string[];
  templateId: string;
  templateLabel: string;
  source: string;
  subject: string;
  toLabel: string;
  toEmail: string | null;
  contactUid: string | null;
  firstName: string;
  recipientCount: number;
  dueAt: string;
  jobSlug: string | null;
  jobTitle: string | null;
  title: string;
  detail: string;
  reviewPrompt: boolean;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TEMPLATE_LABELS: Record<string, string> = {
  user_welcome: 'User welcome',
  user_followup: 'User follow-up',
  project_complete: 'Project complete follow-up',
  review_request: 'Leave us a review',
  value_your_opinion: 'We value your opinion',
  reengagement: 'Re-engagement ("we miss you")',
  referral_request: 'Referral request',
  announcement: 'Announcement',
  newsletter_update: 'Newsletter / roundup',
  seasonal_promo: 'Seasonal promo / offer',
  thank_you: 'Thank you / appreciation',
};

const TEMPLATE_ALIASES: Record<string, string> = {
  'we value your opinion': 'value_your_opinion',
  'value your opinion': 'value_your_opinion',
  'your opinion': 'value_your_opinion',
  feedback: 'value_your_opinion',
  review: 'review_request',
  'leave us a review': 'review_request',
  'review request': 'review_request',
  newsletter: 'newsletter_update',
  'fall newsletter': 'newsletter_update',
  'the fall newsletter': 'newsletter_update',
  roundup: 'newsletter_update',
  welcome: 'user_welcome',
  'follow up': 'user_followup',
  followup: 'user_followup',
  'project complete': 'project_complete',
  'thank you': 'thank_you',
  thanks: 'thank_you',
  announcement: 'announcement',
  promo: 'seasonal_promo',
  referral: 'referral_request',
  'we miss you': 'reengagement',
};

function displayTz(): string {
  return process.env.BOOKING_TIMEZONE?.trim() || 'America/New_York';
}

function partsInTz(iso: string, now = new Date()): {
  due: Date;
  hour: number;
  minute: number;
  weekday: number;
  dayKey: string;
  nowDayKey: string;
} {
  const due = new Date(iso);
  const tz = displayTz();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const read = (d: Date) => {
    const bag: Record<string, string> = {};
    for (const p of fmt.formatToParts(d)) {
      if (p.type !== 'literal') bag[p.type] = p.value;
    }
    return bag;
  };
  const dueBag = read(due);
  const nowBag = read(now);
  const hour = Number(dueBag.hour);
  const minute = Number(dueBag.minute);
  const weekdayName = dueBag.weekday || '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  return {
    due,
    hour: Number.isFinite(hour) ? hour : due.getHours(),
    minute: Number.isFinite(minute) ? minute : due.getMinutes(),
    weekday: weekday >= 0 ? weekday : due.getDay(),
    dayKey: `${dueBag.year}-${dueBag.month}-${dueBag.day}`,
    nowDayKey: `${nowBag.year}-${nowBag.month}-${nowBag.day}`,
  };
}

function clockLabel(hour: number, minute: number): string {
  const h24 = ((hour % 24) + 24) % 24;
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mm = String(minute).padStart(2, '0');
  return `${h12}:${mm} ${meridiem}`;
}

function calendarDaysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const a = Date.UTC(fy || 0, (fm || 1) - 1, fd || 1);
  const b = Date.UTC(ty || 0, (tm || 1) - 1, td || 1);
  return Math.round((b - a) / 86_400_000);
}

/** "at 10 AM tomorrow", "in two days", "in two weeks". */
export function formatScheduledWhen(iso: string, now = new Date()): string {
  const p = partsInTz(iso, now);
  const days = calendarDaysBetween(p.nowDayKey, p.dayKey);
  const time = clockLabel(p.hour, p.minute);
  if (days === 0) return `at ${time} today`;
  if (days === 1) return `at ${time} tomorrow`;
  if (days === -1) return `at ${time} yesterday`;
  if (days > 1 && days < 7) return `at ${time} on ${WEEKDAYS[p.weekday]}`;
  if (days === 7) return 'in one week';
  if (days > 7 && days < 14) return `in ${days} days`;
  if (days === 14) return 'in two weeks';
  if (days > 14 && days % 7 === 0 && days <= 56) {
    const weeks = days / 7;
    return `in ${numberWord(weeks)} weeks`;
  }
  if (days > 1) return `in ${days} days`;
  if (days < 0) return `at ${time}`;
  return `at ${time}`;
}

function numberWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  return words[n] || String(n);
}

export function templateLabelFor(id: string): string {
  return TEMPLATE_LABELS[id] || id.replace(/_/g, ' ');
}

/**
 * Resolve "we value your opinion" / "fall newsletter" / template ids.
 * Returns null when nothing matches.
 */
export function resolveNewsletterTemplateId(raw: string): string | null {
  const n = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ');
  if (!n) return null;
  if (TEMPLATE_LABELS[n]) return n;
  const spacedId = n.replace(/ /g, '_');
  if (TEMPLATE_LABELS[spacedId]) return spacedId;
  const byLabel = Object.entries(TEMPLATE_LABELS).find(
    ([, label]) => label.toLowerCase().replace(/['’"]/g, '') === n,
  );
  if (byLabel) return byLabel[0];
  if (TEMPLATE_ALIASES[n]) return TEMPLATE_ALIASES[n];
  for (const [alias, id] of Object.entries(TEMPLATE_ALIASES)) {
    if (n.includes(alias) || alias.includes(n)) return id;
  }
  return null;
}

function campaignKey(send: ScheduledSendInput): string | null {
  if (send.campaignId) return send.campaignId;
  if (send.source === 'broadcast' || send.trigger === 'broadcast') {
    return `bcast:${send.templateId}:${send.subject || ''}:${send.dueAt.slice(0, 16)}:${send.createdAt.slice(0, 16)}`;
  }
  return null;
}

function recipientLabel(send: ScheduledSendInput): string {
  const name = (send.firstName || '').trim();
  if (name && name.toLowerCase() !== 'there') return name;
  const email = (send.toEmail || '').trim();
  if (email.includes('@')) return email.split('@')[0] || email;
  return 'the client';
}

function jobTitleFrom(send: ScheduledSendInput): string | null {
  const ctx = send.context || {};
  const title = typeof ctx.projectTitle === 'string' ? ctx.projectTitle.trim() : '';
  return title || send.jobSlug || null;
}

export function formatScheduledEmailTitle(item: Omit<ScheduledEmailItem, 'title' | 'detail' | 'reviewPrompt'>, now = new Date()): {
  title: string;
  detail: string;
  reviewPrompt: boolean;
} {
  const when = formatScheduledWhen(item.dueAt, now);
  const label = item.templateLabel;
  const days = calendarDaysBetween(partsInTz(item.dueAt, now).nowDayKey, partsInTz(item.dueAt, now).dayKey);

  if (item.kind === 'broadcast') {
    const reviewPrompt = days >= 1 && days <= 3;
    const title = reviewPrompt
      ? `The ${label} is set to go out ${when}. Would you like to review it?`
      : `The ${label} is scheduled to be sent ${when}`;
    const detail =
      item.recipientCount > 1
        ? `${item.recipientCount} recipients`
        : item.toLabel || 'Broadcast';
    return { title, detail, reviewPrompt };
  }

  if (item.source === 'project_complete' || item.source === 'review_request') {
    const project = item.jobTitle || 'The project';
    const title = `${project} has been marked completed. ${capitalize(when)} the follow-up email will be sent.`;
    return { title, detail: `${label} · ${item.toLabel}`, reviewPrompt: false };
  }

  return {
    title: `The ${label} email to ${item.toLabel} is scheduled to be sent ${when}`,
    detail: item.subject || label,
    reviewPrompt: false,
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function groupScheduledSends(sends: ScheduledSendInput[], now = new Date()): ScheduledEmailItem[] {
  const pending = sends.filter((s) => s.status === 'pending');
  const groups = new Map<string, ScheduledSendInput[]>();
  const singles: ScheduledSendInput[] = [];

  for (const send of pending) {
    const key = campaignKey(send);
    if (key) {
      const list = groups.get(key) || [];
      list.push(send);
      groups.set(key, list);
    } else {
      singles.push(send);
    }
  }

  const items: ScheduledEmailItem[] = [];

  for (const [key, list] of groups) {
    const first = list[0]!;
    const campaignId = first.campaignId || key;
    const base = {
      id: campaignId,
      kind: 'broadcast' as const,
      campaignId,
      sendIds: list.map((s) => s.id),
      templateId: first.templateId,
      templateLabel: templateLabelFor(first.templateId),
      source: first.source,
      subject: first.subject || templateLabelFor(first.templateId),
      toLabel: list.length === 1 ? recipientLabel(first) : `${list.length} contacts`,
      toEmail: list.length === 1 ? first.toEmail : null,
      contactUid: list.length === 1 ? first.contactUid : null,
      firstName: first.firstName,
      recipientCount: list.length,
      dueAt: first.dueAt,
      jobSlug: first.jobSlug,
      jobTitle: jobTitleFrom(first),
    };
    const copy = formatScheduledEmailTitle(base, now);
    items.push({ ...base, ...copy });
  }

  for (const send of singles) {
    const base = {
      id: send.id,
      kind: 'single' as const,
      campaignId: send.campaignId,
      sendIds: [send.id],
      templateId: send.templateId,
      templateLabel: templateLabelFor(send.templateId),
      source: send.source,
      subject: send.subject || templateLabelFor(send.templateId),
      toLabel: recipientLabel(send),
      toEmail: send.toEmail,
      contactUid: send.contactUid,
      firstName: send.firstName,
      recipientCount: 1,
      dueAt: send.dueAt,
      jobSlug: send.jobSlug,
      jobTitle: jobTitleFrom(send),
    };
    const copy = formatScheduledEmailTitle(base, now);
    items.push({ ...base, ...copy });
  }

  items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return items;
}

/** Short briefing injected into the agent system prompt. */
export function formatScheduledEmailsForAgent(items: ScheduledEmailItem[], limit = 8): string {
  if (!items.length) return '';
  const lines = items.slice(0, limit).map((item) => `- ${item.title}`);
  return [
    'Upcoming scheduled emails (owner can cancel or reschedule from the dashboard):',
    ...lines,
    'If a newsletter is going out in the next few days, offer to review it. If the owner asks to send a named template (e.g. "we value your opinion") to a client, use send_template_email.',
  ].join('\n');
}
