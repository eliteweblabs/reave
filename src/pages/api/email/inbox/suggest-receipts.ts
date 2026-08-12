/**
 * GET  /api/email/inbox/suggest-receipts — scan Review/All for missing tax receipts
 * POST /api/email/inbox/suggest-receipts — file selected messages as receipts
 */

import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import {
  storeGetEmailInbox,
  storeListEmailInboxReceiptScan,
  storeUpdateEmailInbox,
} from '../../../../lib/emailInboxStore';
import { suggestReceiptCandidate, formatUsdAmount, extractMonetaryAmountFromEmail } from '../../../../lib/emailMoney';
import { auditForManualReceiptMark } from '../../../../lib/emailClassificationAudit';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;


function parseDays(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.max(Math.floor(n), 1), 90);
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const days = parseDays(context.url.searchParams.get('days'));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await storeListEmailInboxReceiptScan(500, since);

  const candidates = rows
    .map((row) => {
      const hit = suggestReceiptCandidate({
        from: row.from,
        subject: row.subject,
        summary: row.summary,
        bodySnippet: row.bodySnippet,
        bodyText: row.bodyText,
        category: row.category,
        status: row.status,
        routeNote: row.routeNote,
      });
      if (!hit) return null;
      return {
        id: row.id,
        receivedAt: row.receivedAt,
        from: row.from,
        subject: row.subject,
        summary: row.summary || row.bodySnippet || row.subject,
        category: row.category,
        status: row.status,
        amount: hit.amount,
        amountLabel: formatUsdAmount(hit.amount),
        routeNote: hit.routeNote,
        reason: hit.reason,
        score: hit.score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => b.score - a.score || new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  return json({
    ok: true,
    days,
    scanned: rows.length,
    count: candidates.length,
    candidates,
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).ids : null;
  if (!Array.isArray(raw) || raw.length === 0) {
    return json({ ok: false, error: 'ids must be a non-empty array' }, 400);
  }
  if (raw.length > 100) {
    return json({ ok: false, error: 'Too many ids (max 100)' }, 400);
  }

  const ids = raw.map((id) => String(id).trim()).filter(Boolean);
  const filed: Array<{ id: string; amount: number; routeNote: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    const existing = await storeGetEmailInbox(id);
    if (!existing) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }
    if (existing.category === 'receipt') {
      skipped.push({ id, reason: 'already receipt' });
      continue;
    }
    const hit = suggestReceiptCandidate({
      from: existing.from,
      subject: existing.subject,
      summary: existing.summary,
      bodySnippet: existing.bodySnippet,
      bodyText: existing.bodyText,
      category: existing.category,
      status: existing.status,
      routeNote: existing.routeNote,
    });
    const amount = hit?.amount ?? extractMonetaryAmountFromEmail(existing);
    const routeNote =
      hit?.routeNote ??
      (amount != null ? `Tax receipt — ${formatUsdAmount(amount)}` : 'Tax receipt');

    const event = await storeUpdateEmailInbox(id, {
      category: 'receipt',
      action: 'receipt',
      status: 'RECEIPT',
      routeNote,
      classificationAudit: auditForManualReceiptMark({
        source: 'suggest_receipts',
        amount: amount ?? null,
        reason: hit?.reason,
      }),
    });
    if (!event) {
      skipped.push({ id, reason: 'update failed' });
      continue;
    }
    filed.push({
      id,
      amount: amount ?? 0,
      routeNote,
    });
  }

  return json({ ok: true, filed, skipped, requested: ids.length });
}
