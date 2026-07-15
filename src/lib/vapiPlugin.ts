/**
 * Admin Vapi plugin — assistant sync & credentials for the Business OS admin.
 *
 * Separate from:
 * - `voice` plugin (Telnyx inbound phone agent)
 * - Homepage voice widget (`PUBLIC_INSTALL_HOMEPAGE_VOICE` / installation front-end)
 */
import { getInstallConfigSync } from './installConfig';
import { getCompanyConfig, type CompanyConfig } from './companyConfig';
import { hasFeature } from './features';
import { serverEnv } from './serverEnv';

export function isVapiAdminPluginEnabled(): boolean {
  return hasFeature('vapi');
}

function vapiAssistantIdFromEnv(): string | undefined {
  return (
    serverEnv('VAPI_ASSISTANT_ID')?.trim() ||
    serverEnv('PUBLIC_VAPI_ASSISTANT_ID')?.trim() ||
    undefined
  );
}

/** Sync env fallback — prefer resolveVapiAssistantId() at runtime. */
export function vapiAssistantId(): string | undefined {
  return vapiAssistantIdFromEnv();
}

export function resolveVapiAssistantId(company?: Pick<CompanyConfig, 'vapiAssistantId'>): string | undefined {
  const fromAdmin = company?.vapiAssistantId?.trim();
  if (fromAdmin) return fromAdmin;
  return vapiAssistantIdFromEnv();
}

export async function getResolvedVapiAssistantId(request?: Request): Promise<string | undefined> {
  const company = await getCompanyConfig(request);
  return resolveVapiAssistantId(company);
}

export function vapiPublicKey(): string | undefined {
  return serverEnv('PUBLIC_VAPI_PUBLIC_KEY')?.trim() || undefined;
}

/** Admin plugin: private API key + assistant id (build sync, manual sync API). */
export function isVapiAdminConfigured(company?: Pick<CompanyConfig, 'vapiAssistantId'>): boolean {
  if (!isVapiAdminPluginEnabled()) return false;
  return Boolean(serverEnv('VAPI_API_KEY')?.trim() && resolveVapiAssistantId(company));
}

/**
 * Installation-specific homepage voice widget (Vapi web SDK).
 * Not gated on the admin `vapi` plugin — each deploy opts in explicitly or via legacy Vapi env.
 */
export function isHomepageVoiceWidgetEnabled(company?: Pick<CompanyConfig, 'vapiAssistantId'>): boolean {
  const installVoice = getInstallConfigSync().homepageVoice;
  if (installVoice === false) return false;
  if (installVoice === true) {
    return Boolean(vapiPublicKey() && resolveVapiAssistantId(company));
  }

  const explicit = serverEnv('PUBLIC_INSTALL_HOMEPAGE_VOICE')?.trim().toLowerCase();
  if (explicit === '0' || explicit === 'false') return false;
  if (explicit === '1' || explicit === 'true') return true;
  return Boolean(vapiPublicKey() && resolveVapiAssistantId(company));
}
