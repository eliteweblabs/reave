/**
 * GET  /api/admin/vapi — Vapi admin plugin status
 * POST /api/admin/vapi — sync assistant branding from Company details
 */
import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { getCompanyBrandContext, getCompanyConfig } from '../../../lib/companyConfig';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  isVapiAdminConfigured,
  isVapiAdminPluginEnabled,
  resolveVapiAssistantId,
  vapiPublicKey,
} from '../../../lib/vapiPlugin';
import {
  syncVapiAssistantBrand,
  vapiFirstMessageTemplate,
  vapiSystemPromptTemplate,
  isVapiSyncConfigured,
} from '../../../lib/vapiAssistantSync';

export const prerender = false;


function vapiTemplatesFromCompany(company: Awaited<ReturnType<typeof getCompanyConfig>>) {
  return {
    assistantId: company.vapiAssistantId || undefined,
    firstMessage: company.vapiFirstMessage || undefined,
    systemPrompt: company.vapiSystemPrompt || undefined,
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const company = await getCompanyConfig(context.request);
  const brand = await getCompanyBrandContext(context.request);
  const templates = vapiTemplatesFromCompany(company);

  return json({
    ok: true,
    pluginEnabled: isVapiAdminPluginEnabled(),
    configured: isVapiAdminConfigured(company),
    syncReady: isVapiSyncConfigured(templates),
    assistantId: resolveVapiAssistantId(company) ?? null,
    publicKeySet: Boolean(vapiPublicKey()),
    companyName: brand.name,
    firstMessageTemplate: vapiFirstMessageTemplate(templates),
    systemPromptTemplate: vapiSystemPromptTemplate(templates),
    note:
      'Admin Vapi plugin syncs assistant name/prompt from Admin → Vapi and Company details. The public Live Speak Agent Widget is a separate installation setting (PUBLIC_INSTALL_HOMEPAGE_VOICE).',
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isVapiAdminPluginEnabled()) {
    return json({ ok: false, error: 'Enable "vapi" in the install config features array.' }, 403);
  }

  const company = await getCompanyConfig(context.request);
  const brand = await getCompanyBrandContext(context.request);
  const templates = vapiTemplatesFromCompany(company);
  const result = await syncVapiAssistantBrand(brand, { templates });

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
