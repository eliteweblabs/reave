/**
 * POST /api/github/upload-binary
 *
 * Commit a binary file (PNG, SVG, PDF, etc.) to a GitHub repo via the
 * Contents API (base64 encoding). Accepts either:
 *   - { repo, path, url, message, branch? }        — fetch from a public URL
 *   - { repo, path, base64, filename, message, branch? } — raw base64 payload
 *
 * Returns { ok, commit_sha, commit_url, file_url }
 * Requires admin auth + GITHUB_TOKEN with repo Contents write.
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

const GITHUB_API = 'https://api.github.com';

interface UploadRequest {
  repo: string;       // owner/repo e.g. eliteweblabs/paradigmhydroseed-site
  path: string;       // target path e.g. public/logo.png
  message?: string;   // commit message
  branch?: string;    // defaults to main
  url?: string;       // public URL to fetch binary from
  base64?: string;    // raw base64-encoded file content
  filename?: string;  // original filename (for mime type hint)
}

async function getFileSha(
  repo: string,
  path: string,
  branch: string,
  token: string
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    if (!res.ok) return undefined;
    const data = await res.json() as { sha?: string };
    return data.sha;
  } catch {
    return undefined;
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const token = import.meta.env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse({ ok: false, error: 'GITHUB_TOKEN not configured' }, 500);
  }

  let body: UploadRequest;
  try {
    body = await context.request.json() as UploadRequest;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const { repo, path: filePath, message, branch = 'main', url, base64, filename } = body;

  if (!repo || !filePath) {
    return jsonResponse({ ok: false, error: 'repo and path are required' }, 400);
  }

  if (!url && !base64) {
    return jsonResponse({ ok: false, error: 'Either url or base64 is required' }, 400);
  }

  // Validate repo format
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    return jsonResponse({ ok: false, error: 'Invalid repo format (owner/name)' }, 400);
  }

  // Validate path (no traversal)
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return jsonResponse({ ok: false, error: 'Invalid file path' }, 400);
  }

  let fileBase64: string;

  if (url) {
    // Fetch from public URL
    try {
      const fetchRes = await fetch(url, {
        headers: { 'User-Agent': 'reave-studio/1.0' },
        redirect: 'follow',
      });
      if (!fetchRes.ok) {
        return jsonResponse({ ok: false, error: `Failed to fetch URL: ${fetchRes.status} ${fetchRes.statusText}` }, 400);
      }
      const buffer = await fetchRes.arrayBuffer();
      fileBase64 = Buffer.from(buffer).toString('base64');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ ok: false, error: `Fetch error: ${msg}` }, 400);
    }
  } else {
    // Use provided base64 directly (strip data URI prefix if present)
    fileBase64 = (base64 as string).replace(/^data:[^;]+;base64,/, '');
  }

  // Get existing file SHA if it exists (needed for updates)
  const existingSha = await getFileSha(repo, filePath, branch, token);

  const commitMessage = message || `Add ${filename || filePath.split('/').pop()}`;

  const payload: Record<string, unknown> = {
    message: commitMessage,
    content: fileBase64,
    branch,
  };
  if (existingSha) payload.sha = existingSha;

  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ ok: false, error: `GitHub API error ${res.status}: ${errText}` }, res.status as 400 | 500);
    }

    const data = await res.json() as {
      commit?: { sha?: string; html_url?: string };
      content?: { html_url?: string; download_url?: string };
    };

    return jsonResponse({
      ok: true,
      commit_sha: data.commit?.sha,
      commit_url: data.commit?.html_url,
      file_url: data.content?.download_url,
      html_url: data.content?.html_url,
      updated: !!existingSha,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: `GitHub request failed: ${msg}` }, 500);
  }
}
