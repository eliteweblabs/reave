/**
 * Shared title/detail formatting for dashboard notifications and phone push.
 * Single source of truth — webPush stores these strings; dashboard reads them back.
 */

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
