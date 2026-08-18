/**
 * Agent tool module: search_stock_photos (Pexels).
 *
 * Feature-gated via `stock_photos` + PEXELS_API_KEY (plugin `configured`).
 *
 * Attribution (Pexels API Terms):
 *   Always link results to pexels.com and credit the photographer when displaying images.
 *   See https://www.pexels.com/api/documentation/#guidelines
 */

import {
  formatPexelsResults,
  isPexelsConfigured,
  pexelsSearchPhotos,
} from '../../src/lib/pexelsClient';
import { hasStockPhotoSearch } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_search_stock_photos(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  if (!isPexelsConfigured()) {
    return JSON.stringify({ error: 'PEXELS_API_KEY is not set on this service' });
  }

  const query = String(args.query ?? '').trim();
  if (!query) return JSON.stringify({ error: 'query is required' });

  const page = args.page != null ? Math.max(1, Number(args.page)) : 1;
  const perPage = args.per_page != null ? Math.max(1, Math.min(80, Number(args.per_page))) : 10;

  const rawOrientation = String(args.orientation ?? '').trim();
  const orientation =
    rawOrientation === 'landscape' ||
    rawOrientation === 'portrait' ||
    rawOrientation === 'square'
      ? rawOrientation
      : undefined;

  const result = await pexelsSearchPhotos({ query, page, perPage, orientation });

  if (!result.ok) {
    return JSON.stringify({ error: result.error, status: result.status });
  }

  return formatPexelsResults(result);
}

export const stockPhotosAgentTools: AgentToolModule = {
  id: 'pexels',
  enabled: () => hasStockPhotoSearch() && isPexelsConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_stock_photos',
          description:
            'Search Pexels for royalty-free stock photos. Returns photo URLs, photographer credit, and Pexels page links. Always credit the photographer and link back to pexels.com when displaying results.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query, e.g. "modern kitchen" or "team meeting"',
              },
              per_page: {
                type: 'number',
                description: 'Number of results to return (1–80, default 10)',
              },
              page: {
                type: 'number',
                description: '1-based page number for pagination (default 1)',
              },
              orientation: {
                type: 'string',
                enum: ['landscape', 'portrait', 'square'],
                description: 'Optional photo orientation filter',
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    search_stock_photos: handle_search_stock_photos,
  },
};
