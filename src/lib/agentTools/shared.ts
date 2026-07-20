import {
  resolveContact,
  type ClientDataEntry,
  type ClientPortalField,
} from '../contactApi';
import { WORK_PRIORITIES, type WorkPriority } from '../workStore';

export const INVOICE_STATUS_ENUM = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE', 'COMPLETED'] as const;
export const PAYMENT_MODE_ENUM = ['CASH', 'CHECK', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export const RECURRING_STATUS_ENUM = ['ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;

export const lineItemSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Line item name' },
    description: { type: 'string' },
    quantity: { type: 'number', description: 'Defaults to 1 if omitted' },
    price: { type: 'number', description: 'Unit price in whole dollars' },
  },
  required: ['name', 'price'],
  additionalProperties: false,
};

export function parseEmailListArg(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  const items = String(raw)
    .split(/[,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseLineItems(
  raw: unknown,
): Array<{ name: string; description?: string; quantity: number; price: number }> {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter((i) => i && typeof i === 'object' && typeof (i as { price?: unknown }).price === 'number')
    .map((i) => {
      const row = i as { name?: string; description?: string; quantity?: number; price: number };
      return {
        name: (row.name ?? 'Service').trim() || 'Service',
        description: row.description,
        quantity: typeof row.quantity === 'number' && row.quantity > 0 ? row.quantity : 1,
        price: row.price,
      };
    });
}

export function parsePortalFields(raw: unknown): ClientPortalField[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const fields = raw
    .filter((f) => f && typeof f === 'object')
    .map((f) => {
      const row = f as { label?: unknown; value?: unknown };
      return { label: String(row.label ?? '').trim(), value: String(row.value ?? '').trim() };
    })
    .filter((f) => f.label && f.value);
  return fields;
}

export function parsePortalData(raw: unknown): ClientDataEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return raw
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const row = e as Record<string, unknown>;
      const entry: ClientDataEntry = { label: str(row.label) };
      const value = str(row.value);
      const username = str(row.username);
      const password = str(row.password);
      const url = str(row.url);
      if (value) entry.value = value;
      if (username) entry.username = username;
      if (password) entry.password = password;
      if (url) entry.url = url;
      return entry;
    })
    .filter((e) => e.label && (e.value || e.username || e.password || e.url));
}

export async function resolvePortalTarget(args: {
  uid?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}): Promise<{ ok: true; uid: string } | { ok: false; payload: string }> {
  const uid = typeof args.uid === 'string' ? args.uid.trim() : '';
  if (uid) return { ok: true, uid };

  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const email = typeof args.email === 'string' ? args.email.trim() : '';
  const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
  if (!name && !email && !phone) {
    return {
      ok: false,
      payload: JSON.stringify({ error: 'Provide a uid, or a name/email/phone to resolve.' }),
    };
  }

  const resolved = await resolveContact({ name, email, phone });
  if (!resolved.ok) {
    return { ok: false, payload: JSON.stringify({ error: resolved.error, status: resolved.status }) };
  }
  const data = resolved.data as {
    match?: string;
    contact?: { uid?: string; name?: string };
    candidates?: Array<{ uid?: string; name?: string; score?: number }>;
  };
  if ((data.match === 'exact' || data.match === 'likely') && data.contact?.uid) {
    return { ok: true, uid: data.contact.uid };
  }
  return {
    ok: false,
    payload: JSON.stringify({
      needs_selection: true,
      reason: data.match === 'none' ? 'no_match' : 'ambiguous',
      match: data.match ?? 'none',
      candidates: (data.candidates ?? []).map((c) => ({ uid: c.uid, name: c.name, score: c.score })),
      hint: 'Re-call with an exact uid from candidates (or confirm the name).',
    }),
  };
}

export function workExtrasFromArgs(
  args: Record<string, unknown>,
  existing?: {
    priority?: WorkPriority;
    due_date?: string | null;
    value?: number | null;
    tags?: string[];
    source?: string;
  },
) {
  const priorityRaw = args.priority != null ? String(args.priority).trim().toLowerCase() : undefined;
  const priority =
    priorityRaw && WORK_PRIORITIES.includes(priorityRaw as WorkPriority)
      ? (priorityRaw as WorkPriority)
      : existing?.priority;

  const due_date =
    args.due_date != null ? String(args.due_date).trim().slice(0, 10) || null : (existing?.due_date ?? null);

  const value = args.value != null ? Number(args.value) : (existing?.value ?? null);

  let tags: string[] | undefined;
  if (args.tags != null) {
    tags = Array.isArray(args.tags)
      ? (args.tags as unknown[]).map(String).map((t) => t.trim()).filter(Boolean)
      : String(args.tags)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
  } else {
    tags = existing?.tags;
  }

  const source = args.source != null ? String(args.source).trim() : (existing?.source ?? '');

  return { priority, due_date, value, tags: tags ?? [], source };
}
