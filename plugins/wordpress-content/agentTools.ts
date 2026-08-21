/**
 * WordPress content tools — posts, pages, and media via Reave Connect.
 * Feature-gated: wordpress_content + REAVE_WP_API_KEY.
 */

import { hasFeature } from '../../src/lib/features';
import {
  callWpConnect,
  isWpConnectConfigured,
  resolveWpSiteUrl,
} from '../../src/lib/wpConnectClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

function siteOrError(args: Record<string, unknown>): string | { error: string } {
  const siteUrl = resolveWpSiteUrl(String(args.site_url ?? ''));
  if (!siteUrl) {
    return { error: 'site_url is required (or set REAVE_WP_SITE_URL on this install)' };
  }
  return siteUrl;
}

async function run(
  args: Record<string, unknown>,
  action: string,
  params: Record<string, unknown>,
): Promise<string> {
  if (!hasFeature('wordpress_content')) {
    return JSON.stringify({ error: 'WordPress content is not enabled on this install' });
  }
  if (!isWpConnectConfigured()) {
    return JSON.stringify({ error: 'REAVE_WP_API_KEY is not set' });
  }
  const site = siteOrError(args);
  if (typeof site !== 'string') return JSON.stringify(site);
  const result = await callWpConnect(site, action, params);
  return JSON.stringify(result);
}

function contentParams(args: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (args.id != null) params.id = Number(args.id);
  if (args.post_type != null || args.type != null) {
    params.post_type = String(args.post_type ?? args.type);
  }
  if (typeof args.title === 'string') params.title = args.title;
  if (typeof args.content === 'string') params.content = args.content;
  if (typeof args.excerpt === 'string') params.excerpt = args.excerpt;
  if (typeof args.slug === 'string') params.slug = args.slug;
  if (typeof args.status === 'string') params.status = args.status;
  if (typeof args.search === 'string') params.search = args.search;
  if (args.page != null) params.page = Number(args.page);
  if (args.per_page != null) params.per_page = Number(args.per_page);
  if (args.force != null) params.force = Boolean(args.force);
  return params;
}

async function handle_wp_list_content(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  return run(args, 'list_content', contentParams(args));
}

async function handle_wp_get_content(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  return run(args, 'get_content', contentParams(args));
}

async function handle_wp_write_content(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const id = args.id != null ? Number(args.id) : 0;
  const action = Number.isFinite(id) && id > 0 ? 'update_content' : 'create_content';
  return run(args, action, contentParams(args));
}

async function handle_wp_delete_content(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  return run(args, 'delete_content', contentParams(args));
}

async function handle_wp_list_media(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  return run(args, 'list_media', {
    search: typeof args.search === 'string' ? args.search : undefined,
    page: args.page != null ? Number(args.page) : undefined,
    per_page: args.per_page != null ? Number(args.per_page) : undefined,
  });
}

async function handle_wp_upload_media(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  return run(args, 'upload_media', {
    url: typeof args.url === 'string' ? args.url : undefined,
    filename: typeof args.filename === 'string' ? args.filename : undefined,
    data_base64: typeof args.data_base64 === 'string' ? args.data_base64 : undefined,
    title: typeof args.title === 'string' ? args.title : undefined,
    alt: typeof args.alt === 'string' ? args.alt : undefined,
    post_id: args.post_id != null ? Number(args.post_id) : undefined,
  });
}

async function handle_wp_set_featured_image(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  return run(args, 'set_featured_image', {
    post_id: Number(args.post_id ?? args.id ?? 0),
    media_id: Number(args.media_id ?? 0),
  });
}

const siteUrlProp = {
  type: 'string',
  description:
    'WordPress site URL, e.g. https://example.com. Optional when REAVE_WP_SITE_URL is set.',
};

export const wordpressContentAgentTools: AgentToolModule = {
  id: 'wordpress-content',
  enabled: () => hasFeature('wordpress_content') && isWpConnectConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'wp_list_content',
          description:
            'List WordPress posts or pages via Reave Connect. Use post_type "page" or "post". Returns id, title, status, slug, url, and dates.',
          parameters: {
            type: 'object',
            properties: {
              site_url: siteUrlProp,
              post_type: { type: 'string', enum: ['post', 'page'], description: 'Default page' },
              status: {
                type: 'string',
                description: 'Optional status filter: publish, draft, pending, private, future',
              },
              search: { type: 'string', description: 'Title/content search' },
              page: { type: 'number', description: '1-based page (default 1)' },
              per_page: { type: 'number', description: '1–50, default 20' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'wp_get_content',
          description: 'Read one WordPress post or page, including HTML body content.',
          parameters: {
            type: 'object',
            properties: {
              site_url: siteUrlProp,
              id: { type: 'number', description: 'WordPress post/page ID' },
            },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'wp_write_content',
          description:
            'Create or update a WordPress post or page. Pass id to update. New items default to draft — set status "publish" only when the owner asked to publish. Do not claim a change shipped unless this tool returns ok.',
          parameters: {
            type: 'object',
            properties: {
              site_url: siteUrlProp,
              id: { type: 'number', description: 'Existing post/page ID to update' },
              post_type: { type: 'string', enum: ['post', 'page'], description: 'Required when creating' },
              title: { type: 'string' },
              content: { type: 'string', description: 'HTML or Gutenberg-compatible body' },
              excerpt: { type: 'string' },
              slug: { type: 'string' },
              status: {
                type: 'string',
                enum: ['publish', 'draft', 'pending', 'private', 'future'],
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'wp_delete_content',
          description:
            'Trash a WordPress post or page. Pass force:true to permanently delete. Confirm with the owner before calling.',
          parameters: {
            type: 'object',
            properties: {
              site_url: siteUrlProp,
              id: { type: 'number', description: 'WordPress post/page ID' },
              force: { type: 'boolean', description: 'Permanent delete instead of trash' },
            },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'wp_list_media',
          description: 'List media library items on a WordPress site (images and other attachments).',
          parameters: {
            type: 'object',
            properties: {
              site_url: siteUrlProp,
              search: { type: 'string' },
              page: { type: 'number' },
              per_page: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'wp_upload_media',
          description:
            'Upload media to WordPress. Prefer a public url (stock photo or existing file). Optional post_id attaches the file to that post/page.',
          parameters: {
            type: 'object',
            properties: {
              site_url: siteUrlProp,
              url: { type: 'string', description: 'Public image/file URL to sideload' },
              filename: { type: 'string', description: 'Required with data_base64' },
              data_base64: { type: 'string', description: 'Raw file bytes, base64 — max 8MB' },
              title: { type: 'string' },
              alt: { type: 'string', description: 'Alt text for images' },
              post_id: { type: 'number', description: 'Attach to this post/page' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'wp_set_featured_image',
          description: 'Set the featured image on a WordPress post or page from a media library ID.',
          parameters: {
            type: 'object',
            properties: {
              site_url: siteUrlProp,
              post_id: { type: 'number', description: 'Post or page ID' },
              media_id: { type: 'number', description: 'Attachment ID from wp_list_media / wp_upload_media' },
            },
            required: ['post_id', 'media_id'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    wp_list_content: handle_wp_list_content,
    wp_get_content: handle_wp_get_content,
    wp_write_content: handle_wp_write_content,
    wp_delete_content: handle_wp_delete_content,
    wp_list_media: handle_wp_list_media,
    wp_upload_media: handle_wp_upload_media,
    wp_set_featured_image: handle_wp_set_featured_image,
  },
};
