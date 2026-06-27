/**
 * POST /api/work — create { slug?, title, contact_uid, status?, body? }
 * PUT accepts the same shape on /api/work/[slug]
 */

import type { WorkJobInput, WorkPriority, WorkStatus } from './workStore';
import { WORK_PRIORITIES, WORK_STATUSES } from './workStore';

function parseStatus(raw: unknown): WorkStatus | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  return WORK_STATUSES.includes(s as WorkStatus) ? (s as WorkStatus) : undefined;
}

function parsePriority(raw: unknown): WorkPriority | undefined {
  const p = String(raw ?? '').trim().toLowerCase();
  return WORK_PRIORITIES.includes(p as WorkPriority) ? (p as WorkPriority) : undefined;
}

function parseTags(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw.map(String).map((t) => t.trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  return s.split(',').map((t) => t.trim()).filter(Boolean);
}

function parseValue(raw: unknown): number | null | undefined {
  if (raw == null || raw === '') return raw === '' ? null : undefined;
  const n = Number(String(raw).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function parseDueDate(raw: unknown): string | null | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

export function parseWorkJobInput(body: Record<string, unknown>): WorkJobInput | { error: string } {
  const title = String(body.title ?? '').trim();
  const contact_uid = String(body.contact_uid ?? '').trim();
  const contact_name = String(body.contact_name ?? '').trim();
  const client = String(body.client ?? '').trim();
  const jobBody = String(body.body ?? '').trim();
  const status = parseStatus(body.status);
  const priority = parsePriority(body.priority);
  const due_date = parseDueDate(body.due_date);
  const value = parseValue(body.value);
  const tags = parseTags(body.tags);
  const source = body.source != null ? String(body.source).trim() : undefined;
  const record_origin = body.record_origin != null ? String(body.record_origin).trim() : undefined;

  if (!title) return { error: 'title is required' };
  if (!contact_uid && !client) return { error: 'Select a client' };

  return {
    title,
    contact_uid: contact_uid || undefined,
    contact_name: contact_name || undefined,
    client: client || undefined,
    status,
    priority,
    due_date,
    value,
    tags,
    source,
    record_origin,
    body: jobBody,
  };
}
