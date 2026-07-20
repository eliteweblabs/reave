/**
 * Inbox category for emails linked to a work/project (manual create, auto-create, agent link).
 */

import { storeUpdateEmailInbox } from './emailInboxStore';

export async function markInboxEmailAsProject(
  id: string,
  jobTitle: string,
  opts?: { contactUid?: string; contactName?: string; routeNote?: string },
) {
  return storeUpdateEmailInbox(id, {
    category: 'project',
    action: 'matched',
    status: 'MATCHED',
    routeNote: opts?.routeNote ?? `Linked to project "${jobTitle}"`,
    ...(opts?.contactUid
      ? { contactUid: opts.contactUid, contactName: opts.contactName }
      : {}),
  });
}
