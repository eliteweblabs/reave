/**
 * Shared title/detail formatting for dashboard notifications and phone push.
 * Single source of truth — webPush stores these strings; dashboard reads them back.
 */

import { parseSenderEmail, parseSenderName } from './emailAddress';
import type { PushAlert } from './pushAlertStore';

export const NOTIFICATION_TITLE_MAX = 120;
export const NOTIFICATION_DETAIL_MAX = 240;

export function truncateNotificationText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Best human-facing client label from a work project record. */
export function bestWorkDisplayName(
  job?: { client?: string | null; contact_name?: string | null; title?: string | null } | null,
  fallback = '',
): string {
  const client = job?.client?.trim();
  const contact = job?.contact_name?.trim();
  const title = job?.title?.trim();
  const fb = fallback.trim();
  return client || contact || fb || title || 'Project';
}

export function siriProposalSlugFromTag(tag: string): string | null {
  const prefix = 'siri-proposal-';
  const raw = tag.trim();
  if (!raw.toLowerCase().startsWith(prefix)) return null;
  const slug = raw.slice(prefix.length).trim().toLowerCase();
  return /^[a-z0-9._-]+$/.test(slug) ? slug : null;
}

export function workSlugFromAdminUrl(url: string): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim(), 'https://example.com');
    const slug = parsed.searchParams.get('slug')?.trim();
    return slug || null;
  } catch {
    return null;
  }
}

export function auditLabelFromTitle(title: string): string | null {
  const cleaned = unwrapDebugField(title, 'title') ?? title.trim();
  const arrow = cleaned.match(/^(?:Full )?audit ready\s*>\s*(.+)$/i);
  if (arrow?.[1]?.trim()) return arrow[1].trim();
  const match = cleaned.match(/^(?:Full )?audit ready:\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function isSiriAuditPushAlert(tag: string, title?: string): boolean {
  if (siriProposalSlugFromTag(tag)) return true;
  const cleaned = unwrapDebugField(title ?? '', 'title') ?? (title ?? '').trim();
  return /^(?:Full )?audit ready(?:\s*>:|\s*:)/i.test(cleaned);
}

export function formatAuditReadyNotification(opts: {
  tier?: 'quick' | 'full';
  displayName: string;
  excerpt: string;
}): { title: string; detail: string } {
  const prefix = opts.tier === 'full' ? 'Full Audit Ready' : 'Audit Ready';
  const name = opts.displayName.trim() || 'Project';
  const title = truncateNotificationText(`${prefix} > ${name}`, NOTIFICATION_TITLE_MAX);
  const detail = truncateNotificationText(cleanNotificationExcerpt(opts.excerpt), NOTIFICATION_DETAIL_MAX);
  return { title, detail };
}

/** Strip lightweight markdown and collapse whitespace for alert excerpts. */
export function cleanNotificationExcerpt(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapDebugField(value: string, field: string): string | null {
  const trimmed = value.trim();
  const prefix = `${field} : `;
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmed.slice(prefix.length).trim();
  }
  return null;
}

function extractDebugBody(detail: string): string | null {
  const match = detail.match(/(?:^|\s)body\s*:\s*(.+?)(?:\s+tag\s*:|$)/is);
  return match?.[1]?.trim() || null;
}

function auditTierFromTitle(title: string): 'quick' | 'full' {
  const cleaned = unwrapDebugField(title, 'title') ?? title.trim();
  return /^full audit ready/i.test(cleaned) ? 'full' : 'quick';
}

/**
 * Normalize stored push-alert copy — repairs legacy debug dumps and audit titles.
 */
export function normalizePushAlertCopy(
  alert: Pick<PushAlert, 'tag' | 'title' | 'detail' | 'url'>,
  opts?: { displayName?: string },
): { title: string; detail: string } {
  const slug =
    siriProposalSlugFromTag(alert.tag) ?? workSlugFromAdminUrl(alert.url) ?? undefined;

  if (isSiriAuditPushAlert(alert.tag, alert.title)) {
    const displayName =
      opts?.displayName?.trim() ||
      auditLabelFromTitle(alert.title) ||
      slug ||
      'Project';

    let excerpt =
      extractDebugBody(alert.detail) ??
      unwrapDebugField(alert.detail, 'body') ??
      alert.detail;

    excerpt = excerpt.replace(/^(?:Full )?audit ready:[^\n]*(?:\n|$)/i, '').trim();

    return formatAuditReadyNotification({
      tier: auditTierFromTitle(alert.title),
      displayName,
      excerpt,
    });
  }

  const title = unwrapDebugField(alert.title, 'title') ?? alert.title.trim();
  const detail =
    extractDebugBody(alert.detail) ??
    unwrapDebugField(alert.detail, 'body') ??
    alert.detail.trim();

  return {
    title: truncateNotificationText(title, NOTIFICATION_TITLE_MAX),
    detail: truncateNotificationText(detail, NOTIFICATION_DETAIL_MAX),
  };
}

/** Canonical push/dashboard payload after truncation. */
export function formatNotificationPayload(title: string, body: string): { title: string; detail: string } {
  return {
    title: truncateNotificationText(title, NOTIFICATION_TITLE_MAX),
    detail: truncateNotificationText(body, NOTIFICATION_DETAIL_MAX),
  };
}

/** Inbox id embedded in a push-alert tag (plain id, otp-{id}, or email-{id}). */
export function emailIdFromPushAlertTag(tag: string): string | null {
  const raw = tag.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith('otp-')) return raw.slice(4).trim() || null;
  if (lower.startsWith('email-')) return raw.slice(6).trim() || null;
  if (/^[0-9a-f-]{36}$/i.test(raw)) return raw;
  return null;
}

const GENERIC_SENDER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'msn.com',
  'ymail.com',
]);

