/**
 * POST /api/email/inbox/[id]/expense — log a receipt email as a Crater expense.
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox, storeUpdateEmailInbox } from '../../../../../lib/emailInboxStore';
import {
  buildCraterExpenseFromEmail,
  receiptExpenseLogError,
} from '../../../../../lib/emailReceiptExpense';
import { craterCreateExpense, isCraterConfigured } from '../../../../../lib/craterClient';
import { hasFeature } from '../../../../../lib/features';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('billing') || !isCraterConfigured()) {
    return json({ ok: false, error: 'Crater billing is not configured' }, 503);
  }

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(id);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);

  const blocked = receiptExpenseLogError(event);
  if (blocked) {
    return json({ ok: false, error: blocked }, 409);
  }

  let payload;
  try {
    payload = buildCraterExpenseFromEmail(event);
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      422,
    );
  }

  const created = await craterCreateExpense({
    amount: payload.amount,
    expenseDate: payload.expenseDate,
    categoryName: payload.categoryName,
    notes: payload.notes,
  });
  if (!created.ok) {
    return json({ ok: false, error: created.error, status: created.status }, created.status ?? 502);
  }

  const expense = created.data;
  const routeNote = `Crater expense #${expense.expense_id} · ${payload.notes}`;
  const updated = await storeUpdateEmailInbox(id, {
    markAutomationAck: true,
    automationKind: 'expense_created',
    routeNote,
  });
  if (!updated) return json({ ok: false, error: 'Expense created but inbox update failed' }, 500);

  return json({
    ok: true,
    expense,
    event: updated,
  });
}
