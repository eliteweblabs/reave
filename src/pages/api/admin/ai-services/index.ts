/**
 * GET  /api/admin/ai-services — platform AI status + custom registry + model prefs
 * POST /api/admin/ai-services — add a custom AI service record
 */
import type { APIContext } from 'astro';
import { listBuiltinAiServices } from '../../../../lib/aiServices';
import {
  aiServicesStorageBackend,
  createCustomAiService,
  listCustomAiServices,
  normalizeAiServiceCreate,
} from '../../../../lib/aiServicesStore';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const [built, custom] = await Promise.all([listBuiltinAiServices(), listCustomAiServices()]);
    return jsonResponse({
      ok: true,
      builtins: built.builtins,
      custom,
      model: built.model,
      anthropicBalance: built.anthropicBalance,
      anthropicKeySource: built.anthropicKeySource,
      storage: aiServicesStorageBackend(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const normalized = normalizeAiServiceCreate(body);
  if (typeof normalized === 'string') {
    return jsonResponse({ ok: false, error: normalized }, 400);
  }

  try {
    const service = await createCustomAiService(normalized);
    if (!service) return jsonResponse({ ok: false, error: 'Failed to save service.' }, 500);
    return jsonResponse({ ok: true, service }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
