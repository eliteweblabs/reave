import { fetchUrl } from './fetchUrlClient';
import { normalizeDomain, normalizePublicUrl } from './publicUrl';

const USER_AGENT = 'Mozilla/5.0 (compatible; ReaveWaybackBot/1.0)';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_SNAPSHOTS = 100;

export type WaybackSnapshot = {
  timestamp: string;
  original: string;
  statusCode: number;
  mimeType: string;
  viewUrl: string;
  capturedAt: string;
};

export type WaybackListResult =
  | { ok: true; url: string; snapshots: WaybackSnapshot[]; truncated?: boolean }
  | { ok: false; error: string };

export type WaybackNearestResult =
  | { ok: true; url: string; snapshot: WaybackSnapshot | null; available: boolean }
  | { ok: false; error: string };

export type WaybackFetchSnapshotResult =
  | {
      ok: true;
      url: string;
      snapshot: WaybackSnapshot;
      title: string;
      content: string;
      meta_description: string;
      truncated?: boolean;
    }
  | { ok: false; error: string };

type WaybackFetchResponse = { ok: true; data: unknown } | { ok: false; error: string };

/** Normalize a URL or domain for Wayback CDX / availability queries. */
export function normalizeWaybackTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const asPublic = normalizePublicUrl(trimmed, false);
  if (asPublic) return asPublic.toString();

  const domain = normalizeDomain(trimmed);
  if (domain) return `http://${domain}/`;

  return null;
}

/** Compact timestamp (1–14 digits) → human-readable capture time. */
export function formatWaybackTimestamp(timestamp: string): string {
  const digits = timestamp.replace(/\D/g, '');
  if (digits.length < 8) return timestamp;
  const y = digits.slice(0, 4);
  const mo = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const h = digits.slice(8, 10) || '00';
  const mi = digits.slice(10, 12) || '00';
  const s = digits.slice(12, 14) || '00';
  return `${y}-${mo}-${d} ${h}:${mi}:${s} UTC`;
}

/** Build a Wayback Machine viewer URL for a capture. */
export function waybackViewUrl(timestamp: string, original: string): string {
  const originalUrl = /^https?:\/\//i.test(original) ? original : `http://${original}`;
  return `https://web.archive.org/web/${timestamp}/${originalUrl}`;
}

function normalizeTimestampInput(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits.length > 14) return undefined;
  return digits;
}

function dateRangeFromTimestamp(timestamp: string | undefined): { from?: string; to?: string } {
  if (!timestamp) return {};
  if (timestamp.length >= 8) {
    return { from: timestamp.slice(0, 8), to: timestamp.slice(0, 8) };
  }
  if (timestamp.length === 6) {
    const year = Number(timestamp.slice(0, 4));
    const month = Number(timestamp.slice(4, 6));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      from: timestamp,
      to: `${timestamp}${String(lastDay).padStart(2, '0')}`,
    };
  }
  if (timestamp.length === 4) {
    return { from: timestamp, to: `${timestamp}1231` };
  }
  return {};
}

async function waybackFetch(url: string): Promise<WaybackFetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*' },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Wayback API HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: true, data: text };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message.includes('abort') ? 'Wayback API request timed out' : message };
  } finally {
    clearTimeout(timer);
  }
}

function snapshotFromCdxRow(row: string[], header: string[]): WaybackSnapshot | null {
  const idx = (name: string) => header.indexOf(name);
  const timestamp = row[idx('timestamp')] ?? '';
  const original = row[idx('original')] ?? '';
  if (!timestamp || !original) return null;
  const statusCode = Number(row[idx('statuscode')] ?? 0) || 0;
  const mimeType = row[idx('mimetype')] ?? '';
  return {
    timestamp,
    original,
    statusCode,
    mimeType,
    viewUrl: waybackViewUrl(timestamp, original),
    capturedAt: formatWaybackTimestamp(timestamp),
  };
}

/** List archived captures for a URL (CDX Server API). */
export async function waybackListSnapshots(
  urlInput: string,
  opts: { from?: string; to?: string; limit?: number; htmlOnly?: boolean } = {},
): Promise<WaybackListResult> {
  const url = normalizeWaybackTarget(urlInput);
  if (!url) return { ok: false, error: 'Invalid URL or domain' };

  const limit = Math.min(Math.max(opts.limit ?? 30, 1), MAX_SNAPSHOTS);
  const params = new URLSearchParams({
    url,
    output: 'json',
    limit: String(limit),
    collapse: 'timestamp:8',
  });
  params.append('filter', 'statuscode:200');
  if (opts.htmlOnly !== false) params.append('filter', 'mimetype:text/html');

  const from = normalizeTimestampInput(opts.from);
  const to = normalizeTimestampInput(opts.to);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const apiUrl = `https://web.archive.org/cdx/search/cdx?${params.toString()}`;
  const result = await waybackFetch(apiUrl);
  if (!result.ok) return result;

  const rows = result.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: true, url, snapshots: [] };
  }

  const header = rows[0] as string[];
  const dataRows = rows.slice(1) as string[][];
  const snapshots = dataRows
    .map((row) => snapshotFromCdxRow(row, header))
    .filter((s): s is WaybackSnapshot => !!s)
    .filter((s) => (opts.htmlOnly === false ? true : s.mimeType.includes('html')));

  return {
    ok: true,
    url,
    snapshots,
    truncated: dataRows.length >= limit,
  };
}

