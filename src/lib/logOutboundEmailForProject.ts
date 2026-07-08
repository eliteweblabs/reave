/**
 * Resolve a project to log when sending outbound mail without an explicit job slug.
 */

import { resolveContact } from './contactApi';
import { recordProjectOutboundEmail } from './projectOutboundEmail';
import { storeListWork, storeReadWork } from './workStore';

export async function logOutboundEmailForProject(opts: {
  toEmail: string;
  subject: string;
  resendId?: string | null;
  sentBy?: string | null;
  source: string;
  jobSlug?: string | null;
  contactUid?: string | null;
}): Promise<void> {
  const toEmail = opts.toEmail.trim();
  if (!toEmail.includes('@')) return;

  let jobSlug = opts.jobSlug?.trim() || null;
  let contactUid = opts.contactUid?.trim() || null;
  let jobTitle = '';

  if (jobSlug) {
    const job = await storeReadWork(jobSlug);
    if (job) {
      jobTitle = job.title;
      contactUid = contactUid || job.contact_uid || null;
    } else {
      jobSlug = null;
    }
  }

  if (!jobSlug) {
    if (!contactUid) {
      const contactRes = await resolveContact({ email: toEmail });
      if (contactRes.ok) contactUid = contactRes.data.uid;
    }
    if (contactUid) {
      const jobs = (await storeListWork({ contact_uid: contactUid })).filter(
        (j) => j.status !== 'done' && j.status !== 'archived',
      );
      if (jobs.length === 1) {
        jobSlug = jobs[0]!.slug;
        jobTitle = jobs[0]!.title;
      } else if (jobs.length > 1) {
        const active = jobs.filter((j) => j.status === 'active' || j.status === 'inquiry');
        if (active.length === 1) {
          jobSlug = active[0]!.slug;
          jobTitle = active[0]!.title;
        }
      }
    }
  }

  if (!jobSlug) return;

  await recordProjectOutboundEmail({
    jobSlug,
    jobTitle,
    contactUid,
    toEmail,
    subject: opts.subject,
    resendId: opts.resendId,
    sentBy: opts.sentBy,
    source: opts.source,
  });
}
