import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';
import {
  formatWaybackSnapshotList,
  resolveWaybackDateRange,
  waybackFetchSnapshot,
  waybackListSnapshots,
  waybackNearestSnapshot,
} from '../../src/lib/waybackClient';

async function handle_wayback_list_snapshots(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });

  const range = resolveWaybackDateRange(
    args.timestamp !== undefined ? String(args.timestamp) : undefined,
    args.from !== undefined ? String(args.from) : undefined,
    args.to !== undefined ? String(args.to) : undefined,
  );

  const result = await waybackListSnapshots(url, {
    from: range.from,
    to: range.to,
    limit: Math.min(Number(args.limit) || 30, 100),
    htmlOnly: args.html_only !== false,
  });

  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    url: result.url,
    count: result.snapshots.length,
    truncated: result.truncated ?? false,
    summary: formatWaybackSnapshotList(result),
    snapshots: result.snapshots,
  });
}

async function handle_wayback_snapshot_at(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });

  const timestamp = args.timestamp !== undefined ? String(args.timestamp).trim() : undefined;
  const fetchContent = args.fetch_content === true;

  if (fetchContent) {
    const result = await waybackFetchSnapshot(url, timestamp, true);
    if (!result.ok) return JSON.stringify({ error: result.error });
    return JSON.stringify({
      url: result.url,
      snapshot: result.snapshot,
      title: result.title,
      meta_description: result.meta_description,
      content: result.content,
      truncated: result.truncated ?? false,
    });
  }

  const result = await waybackNearestSnapshot(url, timestamp);
  if (!result.ok) return JSON.stringify({ error: result.error });
  if (!result.available || !result.snapshot) {
    return JSON.stringify({
      url: result.url,
      available: false,
      message: timestamp
        ? `No archived snapshot found near ${timestamp}. Try wayback_list_snapshots to browse available dates.`
        : 'No archived snapshots found for this URL.',
    });
  }

  return JSON.stringify({
    url: result.url,
    available: true,
    snapshot: result.snapshot,
  });
}

export const waybackMachineAgentTools: AgentToolModule = {
  id: 'waybackMachine',
  enabled: () => hasFeature('wayback_machine'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'wayback_list_snapshots',
          description:
            'List Internet Archive Wayback Machine captures for a URL. Use to see when a site was archived, browse history, or pick dates for comparison. Timestamps use YYYY, YYYYMM, or YYYYMMDD (e.g. February 2018 → 201802). No API key required.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Site URL or domain, e.g. https://example.com' },
              timestamp: {
                type: 'string',
                description:
                  'Optional single date anchor — YYYY, YYYYMM, or YYYYMMDD. Expands to that year/month/day range when from/to omitted.',
              },
              from: { type: 'string', description: 'Optional range start (YYYY, YYYYMM, or YYYYMMDD)' },
              to: { type: 'string', description: 'Optional range end (YYYY, YYYYMM, or YYYYMMDD)' },
              limit: { type: 'number', description: 'Max snapshots to return (default 30, max 100)' },
              html_only: {
                type: 'boolean',
                description: 'If true (default), only HTML page captures — skip images/assets.',
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'wayback_snapshot_at',
          description:
            'Find the Wayback capture closest to a date — e.g. "what did example.com look like in February 2018?" Pass timestamp as 201802 or 20180215. Set fetch_content=true to return archived page title and readable text. Returns a viewUrl the user can open in a browser. Wayback does not do live change detection; compare two dates with two calls or use site_monitoring for ongoing watches.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Site URL or domain' },
              timestamp: {
                type: 'string',
                description:
                  'Target date — YYYY, YYYYMM, or YYYYMMDD (e.g. 201802 for February 2018). Omit for most recent capture.',
              },
              fetch_content: {
                type: 'boolean',
                description:
                  'If true, fetch and return archived page title + readable text (not just the snapshot URL). Default false.',
              },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    wayback_list_snapshots: handle_wayback_list_snapshots,
    wayback_snapshot_at: handle_wayback_snapshot_at,
  },
};