/** Strip common transactional subdomains so favicons resolve to the brand (email.apple.com → apple.com). */
const TRANSACTIONAL_EMAIL_SUBDOMAINS = new Set([
  'email',
  'mail',
  'alerts',
  'notifications',
  'notify',
  'messaging',
  'e',
  'm',
  'noreply',
  'no-reply',
]);

/** Registrable brand domain for favicon lookup — null for personal inboxes or unparseable senders. */
export function brandDomainFromSenderEmail(from: string): string | null {
  const email = parseSenderEmail(from);
  const match = email.match(/@([^@\s]+)/);
  if (!match) return null;
  const domain = match[1].toLowerCase();
  if (GENERIC_SENDER_EMAIL_DOMAINS.has(domain)) return null;
  const parts = domain.split('.');
  if (parts.length >= 3 && TRANSACTIONAL_EMAIL_SUBDOMAINS.has(parts[0])) {
    return parts.slice(1).join('.');
  }
  return domain;
}

/** Google favicon URL for a sender address — null when no brand domain can be inferred. */
export function senderFaviconUrl(from: string, size = 64): string | null {
  const domain = brandDomainFromSenderEmail(from);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Human label for the sender line on dashboard review alerts. */
export function senderLabelForNotification(from: string, contactName?: string | null): string {
  const email = parseSenderEmail(from);
  const name = (contactName || parseSenderName(from)).trim();
  if (name && email && !name.includes('@')) return `${name} · ${email}`;
  if (email) return email;
  if (name) return name;
  return from.trim();
}

/** True when the title repeats (or truncates) the detail body. */
export function notificationCopyIsDuplicated(title: string, detail: string): boolean {
  const t = title.trim().replace(/…+$/u, '').trim();
  const d = detail.trim();
  if (!t || !d) return false;
  if (t.toLowerCase() === d.toLowerCase()) return true;
  const tLo = t.toLowerCase().replace(/^alert:\s*/i, '');
  const dLo = d.toLowerCase();
  if (dLo.startsWith(tLo)) return true;
  if (dLo.startsWith(t.toLowerCase())) return true;
  return false;
}

/** Dashboard headline + body — avoids title/detail duplication for inbox pushes. */
export function dashboardReviewAlertCopy(input: {
  title: string;
  detail: string;
  from?: string;
  subject?: string;
  contactName?: string | null;
}): { headline: string; body: string } {
  const title = input.title.trim();
  const detail = input.detail.trim();
  const duplicated = notificationCopyIsDuplicated(title, detail);
  const sender = input.from?.trim() ? senderLabelForNotification(input.from, input.contactName) : '';
  const subject = input.subject?.trim() || '';

  if (duplicated) {
    return {
      headline: sender || subject || title.replace(/^alert:\s*/i, '').trim(),
      body: detail,
    };
  }

  return { headline: title, body: detail };
}
