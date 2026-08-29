/**
 * WordPress Plugin Download — reave-connect
 *
 * Streams the latest reave-connect.zip from GitHub Releases.
 * WordPress calls this URL when it auto-updates the plugin.
 *
 * GET /api/wp-update/reave-connect/download
 *
 * Source: https://github.com/eliteweblabs/reave-connect
 * A GitHub Action on that repo rebuilds the zip on every push to main.
 */

import type { APIRoute } from 'astro';
import { checkInMemoryRateLimit } from '../../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../../lib/clientIp';
import { jsonResponse } from '../../../../lib/apiResponse';

const GITHUB_RELEASE_ZIP =
  'https://github.com/eliteweblabs/reave-connect/releases/latest/download/reave-connect.zip';

export const GET: APIRoute = async ({ request }) => {
  const rate = checkInMemoryRateLimit(`wp-update:${clientIp(request)}`, {
    windowMs: 60_000,
    maxPerWindow: 30,
  });
  if (!rate.ok) {
    return jsonResponse(
      { error: 'Too many requests' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const upstream = await fetch(GITHUB_RELEASE_ZIP, {
      headers: { 'User-Agent': 'reave-update-server/1.0' },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return jsonResponse(
        { error: 'Plugin ZIP not found on GitHub Releases', status: upstream.status },
        502,
      );
    }

    const contentLength = upstream.headers.get('content-length');

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="reave-connect.zip"',
        'Cache-Control': 'public, max-age=3600',
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
};
