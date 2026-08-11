/**
 * Agent tool module: exec_wp
 *
 * Calls the reave-connect WordPress plugin REST API to manage any site
 * remotely — no SSH required. One shared API key (REAVE_WP_API_KEY) works
 * across all sites that have the plugin installed.
 *
 * Supported actions:
 *   status             — ping the plugin, returns WP + PHP version
 *   site_info          — full site details incl. active plugins + indexing status
 *   get_indexing_status — check blog_public setting
 *   enable_indexing    — fix "Discourage search engines" (blog_public = 1)
 *   disable_indexing   — set blog_public = 0
 *   list_plugins       — all installed plugins + active state
 *   activate_plugin    — activate an installed plugin by file slug
 *   deactivate_plugin  — deactivate a plugin
 *   install_plugin     — install from WordPress.org by slug, optionally activate
 *   get_option         — read any wp_options key
 *   update_option      — write any wp_options key
 *   flush_cache        — flush W3TC / WP Rocket / Object Cache / SG Optimizer
 *   get_active_theme   — name + version of the active theme
 */

import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

const WP_API_KEY_ENV = 'REAVE_WP_API_KEY';

function getApiKey(): string {
  return process.env[WP_API_KEY_ENV] ?? '';
}

function isWpConfigured(): boolean {
  return Boolean(getApiKey());
}

async function callWpPlugin(
  siteUrl: string,
  action: string,
  params: Record<string, unknown> = {},
  apiKey?: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const key = apiKey ?? getApiKey();
  if (!key) return { ok: false, error: `${WP_API_KEY_ENV} is not set` };

  // Normalise URL
  const base = siteUrl.replace(/\/$/, '');

  // /status is a GET, everything else is POST to /exec
  const isStatus = action === 'status';
  const url = isStatus
    ? `${base}/wp-json/reave/v1/status`
    : `${base}/wp-json/reave/v1/exec`;

  try {
    const res = await fetch(url, {
      method: isStatus ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Reave-Key': key,
        'User-Agent': 'reave-automation/1.0',
      },
      body: isStatus ? undefined : JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    return { ok: res.ok, data: body, error: res.ok ? undefined : (body as any)?.error };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function handle_exec_wp(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const siteUrl = String(args.site_url ?? '').trim();
  const action  = String(args.action  ?? '').trim();

  if (!siteUrl) return JSON.stringify({ error: 'site_url is required' });
  if (!action)  return JSON.stringify({ error: 'action is required' });

  const params   = (args.params as Record<string, unknown>) ?? {};
  const apiKey   = args.api_key ? String(args.api_key).trim() : undefined;

  const result = await callWpPlugin(siteUrl, action, params, apiKey);
  return JSON.stringify(result);
}

const definition: AgentToolDef = {
  type: 'function',
  function: {
    name: 'exec_wp',
    description:
      'Remotely manage a WordPress site via the reave-connect plugin REST API. ' +
      'Use action "enable_indexing" to fix the noindex/Discourage search engines issue. ' +
      'Use "install_plugin" to install a plugin from WordPress.org. ' +
      'Use "site_info" for a full status overview. ' +
      'Requires the reave-connect plugin to be installed on the target site and REAVE_WP_API_KEY set. ' +
      'One API key works across ALL sites — no per-site credentials needed.',
    parameters: {
      type: 'object',
      properties: {
        site_url: {
          type: 'string',
          description: 'Full URL of the WordPress site, e.g. https://care-elderspecialist.com',
        },
        action: {
          type: 'string',
          description:
            'Action to perform. One of: status, site_info, get_indexing_status, enable_indexing, ' +
            'disable_indexing, list_plugins, activate_plugin, deactivate_plugin, install_plugin, ' +
            'get_option, update_option, flush_cache, get_active_theme.',
          enum: [
            'status',
            'site_info',
            'get_indexing_status',
            'enable_indexing',
            'disable_indexing',
            'list_plugins',
            'activate_plugin',
            'deactivate_plugin',
            'install_plugin',
            'get_option',
            'update_option',
            'flush_cache',
            'get_active_theme',
          ],
        },
        params: {
          type: 'object',
          description:
            'Action-specific parameters. ' +
            'install_plugin: { slug: "yoast-seo", activate: true }. ' +
            'activate_plugin / deactivate_plugin: { slug: "plugin-folder/plugin-file.php" }. ' +
            'get_option / update_option: { key: "blogname", value: "New Name" }.',
          additionalProperties: true,
        },
        api_key: {
          type: 'string',
          description:
            'Optional API key override. Defaults to REAVE_WP_API_KEY env var. ' +
            'Never echoed back in output.',
        },
      },
      required: ['site_url', 'action'],
      additionalProperties: false,
    },
  },
};

export const wpModule: AgentToolModule = {
  id: 'wp',
  enabled: (_ctx: ToolContext) => isWpConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [definition];
  },
  handlers: {
    exec_wp: handle_exec_wp,
  },
};
