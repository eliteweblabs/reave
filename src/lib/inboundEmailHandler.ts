import { processInboundEmail } from './emailProcessor';
import { parseEmailDate } from './emailDate';
import { ensureInboundSince, isInboundEmailAllowed } from './inboundEmailSince';
import { isSleepModeActive, sleepModeStatus } from './pushQuietHours';
import { inboxPreviewSnippet, normalizeEmailBody } from './emailBody';

export interface InboundEmailResult {
  ok: boolean;
  /** filed | junk | review | alert | rejected | classified | matched | ignored */
  action: string;
  status: string;
  from: string;
}

let _reprocessRunning = false;
let _lastReprocessAt = 0;
const REPROCESS_MIN_MS = 60_000;

/** After quiet hours end, triage mail that was held overnight (at most once per minute). */
export async function runSleepDeferredCatchUp(): Promise<void> {
  return maybeReprocessSleepDeferred();
}

async function maybeReprocessSleepDeferred(): Promise<void> {
  if (await isSleepModeActive()) return;
  if (_reprocessRunning) return;
  if (Date.now() - _lastReprocessAt < REPROCESS_MIN_MS) return;
  _reprocessRunning = true;
  _lastReprocessAt = Date.now();
  try {
    const { storeListSleepDeferredEmails, storeDeleteEmailInbox } = await import('./emailInboxStore');
    const deferred = await storeListSleepDeferredEmails(15);
    if (!deferred.length) return;
    console.info('[email] reprocessing sleep-deferred mail', { count: deferred.length });
    for (const row of deferred) {
      await storeDeleteEmailInbox(row.id);
      await processInboundEmail({
        from: row.from,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml,
        to: row.to,
        cc: row.cc,
        bcc: row.bcc,
        replyTo: row.replyTo,
        headers: row.headers,
        messageId: row.messageId,
        resendEmailId: row.resendEmailId || undefined,
        attachments: row.attachments,
      });
    }
  } finally {
    _reprocessRunning = false;
  }
}

/**
 * Run an inbound email through the triage pipeline:
 * cutoff date → allowlist → AI summarize/classify → job routing → inbox log → push.
 */
export async function handleInboundEmail(email: {
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  headers?: Record<string, string>;
  messageId?: string;
  resendEmailId?: string;
  attachments?: import('./emailAttachments').EmailAttachmentMeta[];
}): Promise<InboundEmailResult> {
  const from = email.from ?? '';

  if (await isSleepModeActive()) {
    const { label } = await sleepModeStatus();
    const bodyText = normalizeEmailBody(email.text ?? '', email.html);
    const bodyHtml = email.html?.slice(0, 500_000) ?? '';
    const { storeRecordEmailInbox } = await import('./emailInboxStore');
    await storeRecordEmailInbox({
      from,
      subject: email.subject ?? '',
      bodySnippet: inboxPreviewSnippet(bodyText || email.subject || ''),
      bodyText: bodyText.slice(0, 20_000),
      bodyHtml,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      replyTo: email.replyTo,
      headers: email.headers,
      messageId: email.messageId,
      resendEmailId: email.resendEmailId,
      attachments: email.attachments,
      status: 'SLEEP_DEFERRED',
      action: 'sleep_deferred',
      notified: false,
      category: 'review',
      summary: `Received during sleep mode (${label}) — triage resumes after quiet hours`,
    }).catch(() => undefined);
    console.info('[email] deferred during sleep mode', { from, subject: email.subject ?? '' });
    return { ok: true, action: 'sleep_deferred', status: 'SLEEP_DEFERRED', from };
  }

  void maybeReprocessSleepDeferred().catch((e) =>
    console.warn('[email] sleep deferred reprocess failed', e),
  );

  const since = await ensureInboundSince();
  const emailDate = parseEmailDate(email.headers) ?? new Date();
  if (!isInboundEmailAllowed(emailDate, since)) {
    console.info('[email] skipped pre-cutoff message', {
      from,
      subject: email.subject ?? '',
      emailDate: emailDate.toISOString(),
      inboundSince: since?.toISOString(),
    });
    return { ok: true, action: 'ignored', status: 'IGNORED', from };
  }

  const { isAllowedSender } = await import('./inboundEmailAllowlist');
  if (!isAllowedSender(from)) {
    const { storeRecordEmailInbox } = await import('./emailInboxStore');
    await storeRecordEmailInbox({
      from,
      subject: email.subject ?? '',
      bodySnippet: '',
      status: 'REJECTED',
      action: 'rejected',
      notified: false,
      category: 'junk',
      summary: 'Sender not on allowlist',
    }).catch(() => undefined);
    return { ok: true, action: 'rejected', status: 'REJECTED', from };
  }

  const result = await processInboundEmail({
    from,
    subject: email.subject ?? '',
    text: email.text ?? '',
    html: email.html,
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    replyTo: email.replyTo,
    headers: email.headers,
    messageId: email.messageId,
    resendEmailId: email.resendEmailId,
    attachments: email.attachments,
  });

  return {
    ok: result.ok,
    action: result.action,
    status: result.status,
    from: result.from,
  };
}
