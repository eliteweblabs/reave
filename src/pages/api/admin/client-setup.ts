/**
 * GET  /api/admin/client-setup — first-run checklist (device + client-owned keys)
 * POST /api/admin/client-setup — complete / skip / later / finish / reopen
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  completeClientSetupStep,
  dismissClientSetup,
  finishClientSetup,
  getClientSetupState,
  reopenClientSetup,
  skipClientSetupStep,
} from '../../../lib/clientSetup';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return json({ ok: true, ...(await getClientSetupState()) });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const stepId = typeof body.stepId === 'string' ? body.stepId : '';
  if (action === 'complete') return json({ ok: true, ...(await completeClientSetupStep(stepId)) });
  if (action === 'skip') return json({ ok: true, ...(await skipClientSetupStep(stepId)) });
  if (action === 'later') return json({ ok: true, ...(await dismissClientSetup(3)) });
  if (action === 'finish') return json({ ok: true, ...(await finishClientSetup()) });
  if (action === 'reopen') return json({ ok: true, ...(await reopenClientSetup()) });
  return json({ ok: false, error: 'Unknown action' }, 400);
}
