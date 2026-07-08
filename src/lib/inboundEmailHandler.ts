import { processInboundEmail } from './emailProcessor';

export interface InboundEmailResult {
  ok: boolean;
  /** filed | junk | review | alert | rejected | classified | matched */
  action: string;
  status: string;
  from: string;
}

/**
 * Run an inbound email through the triage pipeline:
 * allowlist → AI summarize/classify → job routing → inbox log → push.
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
}): Promise<InboundEmailResult> {
  const { isAllowedSender } = await import('./inboundEmailAllowlist');
  const from = email.from ?? '';

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
  });

  return {
    ok: result.ok,
    action: result.action,
    status: result.status,
    from: result.from,
  };
}
