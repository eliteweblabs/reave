import type { WorkJobSummary } from './workStore';
import { parseSenderEmail } from './emailAddress';
import { findRecentProjectOutbound, type ProjectOutboundMatch } from './projectOutboundEmail';

export type ProjectClientReplyMatch = {
  jobSlug: string;
  jobTitle: string;
  reason: string;
  outbound: ProjectOutboundMatch | null;
};

/** Automated mailers (Google security alerts, etc.) are never client replies. */
export function isAutomatedNoreplySender(email: string): boolean {
  const addr = parseSenderEmail(email);
  if (!addr.includes('@')) return false;
  const [local = '', domain = ''] = addr.split('@');
  const localNorm = local.toLowerCase();
  const domainNorm = domain.toLowerCase();
  if (
    /^(no-?reply|noreply|donotreply|do-not-reply|mailer-daemon|notifications?|alerts?)$/i.test(
      localNorm,
    )
  ) {
    return true;
  }
  if (localNorm.includes('noreply') || localNorm.includes('no-reply')) return true;
  // Platform security / account mailers that share subjects with client threads.
  if (
    domainNorm === 'accounts.google.com' ||
    domainNorm.endsWith('.accounts.google.com') ||
    domainNorm === 'accountprotection.microsoft.com' ||
    domainNorm === 'appleid.apple.com'
  ) {
    return true;
  }
  return false;
}

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v).trim();
  }
  return '';
}

export function isLikelyEmailReply(opts: {
  subject: string;
  headers?: Record<string, string>;
}): boolean {
  const subject = opts.subject.trim();
  if (/^(re|fw|fwd|aw):\s/i.test(subject)) return true;
  const inReply = headerValue(opts.headers, 'in-reply-to');
  const references = headerValue(opts.headers, 'references');
  return Boolean(inReply || references);
}

/** Strip Re:/Fwd:/Aw: prefixes so thread siblings share one subject. */
function normalizeSubjectForThread(subject: string): string {
  return subject.replace(/^(?:(?:re|fw|fwd|aw):\s*)+/gi, '').trim().toLowerCase();
}

/** Inbound subject continues the outbound thread (even when clients omit Re:). */
export function subjectRelatesToOutbound(inboundSubject: string, outboundSubject: string): boolean {
  const a = normalizeSubjectForThread(inboundSubject);
  const b = normalizeSubjectForThread(outboundSubject);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function hasReplyEvidence(opts: {
  subject: string;
  headers?: Record<string, string>;
  outboundSubject?: string | null;
}): boolean {
  if (isLikelyEmailReply({ subject: opts.subject, headers: opts.headers })) return true;
  const outboundSubject = opts.outboundSubject?.trim();
  if (outboundSubject && subjectRelatesToOutbound(opts.subject, outboundSubject)) return true;
  return false;
}

function senderMatchesContact(
  senderEmail: string,
  contactEmailOnRecord: string | null | undefined,
): boolean {
  const sender = parseSenderEmail(senderEmail);
  const onRecord = contactEmailOnRecord ? parseSenderEmail(contactEmailOnRecord) : '';
  return Boolean(onRecord && sender === onRecord);
}

function pickJobFromList(jobs: WorkJobSummary[], preferredSlug?: string | null): WorkJobSummary | null {
  if (!jobs.length) return null;
  if (preferredSlug) {
    const hit = jobs.find((j) => j.slug === preferredSlug);
    if (hit) return hit;
  }
  const open = jobs.filter((j) => j.status === 'active' || j.status === 'inquiry');
  if (open.length === 1) return open[0]!;
  if (jobs.length === 1) return jobs[0]!;
  return open[0] ?? jobs[0] ?? null;
}

/**
 * Detect inbound mail that is a client reply after we sent project-related outbound email.
 * Requires thread evidence (Re:/In-Reply-To/References, or same subject as outbound) —
 * a fresh email from a known contact is not treated as a reply.
 */
export async function detectProjectClientReply(opts: {
  senderEmail: string;
  contactUid: string | null;
  contactEmailOnRecord?: string | null;
  subject: string;
  headers?: Record<string, string>;
  jobs: WorkJobSummary[];
}): Promise<ProjectClientReplyMatch | null> {
  const senderEmail = parseSenderEmail(opts.senderEmail);
  if (!senderEmail.includes('@')) return null;
  if (isAutomatedNoreplySender(senderEmail)) return null;

  const outbound = await findRecentProjectOutbound({
    senderEmail,
    contactUid: opts.contactUid,
  });

  if (outbound) {
    if (
      !hasReplyEvidence({
        subject: opts.subject,
        headers: opts.headers,
        outboundSubject: outbound.subject,
      })
    ) {
      return null;
    }
    const job =
      opts.jobs.find((j) => j.slug === outbound.jobSlug) ??
      pickJobFromList(opts.jobs, outbound.jobSlug);
    return {
      jobSlug: outbound.jobSlug,
      jobTitle: job?.title || outbound.jobTitle || outbound.jobSlug,
      reason: `Reply from ${senderEmail} after project email sent ${new Date(outbound.sentAt).toLocaleDateString()}`,
      outbound,
    };
  }

  if (
    opts.contactUid &&
    opts.jobs.length > 0 &&
    senderMatchesContact(senderEmail, opts.contactEmailOnRecord) &&
    isLikelyEmailReply({ subject: opts.subject, headers: opts.headers })
  ) {
    const job = pickJobFromList(opts.jobs);
    if (!job) return null;
    return {
      jobSlug: job.slug,
      jobTitle: job.title,
      reason: `Reply from client of record on open project "${job.title}"`,
      outbound: null,
    };
  }

  return null;
}
