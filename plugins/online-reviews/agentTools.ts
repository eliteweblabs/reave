import { hasFeature } from '../../src/lib/features';
import {
  listOnlineReviews,
  onlineReviewsSummary,
  updateOnlineReview,
  normalizeReviewStatus,
} from '../../src/lib/onlineReviewsStore';
import { syncGoogleReviews } from '../../src/lib/onlineReviewsSync';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_list_online_reviews(args: Record<string, unknown>): Promise<string> {
  const statusRaw = String(args.status ?? 'inbox').trim();
  const limit = Math.min(Number(args.limit) || 20, 50);
  const filter =
    statusRaw === 'all'
      ? { limit }
      : statusRaw === 'inbox'
        ? { status: 'inbox' as const, limit }
        : { status: normalizeReviewStatus(statusRaw), limit };

  const [reviews, summary] = await Promise.all([
    listOnlineReviews(filter),
    onlineReviewsSummary(),
  ]);

  return JSON.stringify({
    summary,
    reviews: reviews.map((r) => ({
      id: r.id,
      platform: r.platform,
      author: r.authorName,
      rating: r.rating,
      text: r.reviewText?.slice(0, 400),
      status: r.status,
      reviewedAt: r.reviewedAt,
      reviewUrl: r.reviewUrl,
    })),
  });
}

async function handle_update_online_review(args: Record<string, unknown>): Promise<string> {
  const id = String(args.id ?? '').trim();
  if (!id) return JSON.stringify({ error: 'id required' });

  const status = args.status !== undefined ? normalizeReviewStatus(args.status) : undefined;
  if (args.status !== undefined && !status) return JSON.stringify({ error: 'Invalid status' });

  const review = await updateOnlineReview(id, {
    status,
    responseDraft:
      args.response_draft !== undefined ? String(args.response_draft) : undefined,
    responseText:
      args.response_text !== undefined ? String(args.response_text) : undefined,
    notes: args.notes !== undefined ? String(args.notes) : undefined,
  });

  if (!review) return JSON.stringify({ error: 'Review not found' });
  return JSON.stringify({ ok: true, review });
}

async function handle_sync_google_reviews(): Promise<string> {
  const result = await syncGoogleReviews();
  const summary = await onlineReviewsSummary();
  return JSON.stringify({ ok: true, syncResult: result, summary });
}

export const onlineReviewsAgentTools: AgentToolModule = {
  id: 'onlineReviews',
  enabled: () => hasFeature('online_reviews'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_online_reviews',
          description:
            'List company reviews (Google, Apple Maps, Yelp, Facebook, Tripadvisor) with response status. Use status=inbox for reviews needing attention.',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['inbox', 'new', 'todo', 'responded', 'dismissed', 'all'],
                description: 'Filter by status (default inbox = new + todo)',
              },
              limit: { type: 'number', description: 'Max rows (default 20)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_online_review',
          description:
            'Update a review response workflow — set status, draft reply, or final response text.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Review UUID' },
              status: { type: 'string', enum: ['new', 'todo', 'responded', 'dismissed'] },
              response_draft: { type: 'string', description: 'Draft reply (not yet posted)' },
              response_text: { type: 'string', description: 'Final response posted on the platform' },
              notes: { type: 'string' },
            },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'sync_google_reviews',
          description: 'Fetch latest Google reviews via Places API (requires GOOGLE_MAPS_API_KEY).',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    list_online_reviews: handle_list_online_reviews,
    update_online_review: handle_update_online_review,
    sync_google_reviews: handle_sync_google_reviews,
  },
};
