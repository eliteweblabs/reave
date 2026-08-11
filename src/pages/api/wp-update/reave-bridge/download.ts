/**
 * WordPress Plugin Download — reave-bridge
 *
 * Streams the latest reave-bridge.zip from the GitHub Releases API.
 * WordPress calls this URL when it auto-updates the plugin.
 *
 * GET /api/wp-update/reave-bridge/download
 *
 * The ZIP is published automatically by the GitHub Actions release workflow
 * in eliteweblabs/reave-bridge on every push to main.
 */

import type { APIRoute } from 'astro';

const GITHUB_RELEASE_ZIP =
  'https://github.com/eliteweblabs/reave-bridge/releases/latest/download/reave-bridge.zip';

export const GET: APIRoute = async () => {
  try {
    const upstream = await fetch(GITHUB_RELEASE_ZIP, {
      headers: { 'User-Agent': 'reave-update-server/1.0' },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: 'Plugin ZIP not found on GitHub Releases', status: upstream.status }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const blob = await upstream.arrayBuffer();

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="reave-bridge.zip"',
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
