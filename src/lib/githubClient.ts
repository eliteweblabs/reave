/**
 * Minimal GitHub REST API client (read-only) for the Telegram dev/status tools.
 *
 * The deployed assistant runs on Railway from a built `dist/` with no local git
 * repo, so "is this committed / pushed?" must be answered against GitHub — the
 * source of truth (eliteweblabs/reave). Auth is a personal access token
 * (`GITHUB_TOKEN`); a fine-grained read-only "Contents" + "Metadata" token is
 * enough. Public repos work token-less but are heavily rate limited.
 */
import { serverEnv } from './serverEnv';

const GITHUB_API = 'https://api.github.com';

export type GithubResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/** owner/repo, in priority: GITHUB_REPO → Railway-injected git vars → default. */
export function githubRepoSlug(): string {
  const explicit = serverEnv('GITHUB_REPO')?.trim();
  if (explicit) return explicit.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const owner = serverEnv('RAILWAY_GIT_REPO_OWNER')?.trim();
  const name = serverEnv('RAILWAY_GIT_REPO_NAME')?.trim();
  if (owner && name) return `${owner}/${name}`;
  return 'eliteweblabs/reave';
}

function token(): string | null {
  return serverEnv('GITHUB_TOKEN')?.trim() || serverEnv('GH_TOKEN')?.trim() || null;
}

/** A token isn't strictly required for public repos, but is strongly recommended. */
export function isGithubConfigured(): boolean {
  return Boolean(token());
}

async function ghFetch<T>(path: string, query?: Record<string, string | number | undefined>): Promise<GithubResult<T>> {
  let url = `${GITHUB_API}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (path.includes('?') ? '&' : '?') + qs;
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub rejects requests without a User-Agent.
    'User-Agent': 'reave-telegram-assistant',
  };
  const tok = token();
  if (tok) headers.Authorization = `Bearer ${tok}`;

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text().catch(() => '');
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const msg =
      (parsed as { message?: string })?.message ||
      (res.status === 401 ? 'Bad credentials (check GITHUB_TOKEN)' : `HTTP ${res.status}`);
    const rate = res.headers.get('x-ratelimit-remaining');
    const hint = res.status === 403 && rate === '0' ? ' (rate limited — set GITHUB_TOKEN)' : '';
    return { ok: false, error: `${msg}${hint}`, status: res.status };
  }

  return { ok: true, data: (parsed as T) ?? ([] as unknown as T) };
}

export type GithubCommit = {
  sha: string;
  short_sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
};

type RawCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } };
  author?: { login?: string } | null;
};

function normalizeCommit(c: RawCommit): GithubCommit {
  const fullMsg = c.commit?.message ?? '';
  return {
    sha: c.sha,
    short_sha: c.sha.slice(0, 7),
    message: fullMsg.split('\n')[0].slice(0, 200),
    author: c.author?.login || c.commit?.author?.name || 'unknown',
    date: c.commit?.author?.date ?? '',
    url: c.html_url,
  };
}

export async function githubGetDefaultBranch(): Promise<GithubResult<string>> {
  const res = await ghFetch<{ default_branch?: string }>(`/repos/${githubRepoSlug()}`);
  if (!res.ok) return res;
  return { ok: true, data: res.data.default_branch || 'main' };
}

export async function githubListCommits(opts: {
  branch?: string;
  perPage?: number;
}): Promise<GithubResult<GithubCommit[]>> {
  const perPage = Math.min(Math.max(opts.perPage ?? 5, 1), 30);
  const res = await ghFetch<RawCommit[]>(`/repos/${githubRepoSlug()}/commits`, {
    sha: opts.branch,
    per_page: perPage,
  });
  if (!res.ok) return res;
  return { ok: true, data: (res.data ?? []).map(normalizeCommit) };
}

export type GithubCommitDetail = GithubCommit & {
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  stats?: { additions: number; deletions: number; total: number };
};

export async function githubGetCommit(sha: string): Promise<GithubResult<GithubCommitDetail>> {
  const res = await ghFetch<
    RawCommit & {
      stats?: { additions: number; deletions: number; total: number };
      files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
    }
  >(`/repos/${githubRepoSlug()}/commits/${encodeURIComponent(sha)}`);
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      ...normalizeCommit(res.data),
      stats: res.data.stats,
      files: (res.data.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
    },
  };
}

export type GithubBranch = {
  name: string;
  sha: string;
  short_sha: string;
  protected: boolean;
};

export async function githubListBranches(opts: { perPage?: number } = {}): Promise<GithubResult<GithubBranch[]>> {
  const perPage = Math.min(Math.max(opts.perPage ?? 30, 1), 100);
  const res = await ghFetch<Array<{ name: string; protected?: boolean; commit: { sha: string } }>>(
    `/repos/${githubRepoSlug()}/branches`,
    { per_page: perPage }
  );
  if (!res.ok) return res;
  return {
    ok: true,
    data: (res.data ?? []).map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      short_sha: b.commit.sha.slice(0, 7),
      protected: Boolean(b.protected),
    })),
  };
}

export type GithubComparison = {
  status: string; // 'ahead' | 'behind' | 'identical' | 'diverged'
  ahead_by: number;
  behind_by: number;
};

/** Compare base...head (how far head is ahead/behind base). */
export async function githubCompare(base: string, head: string): Promise<GithubResult<GithubComparison>> {
  const res = await ghFetch<{ status?: string; ahead_by?: number; behind_by?: number }>(
    `/repos/${githubRepoSlug()}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
  );
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      status: res.data.status ?? 'unknown',
      ahead_by: res.data.ahead_by ?? 0,
      behind_by: res.data.behind_by ?? 0,
    },
  };
}
