/**
 * GET  /api/admin/vapi — Vapi admin plugin status
 * POST /api/admin/vapi — sync assistant branding from Company details
 */
import type { APIContext } from 'astro';
import { getCompanyBrandContext } from '../../../lib/companyConfig';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import {
  isVapiAdminConfigured,
  isVapiAdminPluginEnabled,
  vapiAssistantId,
  vapiPublicKey,
} from '../../../lib/vapiPlugin';
import {
  syncVapiAssistantBrand,
  vapiFirstMessageTemplate,
  isVapiSyncConfigured,
} from '../../../lib/vapiAssistantSync';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const brand = await getCompanyBrandContext(context.request);

  return json({
    ok: true,
    pluginEnabled: isVapiAdminPluginEnabled(),
    configured: isVapiAdminConfigured(),
    syncReady: isVapiSyncConfigured(),
    assistantId: vapiAssistantId() ?? null,
    publicKeySet: Boolean(vapiPublicKey()),
    companyName: brand.name,
    firstMessageTemplate: vapiFirstMessageTemplate(),
    note:
      'Admin Vapi plugin syncs assistant name/prompt from Company details. The public homepage voice widget is a separate installation setting (PUBLIC_INSTALL_HOMEPAGE_VOICE).',
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  if (!isVapiAdminPluginEnabled()) {
    return json({ ok: false, error: 'Enable the Vapi plugin in Admin → Plugins first.' }, 403);
  }

  const brand = await getCompanyBrandContext(context.request);
  const result = await syncVapiAssistantBrand(brand);

  if (!result.ok) {
    const status = result.skipped ? 400 : 502;
    return json({ ok: false, error: result.error, skipped: result.skipped ?? false }, status);
  }

  return json({
    ok: true,
    assistantId: result.assistantId,
    companyName: result.companyName,
    firstMessage: result.firstMessage,
  });
}
