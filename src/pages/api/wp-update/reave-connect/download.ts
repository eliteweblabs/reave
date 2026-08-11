/**
 * WordPress Plugin Download — reave-connect
 *
 * Serves the latest reave-connect.zip by streaming it from GitHub raw.
 * WordPress calls this URL when it auto-updates the plugin.
 *
 * GET /api/wp-update/reave-connect/download
 *
 * The ZIP is built from the wp-plugin/reave-connect/ directory in the repo.
 * To release a new version:
 *   1. Edit the plugin PHP (bump Version header + REAVE_CONNECT_VERSION constant)
 *   2. Update PLUGIN_VERSION in info.json.ts
 *   3. Run: cd wp-plugin && zip -r reave-connect.zip reave-connect/
 *   4. Commit reave-connect.zip to the repo root (wp-plugin/reave-connect.zip)
 *   5. Deploy — WordPress sites will auto-update within 6 hours
 */

import type { APIRoute } from 'astro';

const GITHUB_RAW_ZIP =
  'https://raw.githubusercontent.com/eliteweblabs/reave/main/wp-plugin/reave-connect.zip';

export const GET: APIRoute = async () => {
  try {
    const upstream = await fetch(GITHUB_RAW_ZIP, {
      headers: { 'User-Agent': 'reave-update-server/1.0' },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: 'Plugin ZIP not found on GitHub', status: upstream.status }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const blob = await upstream.arrayBuffer();

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="reave-connect.zip"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
