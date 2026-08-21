/**
 * WordPress Plugin Update Server — reave-connect
 *
 * WordPress checks this endpoint (via the plugin's Update URI header) to
 * determine whether a newer version is available. Returns JSON matching the
 * shape WordPress expects for custom update servers.
 *
 * GET /api/wp-update/reave-connect/info.json
 */

import type { APIRoute } from 'astro';

// Bump this when releasing a new plugin version.
export const PLUGIN_VERSION = '1.1.0';

export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;

  const info = {
    name:         'Reave Connect',
    slug:         'reave-connect',
    version:      PLUGIN_VERSION,
    author:       'Elite Web Labs',
    author_profile: 'https://eliteweblabs.com/',
    requires:     '5.8',
    tested:       '6.7',
    requires_php: '7.4',
    last_updated: '2026-08-21',
    description:  'Secure REST API bridge for remote WordPress management via Reave Automation — site ops plus posts, pages, and media.',
    download_url: `${origin}/api/wp-update/reave-connect/download`,
    homepage:     'https://reave.app/',
    sections: {
      description: 'Allows Reave Automation to manage this WordPress site remotely — posts, pages, and media, plus indexing, plugins, cache, and options.',
      changelog:   '<h4>1.1.0</h4><ul><li>Posts, pages, and media CRUD for the WordPress content add-on.</li></ul><h4>1.0.0</h4><ul><li>Initial release.</li></ul>',
    },
  };

  return new Response(JSON.stringify(info), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=21600', // 6 hours
    },
  });
};
