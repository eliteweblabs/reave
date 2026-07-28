/**
 * /api/admin/external-plugins
 *
 * GET  → returns active external plugin hooks for client-side injection
 * POST → triggers a re-sync of all REAVE_PLUGINS manifests from remote URLs
 *
 * The admin JS polls GET on startup to inject sidebar items, footer nav
 * entries, and user-profile sections without a redeploy.
 */

import type { APIRoute } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  getActiveExternalPlugins,
  syncExternalPlugins,
  invalidateExternalPluginCache,
  type ExternalPluginManifest,
} from '../../../lib/externalPluginRegistry';

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const plugins = await getActiveExternalPlugins();

    // Shape the response: flatten hooks for easy client consumption
    const sidebar = plugins.flatMap((p) =>
      (p.hooks.sidebar ?? []).map((h) => ({
        pluginId: p.id,
        pluginName: p.name,
        ...h,
        // Resolve relative badge endpoints to absolute URLs
        badgeEndpoint: h.badgeEndpoint
          ? h.badgeEndpoint.startsWith('http')
            ? h.badgeEndpoint
            : `${p.baseUrl.replace(/\/$/, '')}${h.badgeEndpoint}`
          : undefined,
        // Resolve relative hrefs to absolute URLs
        href: h.href.startsWith('http')
          ? h.href
          : `${p.baseUrl.replace(/\/$/, '')}${h.href}`,
      })),
    );

    const nav_footer = plugins.flatMap((p) =>
      (p.hooks.nav_footer ?? []).map((h) => ({
        pluginId: p.id,
        ...h,
        href: h.href.startsWith('http')
          ? h.href
          : `${p.baseUrl.replace(/\/$/, '')}${h.href}`,
      })),
    );

    const user_profile = plugins.flatMap((p) =>
      (p.hooks.user_profile ?? []).map((s) => ({
        pluginId: p.id,
        pluginName: p.name,
        ...s,
      })),
    );

    const dashboard_widgets = plugins
      .filter((p) => !!p.hooks.dashboard_widget)
      .map((p) => ({
        pluginId: p.id,
        pluginName: p.name,
        ...p.hooks.dashboard_widget!,
        endpoint: p.hooks.dashboard_widget!.endpoint.startsWith('http')
          ? p.hooks.dashboard_widget!.endpoint
          : `${p.baseUrl.replace(/\/$/, '')}${p.hooks.dashboard_widget!.endpoint}`,
      }));

    return new Response(
      JSON.stringify({
        plugins: plugins.map((p: ExternalPluginManifest) => ({
          id: p.id,
          name: p.name,
          version: p.version,
          description: p.description,
          baseUrl: p.baseUrl,
        })),
        hooks: { sidebar, nav_footer, user_profile, dashboard_widgets },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    invalidateExternalPluginCache();
    const result = await syncExternalPlugins();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