/** Find the capture closest to a date (Availability JSON API). */
export async function waybackNearestSnapshot(
  urlInput: string,
  timestampInput?: string,
): Promise<WaybackNearestResult> {
  const url = normalizeWaybackTarget(urlInput);
  if (!url) return { ok: false, error: 'Invalid URL or domain' };

  const timestamp = normalizeTimestampInput(timestampInput);
  const params = new URLSearchParams({ url });
  if (timestamp) {
    const padded = timestamp.padEnd(14, '0').slice(0, 14);
    params.set('timestamp', padded);
  }

  const apiUrl = `https://archive.org/wayback/available?${params.toString()}`;
  const result = await waybackFetch(apiUrl);
  if (!result.ok) return result;

  const body = result.data as {
    archived_snapshots?: {
      closest?: {
        available?: boolean;
        status?: string;
        url?: string;
        timestamp?: string;
      };
    };
  };

  const closest = body.archived_snapshots?.closest;
  if (!closest?.available || !closest.timestamp || !closest.url) {
    return { ok: true, url, snapshot: null, available: false };
  }

  const snapshot: WaybackSnapshot = {
    timestamp: closest.timestamp,
    original: url,
    statusCode: Number(closest.status) || 200,
    mimeType: 'text/html',
    viewUrl: closest.url.replace(/^http:/, 'https:'),
    capturedAt: formatWaybackTimestamp(closest.timestamp),
  };

  return { ok: true, url, snapshot, available: true };
}

/** Resolve the nearest capture to a date and optionally fetch readable page content. */
export async function waybackFetchSnapshot(
  urlInput: string,
  timestampInput?: string,
  fetchContent = true,
): Promise<WaybackFetchSnapshotResult> {
  const nearest = await waybackNearestSnapshot(urlInput, timestampInput);
  if (!nearest.ok) return nearest;
  if (!nearest.available || !nearest.snapshot) {
    const hint = timestampInput
      ? `No archived snapshot found near ${timestampInput}. Try wayback_list_snapshots to see what dates exist.`
      : 'No archived snapshots found for this URL.';
    return { ok: false, error: hint };
  }

  if (!fetchContent) {
    return {
      ok: true,
      url: nearest.url,
      snapshot: nearest.snapshot,
      title: '',
      content: '',
      meta_description: '',
    };
  }

  const page = await fetchUrl(nearest.snapshot.viewUrl, false);
  if (!page.ok) {
    return {
      ok: false,
      error: `Found snapshot (${nearest.snapshot.capturedAt}) but could not fetch content: ${page.error}`,
    };
  }

  return {
    ok: true,
    url: nearest.url,
    snapshot: nearest.snapshot,
    title: page.data.title,
    content: page.data.content,
    meta_description: page.data.meta_description,
    truncated: page.data.truncated,
  };
}

/** Summarize snapshot list for agent tool output. */
export function formatWaybackSnapshotList(result: Extract<WaybackListResult, { ok: true }>): string {
  if (result.snapshots.length === 0) return `No successful captures found for ${result.url}.`;
  const lines = result.snapshots.slice(0, 20).map(
    (s) => `- ${s.capturedAt} · HTTP ${s.statusCode} · ${s.viewUrl}`,
  );
  const suffix =
    result.snapshots.length > 20
      ? `\n… and ${result.snapshots.length - 20} more (use a narrower date range).`
      : result.truncated
        ? '\n… list may be truncated; narrow the date range for more.'
        : '';
  return `${result.snapshots.length} capture(s) for ${result.url}:\n${lines.join('\n')}${suffix}`;
}

/** Resolve from/to when the agent passes a single month/year timestamp. */
export function resolveWaybackDateRange(timestamp?: string, from?: string, to?: string): {
  from?: string;
  to?: string;
} {
  if (from || to) {
    return {
      from: normalizeTimestampInput(from),
      to: normalizeTimestampInput(to),
    };
  }
  return dateRangeFromTimestamp(normalizeTimestampInput(timestamp));
}
