/**
 * Admin Vapi plugin — assistant sync & credentials for the Business OS admin.
 *
 * Separate from:
 * - `voice` plugin (Telnyx inbound phone agent)
 * - Homepage voice widget (`PUBLIC_INSTALL_HOMEPAGE_VOICE` / installation front-end)
 */
import { hasFeature } from './features';
import { serverEnv } from './serverEnv';

export function isVapiAdminPluginEnabled(): boolean {
  return hasFeature('vapi');
}

export function vapiAssistantId(): string | undefined {
  return (
    serverEnv('VAPI_ASSISTANT_ID')?.trim() ||
    serverEnv('PUBLIC_VAPI_ASSISTANT_ID')?.trim() ||
    undefined
  );
}

export function vapiPublicKey(): string | undefined {
  return serverEnv('PUBLIC_VAPI_PUBLIC_KEY')?.trim() || undefined;
}

/** Admin plugin: private API key + assistant id (build sync, manual sync API). */
export function isVapiAdminConfigured(): boolean {
  if (!isVapiAdminPluginEnabled()) return false;
  return Boolean(serverEnv('VAPI_API_KEY')?.trim() && vapiAssistantId());
}

/**
 * Installation-specific homepage voice widget (Vapi web SDK).
 * Not gated on the admin `vapi` plugin — each deploy opts in explicitly or via legacy Vapi env.
 */
export function isHomepageVoiceWidgetEnabled(): boolean {
  const explicit = serverEnv('PUBLIC_INSTALL_HOMEPAGE_VOICE')?.trim().toLowerCase();
  if (explicit === '0' || explicit === 'false') return false;
  if (explicit === '1' || explicit === 'true') return true;
  return Boolean(vapiPublicKey() && vapiAssistantId());
}
