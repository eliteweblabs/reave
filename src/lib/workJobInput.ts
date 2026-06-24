/**
 * POST /api/work — create { slug?, title, contact_uid, status?, body? }
 * PUT accepts the same shape on /api/work/[slug]
 */

import type { WorkJobInput, WorkStatus } from './workStore';
import { WORK_STATUSES } from './workStore';

function parseStatus(raw: unknown): WorkStatus | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  return WORK_STATUSES.includes(s as WorkStatus) ? (s as WorkStatus) : undefined;
}

export function parseWorkJobInput(body: Record<string, unknown>): WorkJobInput | { error: string } {
  const title = String(body.title ?? '').trim();
  const contact_uid = String(body.contact_uid ?? '').trim();
  const contact_name = String(body.contact_name ?? '').trim();
  const client = String(body.client ?? '').trim();
  const jobBody = String(body.body ?? '').trim();
  const status = parseStatus(body.status);

  if (!title) return { error: 'title is required' };
  if (!contact_uid && !client) return { error: 'Select a client' };

  return {
    title,
    contact_uid: contact_uid || undefined,
    contact_name: contact_name || undefined,
    client: client || undefined,
    status,
    body: jobBody,
  };
}
