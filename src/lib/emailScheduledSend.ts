/**
 * Flush due correspondence emails from the scheduled-send queue.
 */

import { buildAdminComposeEmail } from './adminComposeEmail';
import { deliverAdminComposeMail } from './deliverAdminCompose';
import {
  claimDueScheduledEmails,
  markScheduledEmailFailed,
  markScheduledEmailSent,
  scheduledEmailToComposeBody,
  type ScheduledEmailRecord,
} from './emailScheduledStore';

export async function sendScheduledEmailNow(
  row: ScheduledEmailRecord,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const built = await buildAdminComposeEmail(scheduledEmailToComposeBody(row), {
    userId: row.createdBy || '',
  });
  if (!built.ok) {
    await markScheduledEmailFailed(row.id, built.error);
    return { ok: false, error: built.error };
  }

  const delivered = await deliverAdminComposeMail(built.mail, row.createdBy);
  if (!delivered.ok) {
    await markScheduledEmailFailed(row.id, delivered.error);
    return { ok: false, error: delivered.error };
  }

  await markScheduledEmailSent(row.id, delivered.id ?? null);
  return { ok: true, id: delivered.id };
}

export async function processDueScheduledEmails(limit = 20): Promise<{
  ok: true;
  claimed: number;
  sent: number;
  failed: number;
}> {
  const claimed = await claimDueScheduledEmails(limit);
  let sent = 0;
  let failed = 0;
  for (const row of claimed) {
    const result = await sendScheduledEmailNow(row);
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { ok: true, claimed: claimed.length, sent, failed };
}
