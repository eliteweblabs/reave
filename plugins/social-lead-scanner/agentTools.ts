import { hasFeature } from '../../src/lib/features';
import {
  getSocialLeadScannerConfig,
  listSocialLeadScannerHits,
  socialLeadScannerSummary,
  updateSocialLeadScannerHit,
} from '../../src/lib/socialLeadScannerStore';
import { runSocialLeadScanner } from '../../src/lib/socialLeadScannerEngine';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_list_social_leads(args: Record<string, unknown>): Promise<string> {
  const statusRaw = String(args.status ?? 'inbox').trim();
  const limit = Math.min(Number(args.limit) || 20, 50);
  const filter =
    statusRaw === 'all'
      ? { limit }
      : statusRaw === 'inbox'
        ? { status: 'inbox' as const, limit }
        : { status: statusRaw as 'new' | 'todo' | 'responded' | 'dismissed', limit };

  const [hits, summary, config] = await Promise.all([
    listSocialLeadScannerHits(filter),
    socialLeadScannerSummary(),
    getSocialLeadScannerConfig(),
  ]);

  return JSON.stringify({
    summary,
    keywords: config.keywords,
    platforms: config.platforms,
    hits: hits.map((h) => ({
      id: h.id,
      platform: h.platform,
      author: h.authorName,
      text: h.text.slice(0, 400),
      keyword: h.keywordMatched,
      status: h.status,
      url: h.url,
      detectedAt: h.detectedAt,
    })),
  });
}

async function handle_run_social_lead_scanner(): Promise<string> {
  const result = await runSocialLeadScanner({ source: 'admin', force: true });
  const summary = await socialLeadScannerSummary();
  return JSON.stringify({ ok: true, result, summary });
}

async function handle_update_social_lead(args: Record<string, unknown>): Promise<string> {
  const id = String(args.id ?? '').trim();
  if (!id) return JSON.stringify({ error: 'id required' });
  const hit = await updateSocialLeadScannerHit(id, {
    status:
      args.status != null
        ? (String(args.status) as 'new' | 'todo' | 'responded' | 'dismissed')
        : undefined,
    replyDraft: args.reply_draft !== undefined ? String(args.reply_draft) : undefined,
  });
  if (!hit) return JSON.stringify({ error: 'Lead not found' });
  return JSON.stringify({ ok: true, hit });
}

export const socialLeadScannerAgentTools: AgentToolModule = {
  id: 'socialLeadScanner',
  enabled: () => hasFeature('social_lead_scanner'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_social_leads',
          description:
            'List keyword-matched social leads (Facebook, Instagram, X, LinkedIn, Reddit, Bluesky, Threads). Use status=inbox for open leads.',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['inbox', 'new', 'todo', 'responded', 'dismissed', 'all'],
              },
              limit: { type: 'number' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_social_lead_scanner',
          description: 'Run the social keyword scanner now (checks configured platforms for watchlist terms).',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_social_lead',
          description: 'Update a social lead status or reply draft.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string', enum: ['new', 'todo', 'responded', 'dismissed'] },
              reply_draft: { type: 'string' },
            },
            required: ['id'],
          },
        },
      },
    ];
  },
  handlers: {
    list_social_leads: handle_list_social_leads,
    run_social_lead_scanner: handle_run_social_lead_scanner,
    update_social_lead: handle_update_social_lead,
  },
};
