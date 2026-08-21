/**
 * I/O for situational awareness (company + recent Sessions).
 * Keep this off the pure helper module so unit tests do not load Postgres.
 */
import { storeListChatThreads } from './chatStore';
import { getCompanyConfig } from './companyConfig';
import { serverEnv } from './serverEnv';
import { formatOwnerIdentityBlock, formatRecentSessionsBlock } from './agentSituationalContext';

export function envOwnerIdentity(): { ownerName?: string; ownerEmail?: string } {
  const first = serverEnv('OWNER_FIRST_NAME')?.trim() || '';
  const last = serverEnv('OWNER_LAST_NAME')?.trim() || '';
  const full = [first, last].filter(Boolean).join(' ').trim();
  const admin = serverEnv('ADMIN_USERNAME')?.split(',')[0]?.trim() || '';
  const email = serverEnv('OWNER_EMAIL')?.trim() || '';
  return {
    ownerName: full || admin || undefined,
    ownerEmail: email || undefined,
  };
}

export async function loadOwnerIdentityBlock(opts?: {
  ownerName?: string;
  ownerEmail?: string;
}): Promise<string> {
  const company = await getCompanyConfig();
  const env = envOwnerIdentity();
  return formatOwnerIdentityBlock({
    companyName: company.name,
    domain: company.domain,
    ownerName: opts?.ownerName?.trim() || env.ownerName,
    ownerEmail: opts?.ownerEmail?.trim() || env.ownerEmail,
  });
}

export async function loadRecentSessionsBlock(
  userId?: string | null,
  currentThreadId?: string | null,
): Promise<string | null> {
  const id = userId?.trim();
  if (!id) return null;
  try {
    const threads = await storeListChatThreads(id, { archivedOnly: false });
    return formatRecentSessionsBlock(threads, {
      currentThreadId: currentThreadId ?? undefined,
      nowMs: Date.now(),
    });
  } catch {
    return null;
  }
}
