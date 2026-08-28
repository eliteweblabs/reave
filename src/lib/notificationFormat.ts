/**
 * Shared title/detail formatting for dashboard notifications and phone push.
 * Single source of truth — webPush stores these strings; dashboard reads them back.
 */

import { stripStructuredJsonBlocks } from './chatResponseRenderer';
import { parseSenderEmail, parseSenderName } from './emailAddress';
import type { PushAlert } from './pushAlertStore';

const AUDIT_TITLE_STATUS_RE = /^(?:Full )?audit (?:ready|failed)/i;
const AUDIT_TITLE_ARROW_RE = /^(?:Full )?audit (?:ready|failed)\s*>\s*(.+)$/i;
const AUDIT_TITLE_COLON_RE = /^(?:Full )?audit (?:ready|failed):\s*(.+)$/i;
const DEPLOY_BANNER_LINE_RE =
  /^(?:🚀 Deploying:|🟢 Live:|🔴 Deploy stale:|🔴 Deploy failed|🔴 ).+$/gm;

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
  const arrow = cleaned.match(AUDIT_TITLE_ARROW_RE);
  if (arrow?.[1]?.trim()) return arrow[1].trim();
  const match = cleaned.match(AUDIT_TITLE_COLON_RE);
  return match?.[1]?.trim() || null;
}

export function isSiriAuditPushAlert(tag: string, title?: string): boolean {
  if (siriProposalSlugFromTag(tag)) return true;
  const cleaned = unwrapDebugField(title ?? '', 'title') ?? (title ?? '').trim();
  return AUDIT_TITLE_STATUS_RE.test(cleaned);
}

/** Drop deploy banners and structured chat buttons so they never leak into push copy. */
export function stripNotificationDecorations(text: string): string {
  let cleaned = stripStructuredJsonBlocks(text);
  cleaned = cleaned.replace(/```json[\s\S]*$/i, '').trim();
  cleaned = cleaned.replace(DEPLOY_BANNER_LINE_RE, '').trim();
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Human reason when research died (credits, API error, thrown runner) instead
 * of writing the audit. Null when the reply looks like a normal summary.
 */
export function auditResearchFailureReason(reply: string): string | null {
  const raw = reply.trim();
  if (!raw) return null;
  const cleaned = stripNotificationDecorations(raw);
  const hay = `${raw}\n${cleaned}`;

  if (
    /credit balance is too low|can't respond right now|credits (?:are|ran) too low/i.test(
      hay,
    )
  ) {
    return "Anthropic is out of credits, so the audit couldn't finish.";
  }
  if (/^Research failed:/i.test(cleaned)) {
    const detail = cleaned.replace(/^Research failed:\s*/i, '').trim();
    return detail || 'The research agent failed before finishing the audit.';
  }
  if (/^Anthropic error/i.test(cleaned)) {
    return 'The research agent hit an Anthropic API error before finishing the audit.';
  }
  if (/^ANTHROPIC_API_KEY not set/i.test(cleaned)) {
    return 'Anthropic is not configured, so the audit could not run.';
  }
  if (/^sleep_mode$/i.test(cleaned)) {
    return 'Sleep mode blocked the research agent before the audit finished.';
  }
  if (!cleaned && /🚀 Deploying:/.test(raw)) {
    return "A deploy was in progress and the research agent didn't finish the audit.";
  }
  return null;
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

export function formatAuditFailedNotification(opts: {
  tier?: 'quick' | 'full';
  displayName: string;
  reason: string;
}): { title: string; detail: string } {
  const prefix = opts.tier === 'full' ? 'Full Audit Failed' : 'Audit Failed';
  const name = opts.displayName.trim() || 'Project';
  const title = truncateNotificationText(`${prefix} > ${name}`, NOTIFICATION_TITLE_MAX);
  const detail = truncateNotificationText(cleanNotificationExcerpt(opts.reason), NOTIFICATION_DETAIL_MAX);
  return { title, detail };
}

/** Strip lightweight markdown, deploy banners, and button JSON for alert excerpts. */
export function cleanNotificationExcerpt(text: string): string {
  return stripNotificationDecorations(text)
    .replace(/\*\*/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pull the 2–3 sentence finding summary from a finished audit agent reply. */
export function extractAuditProposalSummary(reply: string, slug?: string | null): string {
  const trimmed = stripNotificationDecorations(reply);
  if (!trimmed) return 'Research finished — open the project for the full audit.';

  if (slug) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = trimmed.match(new RegExp(`Project:\\s*${escaped}\\s*\\n?([\\s\\S]*)`, 'i'));
    if (match?.[1]?.trim()) return match[1].trim();
  }

  const generic = trimmed.match(/Project:\s*[a-z0-9._-]+\s*\n([\s\S]*)/i);
  if (generic?.[1]?.trim()) return generic[1].trim();

  return trimmed.slice(0, 1200);
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
  return /^full audit (?:ready|failed)/i.test(cleaned) ? 'full' : 'quick';
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

    excerpt = excerpt.replace(/^(?:Full )?audit (?:ready|failed):[^\n]*(?:\n|$)/i, '').trim();

    const failure = auditResearchFailureReason(excerpt);
    if (failure || /^(?:Full )?audit failed/i.test(alert.title)) {
      return formatAuditFailedNotification({
        tier: auditTierFromTitle(alert.title),
        displayName,
        reason: failure || excerpt || 'The research agent stopped before the audit was written.',
      });
    }

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

/**
 * Phone-banner title: "{PWA name} - {notification title}".
 * HTML `<title>` is a separate string (`formatHtmlPageTitle`) — do not pass
 * page titles or taglines here. iOS may also prepend "from {document.title}";
 * standalone PWAs pin that to the company name via PwaDocumentTitle.
 */
export function formatPwaPushTitle(pwaTitle: string, notificationTitle: string): string {
  const pwa = pwaTitle.trim();
  const title = notificationTitle.trim();
  if (!title) return truncateNotificationText(pwa, NOTIFICATION_TITLE_MAX);
  if (!pwa) return truncateNotificationText(title, NOTIFICATION_TITLE_MAX);
  const prefix = `${pwa} - `;
  const alreadyPrefixed =
    title === pwa ||
    title.startsWith(prefix) ||
    title.toLowerCase().startsWith(`${pwa.toLowerCase()} - `);
  return truncateNotificationText(alreadyPrefixed ? title : `${prefix}${title}`, NOTIFICATION_TITLE_MAX);
}

/** Canonical push/dashboard payload after truncation. */
export function formatNotificationPayload(
  title: string,
  body: string,
  opts?: { pwaTitle?: string },
): { title: string; detail: string } {
  const headed = opts?.pwaTitle ? formatPwaPushTitle(opts.pwaTitle, title) : title;
  return {
    title: truncateNotificationText(headed, NOTIFICATION_TITLE_MAX),
    detail: truncateNotificationText(body, NOTIFICATION_DETAIL_MAX),
  };
}

/** Inbox id embedded in a push-alert tag (plain id, otp-{id}, auth-{id}, triage-{id}, or email-{id}). */
export function emailIdFromPushAlertTag(tag: string): string | null {
  const raw = tag.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith('otp-')) return raw.slice(4).trim() || null;
  if (lower.startsWith('auth-')) return raw.slice(5).trim() || null;
  if (lower.startsWith('triage-')) return raw.slice(7).trim() || null;
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
