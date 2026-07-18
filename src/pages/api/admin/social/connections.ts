/**
 * GET /api/admin/social/connections — per-platform OAuth connection status for
 * the Socials settings UI. Reports whether each platform is configured (client
 * credentials present), whether an account is connected, and the callback URL
 * to register with the provider. Never exposes raw tokens.
 */
import type { APIContext } from 'astro';
import { requestOrigin } from '../../../../lib/requestOrigin.ts';
import { OAUTH_CONFIGS, callbackUrl, getOAuthCredentials } from '../../../../lib/social/oauth.ts';
import { listConnections } from '../../../../lib/social/tokenStore.ts';
import type { SocialPlatformId } from '../../../../lib/social/types.ts';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const platforms = Object.keys(OAUTH_CONFIGS) as SocialPlatformId[];
  const origin = requestOrigin(context.request);
  const statuses = await listConnections(platforms);
  const byPlatform = new Map(statuses.map((s) => [s.platform, s]));

  const connections = platforms.map((platform) => {
    const cfg = OAUTH_CONFIGS[platform];
    const configured = getOAuthCredentials(cfg) != null;
    const status = byPlatform.get(platform);
    return {
      platform,
      label: cfg.label,
      configured,
      connected: status?.connected ?? false,
      accountLabel: status?.accountLabel ?? null,
      connectedAt: status?.connectedAt ?? null,
      expiresAt: status?.expiresAt ?? null,
      expired: status?.expired ?? false,
      scope: status?.scope ?? null,
      connectUrl: `/api/admin/social/connect/${platform}`,
      disconnectUrl: `/api/admin/social/disconnect/${platform}`,
      callbackUrl: callbackUrl(origin, platform),
      developerPortal: cfg.developerPortal,
      setupHint: cfg.setupHint,
      envVars: [cfg.clientIdEnv, cfg.clientSecretEnv],
    };
  });

  return json({ ok: true, connections });
}
