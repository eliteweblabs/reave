/**
 * GET  /api/admin/practice-gate — office pin, radius/county gate, matching courts
 * PUT  /api/admin/practice-gate — update gate and refresh courts-in-radius knowledge
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { radiusCircle, renderCourtsKnowledge, resolveCourtGate } from '../../../lib/courtRadius';
import { dbWriteKnowledge, isKnowledgeDbConfigured } from '../../../lib/pgKnowledge';
import { knowledgeIndustryId } from '../../../lib/knowledgeIndustry';
import {
  PRACTICE_AREAS,
  PRACTICE_GATE_MODES,
  US_STATES,
  setPracticeGate,
  type PracticeAreaId,
  type PracticeGateMode,
} from '../../../lib/practiceGate';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function refreshCourtsDoc() {
  const resolved = await resolveCourtGate();
  if (!isKnowledgeDbConfigured()) return resolved;
  const markdown = renderCourtsKnowledge(resolved);
  await dbWriteKnowledge({
    slug: 'courts-in-radius',
    title: 'Courts in this office’s gate',
    content: markdown.replace(/^---[\s\S]*?---\n/, ''),
    tags: ['courts', 'map', resolved.gate.practiceArea],
  });
  return resolved;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const resolved = await resolveCourtGate();
  return json({
    ok: true,
    industry: knowledgeIndustryId(),
    ...resolved,
    practiceAreas: PRACTICE_AREAS,
    gateModes: PRACTICE_GATE_MODES,
    usStates: US_STATES,
    circle: resolved.origin ? radiusCircle(resolved.origin, resolved.gate.radiusMi) : null,
  });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }
  const counties = Array.isArray(body.counties) ? body.counties.map(String) : undefined;
  const states = Array.isArray(body.states) ? body.states.map(String) : undefined;
  await setPracticeGate({
    radiusMi: typeof body.radiusMi === 'number' ? body.radiusMi : undefined,
    counties,
    states,
    practiceArea: typeof body.practiceArea === 'string' ? (body.practiceArea as PracticeAreaId) : undefined,
    gateMode: typeof body.gateMode === 'string' ? (body.gateMode as PracticeGateMode) : undefined,
  });
  const resolved = await refreshCourtsDoc();
  return json({
    ok: true,
    industry: knowledgeIndustryId(),
    ...resolved,
    practiceAreas: PRACTICE_AREAS,
    gateModes: PRACTICE_GATE_MODES,
    usStates: US_STATES,
    circle: resolved.origin ? radiusCircle(resolved.origin, resolved.gate.radiusMi) : null,
  });
}
