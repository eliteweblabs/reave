import type { APIRoute } from 'astro';
import { searchClients } from '../../../lib/clientSearch';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const started = performance.now();

  const q = (url.searchParams.get('q') ?? '').trim();
  const limitParam = url.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '10', 10) || 10, 1), 50);

  const results = searchClients(q, limit);
  const tookMs = +(performance.now() - started).toFixed(2);

  return new Response(
    JSON.stringify({
      query: q,
      count: results.length,
      took_ms: tookMs,
      results,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};
