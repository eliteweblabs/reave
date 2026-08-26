/**
 * Hard rule: a message that triggers a dashboard/push notification cannot be junk.
 * Junk and live dashboard alerts are mutually exclusive.
 */

import type { EmailInboxPatch, EmailInboxRecord } from './emailInboxStore';

/**
 * Deleted inbox rows and junk/DELETE/auto-archive classifications must never
 * keep a dashboard or push notification. Missing record = already deleted.
 */
export function deletedOrJunkedEmailBlocksNotification(
  record:
    | {
        category?: string | null;
        action?: string | null;
        status?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!record) return true;
  return isJunkClassification(record);
}

export function isJunkClassification(opts: {
  category?: string | null;
  action?: string | null;
  status?: string | null;
}): boolean {
  const category = String(opts.category || '').toLowerCase();
  const action = String(opts.action || '').toLowerCase();
  const status = String(opts.status || '').toUpperCase();
  return (
    category === 'junk' ||
    category === 'auto_deleted' ||
    action === 'junk' ||
    action === 'deleted' ||
    status === 'JUNK' ||
    status === 'DELETE' ||
    status === 'AUTO_ARCHIVED'
  );
}

/**
 * A matched DELETE rule files the message as `auto_deleted` (hidden review
 * queue) instead of junk. OTP / auth-link mail is excluded. Junk is only for
 * manual / AI quarantine (status JUNK) and AUTO_ARCHIVED filing.
 */
export function shouldHardDeleteOnDeleteRule(opts: {
  category?: string | null;
  inboxStatus?: string | null;
  ruleStatus?: string | null;
  isVerificationCode?: boolean;
  isAuthLink?: boolean;
}): boolean {
  if (opts.isVerificationCode || opts.isAuthLink) return false;
  const inboxStatus = String(opts.inboxStatus || '').toUpperCase();
  const ruleStatus = String(opts.ruleStatus || '').toUpperCase();
  if (inboxStatus !== 'DELETE' || ruleStatus !== 'DELETE') return false;
  return String(opts.category || '').toLowerCase() === 'junk';
}

export function looksLikeClientReplyUrgency(opts: {
  action?: string | null;
  status?: string | null;
  routeNote?: string | null;
  summary?: string | null;
}): boolean {
  const action = String(opts.action || '').toLowerCase();
  const status = String(opts.status || '').toUpperCase();
  if (action === 'project_reply' || status === 'PROJECT_REPLY') return true;
  const note = `${opts.routeNote || ''} ${opts.summary || ''}`;
  return /(?:contact|client) replied/i.test(note);
}

/**
 * If a notification will fire, junk cannot win — upgrade to a visible review/client state.
 */
export function enforceNotificationNotJunk(opts: {
  category: string;
  action: string;
  status: string;
  willNotify: boolean;
  isProjectReply?: boolean;
}): { category: string; action: string; status: string } {
  if (!opts.willNotify || !isJunkClassification(opts)) {
    return { category: opts.category, action: opts.action, status: opts.status };
  }
  if (opts.isProjectReply) {
    return { category: 'client', action: 'project_reply', status: 'PROJECT_REPLY' };
  }
  const statusUpper = opts.status.toUpperCase();
  return {
    category: opts.category === 'junk' || opts.category === 'auto_deleted' ? 'review' : opts.category,
    action: opts.action.toLowerCase() === 'junk' ? 'review' : opts.action,
    status:
      statusUpper === 'DELETE' || statusUpper === 'JUNK' || statusUpper === 'AUTO_ARCHIVED'
        ? 'UNMATCHED'
        : opts.status,
  };
}

/**
 * Patch used when explicitly marking junk — strips client-reply urgency so the
 * UI cannot show "junk · …" alongside a Contact replied route / dashboard alert.
 */
export function patchForMarkJunk(existing?: Pick<
  EmailInboxRecord,
  'action' | 'status' | 'routeNote' | 'summary'
> | null): EmailInboxPatch {
  const patch: EmailInboxPatch = {
    category: 'junk',
    action: 'junk',
    status: 'JUNK',
  };
  if (existing && looksLikeClientReplyUrgency(existing)) {
    patch.routeNote = 'Marked as junk';
    patch.automationKind = null;
  }
  return patch;
}
