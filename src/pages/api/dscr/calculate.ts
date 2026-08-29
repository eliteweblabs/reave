/**
 * POST /api/dscr/calculate — lender-grade DSCR for the public page + admin panel.
 * GET  /api/dscr/calculate — same, from query params (shareable links).
 */
import type { APIContext } from 'astro';
import {
  calculateDscr,
  parseDscrInput,
  serializeDscrResult,
} from '../../../lib/dscrCalculator';
import { hasFeature } from '../../../lib/features';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function notEnabled(): Response {
  return jsonResponse({ ok: false, error: 'dscr_calculator not enabled' }, 404);
}

function fromParams(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

function run(raw: Record<string, unknown>): Response {
  const parsed = parseDscrInput(raw);
  if ('error' in parsed) return jsonResponse({ ok: false, error: parsed.error }, 400);
  const result = calculateDscr(parsed);
  return jsonResponse({ ok: true, result: serializeDscrResult(result) });
}

export async function GET(context: APIContext): Promise<Response> {
  if (!hasFeature('dscr_calculator')) return notEnabled();
  return run(fromParams(context.url.searchParams));
}

export async function POST(context: APIContext): Promise<Response> {
  if (!hasFeature('dscr_calculator')) return notEnabled();
  let body: Record<string, unknown> = {};
  try {
    const parsed = await context.request.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  return run(body);
}
