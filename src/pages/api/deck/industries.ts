/**
 * Public list of enabled deck industries (for `/deck?type=` and marketing UI).
 */
import type { APIContext } from 'astro';
import { listEnabledDeckIndustries } from '../../../lib/deckIndustriesStore';

export const prerender = false;

export async function GET(_context: APIContext): Promise<Response> {
  const industries = await listEnabledDeckIndustries();
  return new Response(
    JSON.stringify({
      ok: true,
      industries: industries.map(({ slug, label, sortOrder }) => ({
        slug,
        label,
        sortOrder,
      })),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
}
