/**
 * Agent tool module: exec_wp
 *
 * Calls the Reave Connect WordPress™ plugin REST API to manage any site
 * remotely — no SSH required. Gated by the wordpress_content add-on
 * plus REAVE_WP_API_KEY.
 */

import { hasFeature } from '../../features';
import {
  callWpConnect,
  isWpConnectConfigured,
  resolveWpSiteUrl,
  WP_API_KEY_ENV,
} from '../../wpConnectClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

const WP_ACTIONS = [
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
  'flush_rewrite',
  'health',
  'search_replace',
  'get_active_theme',
  'list_content',
  'get_content',
  'create_content',
  'update_content',
  'delete_content',
  'get_post_meta',
  'update_post_meta',
  'list_menus',
  'get_menu_items',
  'update_menu_item',
  'list_redirects',
  'create_redirect',
  'delete_redirect',
  'list_media',
  'get_media',
  'upload_media',
  'set_featured_image',
] as const;

async function handle_exec_wp(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const siteUrl = resolveWpSiteUrl(String(args.site_url ?? ''));
  const action = String(args.action ?? '').trim();

  if (!siteUrl) {
    return JSON.stringify({
      error: 'site_url is required (or set REAVE_WP_SITE_URL on this install)',
    });
  }
  if (!action) return JSON.stringify({ error: 'action is required' });

  const params = (args.params as Record<string, unknown>) ?? {};
  const apiKey = args.api_key ? String(args.api_key).trim() : undefined;

  const result = await callWpConnect(siteUrl, action, params, apiKey);
  return JSON.stringify(result);
}

const definition: AgentToolDef = {
  type: 'function',
  function: {
    name: 'exec_wp',
    description:
      'Remotely manage a WordPress site via the reave-connect plugin REST API. ' +
      'Use for site ops (indexing, plugins, cache, rewrite flush, options, health, search_replace), ' +
      'menus, redirects, post meta, and posts/pages/media. ' +
      `Requires the reave-connect plugin on the target site and ${WP_API_KEY_ENV}. ` +
      'Prefer the dedicated wp_* content tools when wordpress_content is enabled. ' +
      'search_replace always dry-runs unless dry_run is false after the owner confirmed. ' +
      'One API key works across ALL sites.',
    parameters: {
      type: 'object',
      properties: {
        site_url: {
          type: 'string',
          description:
            'Full URL of the WordPress site, e.g. https://example.com. Optional when REAVE_WP_SITE_URL is set.',
        },
        action: {
          type: 'string',
          description: `Action to perform. One of: ${WP_ACTIONS.join(', ')}.`,
          enum: [...WP_ACTIONS],
        },
        params: {
          type: 'object',
          description:
            'Action-specific parameters. ' +
            'install_plugin: { slug: "yoast-seo", activate: true }. ' +
            'create_content / update_content: { id?, post_type: "page"|"post", title, content, excerpt, status, slug, meta? }. ' +
            'search_replace: { search, replace, dry_run? } — dry_run defaults true. ' +
            'update_menu_item: { menu_id, item_id, title?, url? }. ' +
            'create_redirect: { from, to, code? }. ' +
            'upload_media: { url } or { filename, data_base64, title?, alt?, post_id? }. ' +
            'set_featured_image: { post_id, media_id }.',
          additionalProperties: true,
        },
        api_key: {
          type: 'string',
          description: `Optional API key override. Defaults to ${WP_API_KEY_ENV}. Never echoed back.`,
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
};

export const wpModule: AgentToolModule = {
  id: 'wp',
  enabled: (_ctx: ToolContext) => hasFeature('wordpress_content') && isWpConnectConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [definition];
  },
  handlers: {
    exec_wp: handle_exec_wp,
  },
};
