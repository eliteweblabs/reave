/**
 * WordPress Plugin Update Server — reave-bridge
 *
 * WordPress checks this endpoint (via the plugin's Update URI header) to
 * determine whether a newer version is available.
 *
 * GET /api/wp-update/reave-bridge/info.json
 */

import type { APIRoute } from 'astro';

// Bump this when releasing a new plugin version.
export const PLUGIN_VERSION = '1.1.0';

export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;

  const info = {
    name:           'Reave Bridge',
    slug:           'reave-bridge',
    version:        PLUGIN_VERSION,
    author:         'Elite Web Labs',
    author_profile: 'https://eliteweblabs.com/',
    requires:       '5.8',
    tested:         '6.7',
    requires_php:   '7.4',
    last_updated:   '2026-08-11',
    description:    'Secure REST API bridge for remote WordPress management via Reave Automation.',
    download_url:   `${origin}/api/wp-update/reave-bridge/download`,
    homepage:       'https://reave.app/',
    sections: {
      description: 'Allows Reave Automation to manage this WordPress site remotely — enable/disable indexing, install & activate plugins, flush cache, update options, redirects, menus, and more.',
      changelog:   '<h4>1.1.0</h4><ul><li>Add /exec dispatcher: indexing, plugins, options, cache, theme.</li></ul><h4>1.0.5</h4><ul><li>Add /posts, /menus, /redirects endpoints.</li></ul>',
    },
  };

  return new Response(JSON.stringify(info), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=21600',
    },
  });
};
