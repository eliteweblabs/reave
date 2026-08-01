/**
 * Resolve contact + icon for chat sidebar rows (linked project or source email).
 */

import { getContact, extractPortal } from './contactApi';
import { resolveClientIconUrl } from './clientBranding';
import { storeGetEmailInbox } from './emailInboxStore';
import { storeReadWork } from './workStore';
import type { ChatThreadSummary, LinkedJobRef } from './chatTypes';

type ThreadWithLinks = ChatThreadSummary & { linked_jobs?: LinkedJobRef[] };

async function contactUidForThread(thread: ThreadWithLinks): Promise<string | null> {
  const firstJob = thread.linked_jobs?.[0];
  if (firstJob?.slug) {
    const doc = await storeReadWork(firstJob.slug);
    const uid = doc?.contact_uid?.trim();
    if (uid) return uid;
  }
  const emailId = thread.source_email_id?.trim();
  if (emailId) {
    const email = await storeGetEmailInbox(emailId);
    const uid = email?.contactUid?.trim();
    if (uid) return uid;
  }
  return null;
}

async function resolveAuthorIconUrl(contactUid: string): Promise<string | null> {
  const res = await getContact(contactUid);
  if (!res.ok) return null;
  const portal = extractPortal(res.data);
  return resolveClientIconUrl(portal, contactUid) || null;
}

export async function enrichChatThreadsWithAuthors<T extends ThreadWithLinks>(
  threads: T[],
): Promise<(T & { contact_uid: string | null; author_icon_url: string | null })[]> {
  const uidByThreadId = new Map<string, string>();
  await Promise.all(
    threads.map(async (t) => {
      const uid = await contactUidForThread(t);
      if (uid) uidByThreadId.set(t.id, uid);
    }),
  );

  const uniqueUids = [...new Set(uidByThreadId.values())];
  const iconByUid = new Map<string, string | null>();
  await Promise.all(
    uniqueUids.map(async (uid) => {
      iconByUid.set(uid, await resolveAuthorIconUrl(uid));
    }),
  );

  return threads.map((t) => {
    const contact_uid = uidByThreadId.get(t.id) ?? null;
    const author_icon_url = contact_uid ? iconByUid.get(contact_uid) ?? null : null;
    return { ...t, contact_uid, author_icon_url };
  });
}
