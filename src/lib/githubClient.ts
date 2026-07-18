/**
 * GitHub REST API client for the admin agent dev/status and file-write tools.
 *
 * The deployed assistant runs on Railway from a built `dist/` with no local git
 * repo, so "is this committed / pushed?" must be answered against GitHub — the
 * source of truth (eliteweblabs/reave). Auth is a personal access token
 * (`GITHUB_TOKEN`). Read-only status tools need Contents + Metadata; write tools
 * also need Contents: write and Pull requests: write. Public repos work
 * token-less for reads but are heavily rate limited.
 */
import { serverEnv } from './serverEnv';

const GITHUB_API = 'https://api.github.com';

export type GithubResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

const REPO_SLUG_RE = /^[\w.-]+\/[\w.-]+$/;

/** Normalize owner/repo from env, URL, or bare slug. */
export function normalizeRepoSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  return REPO_SLUG_RE.test(slug) ? slug : null;
}

/** owner/repo, in priority: GITHUB_REPO → Railway-injected git vars. */
export function githubRepoSlug(): string {
  const explicit = serverEnv('GITHUB_REPO')?.trim();
  if (explicit) return normalizeRepoSlug(explicit) ?? explicit;
  const owner = serverEnv('RAILWAY_GIT_REPO_OWNER')?.trim();
  const name = serverEnv('RAILWAY_GIT_REPO_NAME')?.trim();
  if (owner && name) return `${owner}/${name}`;
  return '';
}

/** Default branch for new branches and PRs when not specified. */
export function githubDefaultBranch(): string {
  return serverEnv('GITHUB_DEFAULT_BRANCH')?.trim() || 'main';
}

function resolveRepo(repo?: string): GithubResult<string> {
  const slug = repo?.trim() ? normalizeRepoSlug(repo) : githubRepoSlug();
  if (!slug) return { ok: false, error: 'invalid repo (expected owner/name)' };
  return { ok: true, data: slug };
}

function encodeRepoPath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function isSafeRepoPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return false;
  return true;
}

function token(): string | null {
  return serverEnv('GITHUB_TOKEN')?.trim() || serverEnv('GH_TOKEN')?.trim() || null;
}

/** A token isn't strictly required for public repos, but is strongly recommended. */
export function isGithubConfigured(): boolean {
  return Boolean(token());
}

async function ghFetch<T>(
  path: string,
  opts?: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  }
): Promise<GithubResult<T>> {
  let url = `${GITHUB_API}${path}`;
  const query = opts?.query;
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
    'User-Agent': 'reave-admin-agent',
  };
  const tok = token();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts?.method ?? 'GET',
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
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
    const requiredPerms = res.headers.get('x-accepted-github-permissions');
    const permHint =
      res.status === 403 && requiredPerms
        ? ` Required: ${requiredPerms}. For fine-grained PATs, set Repository access to this repo and grant Contents (read+write) + Pull requests (read+write).`
        : res.status === 403 && /resource not accessible/i.test(msg)
          ? ' Fine-grained PAT likely missing repo access or Contents/Pull requests write on eliteweblabs/reave.'
          : '';
    return { ok: false, error: `${msg}${hint}${permHint}`, status: res.status };
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
    query: { sha: opts.branch, per_page: perPage },
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
    { query: { per_page: perPage } }
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

export type GithubFileWriteResult = {
  repo: string;
  branch: string;
  path: string;
  sha: string;
  commit_sha: string;
  commit_url: string;
  created: boolean;
};

/** Create or update a file via the GitHub Contents API. */
export async function githubWriteFile(opts: {
  repo?: string;
  branch: string;
  path: string;
  content: string;
  message: string;
}): Promise<GithubResult<GithubFileWriteResult>> {
  if (!token()) {
    return { ok: false, error: 'GITHUB_TOKEN is required for write_github_file' };
  }

  const repoRes = resolveRepo(opts.repo);
  if (!repoRes.ok) return repoRes;

  const branch = opts.branch.trim();
  const path = opts.path.trim();
  const message = opts.message.trim();
  if (!branch) return { ok: false, error: 'branch is required' };
  if (!path || !isSafeRepoPath(path)) return { ok: false, error: 'invalid path' };
  if (!message) return { ok: false, error: 'commit message is required' };

  const repo = repoRes.data;
  const encodedPath = encodeRepoPath(path);

  const existing = await ghFetch<{ sha?: string }>(`/repos/${repo}/contents/${encodedPath}`, {
    query: { ref: branch },
  });
  const existingSha = existing.ok ? existing.data.sha : undefined;
  if (!existing.ok && existing.status !== 404) return existing;

  const body: Record<string, string> = {
    message,
    content: Buffer.from(opts.content, 'utf8').toString('base64'),
    branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await ghFetch<{
    commit?: { sha?: string; html_url?: string };
    content?: { sha?: string; path?: string };
  }>(`/repos/${repo}/contents/${encodedPath}`, { method: 'PUT', body });

  if (!res.ok) return res;

  const commitSha = res.data.commit?.sha;
  if (!commitSha) return { ok: false, error: 'GitHub did not return a commit SHA' };

  return {
    ok: true,
    data: {
      repo,
      branch,
      path: res.data.content?.path ?? path.replace(/^\/+/, ''),
      sha: res.data.content?.sha ?? commitSha,
      commit_sha: commitSha,
      commit_url: res.data.commit?.html_url ?? `https://github.com/${repo}/commit/${commitSha}`,
      created: !existingSha,
    },
  };
}

export type GithubPullRequestResult = {
  repo: string;
  number: number;
  title: string;
  state: string;
  head: string;
  base: string;
  url: string;
};

/** Open a pull request on GitHub. */
export async function githubCreatePullRequest(opts: {
  repo?: string;
  head: string;
  base?: string;
  title: string;
  body?: string;
}): Promise<GithubResult<GithubPullRequestResult>> {
  if (!token()) {
    return { ok: false, error: 'GITHUB_TOKEN is required for create_pull_request' };
  }

  const repoRes = resolveRepo(opts.repo);
  if (!repoRes.ok) return repoRes;

  const head = opts.head.trim();
  const base = (opts.base?.trim() || githubDefaultBranch());
  const title = opts.title.trim();
  if (!head) return { ok: false, error: 'head branch is required' };
  if (!title) return { ok: false, error: 'title is required' };

  const repo = repoRes.data;
  const res = await ghFetch<{ number?: number; title?: string; state?: string; html_url?: string; head?: { ref?: string }; base?: { ref?: string } }>(
    `/repos/${repo}/pulls`,
    {
      method: 'POST',
      body: {
        title,
        head,
        base,
        body: opts.body?.trim() || '',
      },
    }
  );

  if (!res.ok) return res;
  if (typeof res.data.number !== 'number') {
    return { ok: false, error: 'GitHub did not return a pull request number' };
  }

  return {
    ok: true,
    data: {
      repo,
      number: res.data.number,
      title: res.data.title ?? title,
      state: res.data.state ?? 'open',
      head: res.data.head?.ref ?? head,
      base: res.data.base?.ref ?? base,
      url: res.data.html_url ?? `https://github.com/${repo}/pull/${res.data.number}`,
    },
  };
}

const BRANCH_NAME_RE = /^[A-Za-z0-9._/-]+$/;

function isSafeBranchName(name: string): boolean {
  const branch = name.trim();
  if (!branch || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) return false;
  return BRANCH_NAME_RE.test(branch);
}

export type GithubRepoAccess = {
  repo: string;
  authenticated: boolean;
  token_user: string | null;
  token_type: 'fine-grained' | 'classic' | 'unknown' | null;
  permissions: { pull: boolean; push: boolean; admin: boolean } | null;
  can_write_files: boolean;
  can_open_prs: boolean;
  note: string | null;
};

function tokenType(tok: string): GithubRepoAccess['token_type'] {
  if (tok.startsWith('github_pat_')) return 'fine-grained';
  if (tok.startsWith('ghp_') || tok.startsWith('gho_') || tok.startsWith('ghu_')) return 'classic';
  return 'unknown';
}

/** Inspect token access to the configured repo (for service_status / troubleshooting). */
export async function githubGetRepoAccess(repo?: string): Promise<GithubResult<GithubRepoAccess>> {
  const repoRes = resolveRepo(repo);
  if (!repoRes.ok) return repoRes;
  const slug = repoRes.data;
  const tok = token();

  if (!tok) {
    return {
      ok: true,
      data: {
        repo: slug,
        authenticated: false,
        token_user: null,
        token_type: null,
        permissions: null,
        can_write_files: false,
        can_open_prs: false,
        note: 'No GITHUB_TOKEN — public read only, writes disabled.',
      },
    };
  }

  const userRes = await ghFetch<{ login?: string }>('/user');
  if (!userRes.ok) {
    return {
      ok: true,
      data: {
        repo: slug,
        authenticated: false,
        token_user: null,
        token_type: tokenType(tok),
        permissions: null,
        can_write_files: false,
        can_open_prs: false,
        note: userRes.error,
      },
    };
  }

  const tokenUser = userRes.data.login ?? null;
  const [repoOwner] = slug.split('/');

  const repoRes2 = await ghFetch<{ permissions?: { pull?: boolean; push?: boolean; admin?: boolean } }>(
    `/repos/${slug}`
  );
  if (!repoRes2.ok) {
    return {
      ok: true,
      data: {
        repo: slug,
        authenticated: true,
        token_user: tokenUser,
        token_type: tokenType(tok),
        permissions: null,
        can_write_files: false,
        can_open_prs: false,
        note: repoRes2.error,
      },
    };
  }

  const perms = repoRes2.data.permissions;
  const push = Boolean(perms?.push || perms?.admin);
  const pull = Boolean(perms?.pull || push);

  let note: string;
  if (push) {
    note = 'Token can push — write_github_file and create_pull_request should work.';
  } else if (tokenType(tok) === 'fine-grained') {
    note =
      'Fine-grained PAT is read-only on this repo. In GitHub → Developer settings → Fine-grained tokens: Resource owner = eliteweblabs, Repository access includes eliteweblabs/reave, Contents = Read and write, Pull requests = Read and write. Then update GITHUB_TOKEN on Railway.';
  } else {
    note = 'Token is read-only on this repo — use a classic PAT with repo scope, or upgrade fine-grained permissions.';
  }

  if (tokenUser && repoOwner && tokenUser.toLowerCase() !== repoOwner.toLowerCase()) {
    note += ` Token user "${tokenUser}" is not repo owner "${repoOwner}".`;
  }

  return {
    ok: true,
    data: {
      repo: slug,
      authenticated: true,
      token_user: tokenUser,
      token_type: tokenType(tok),
      permissions: perms
        ? { pull, push, admin: Boolean(perms.admin) }
        : null,
      can_write_files: push,
      can_open_prs: push,
      note,
    },
  };
}

export type GithubBranchCreateResult = {
  repo: string;
  branch: string;
  from_branch: string;
  sha: string;
  url: string;
};

/** Create a new branch pointing at the tip of from_branch (default: main). */
export async function githubCreateBranch(opts: {
  repo?: string;
  branch: string;
  from_branch?: string;
}): Promise<GithubResult<GithubBranchCreateResult>> {
  if (!token()) {
    return { ok: false, error: 'GITHUB_TOKEN is required for create_github_branch' };
  }

  const repoRes = resolveRepo(opts.repo);
  if (!repoRes.ok) return repoRes;

  const branch = opts.branch.trim();
  const fromBranch = (opts.from_branch?.trim() || githubDefaultBranch());
  if (!branch || !isSafeBranchName(branch)) return { ok: false, error: 'invalid branch name' };
  if (!isSafeBranchName(fromBranch)) return { ok: false, error: 'invalid from_branch name' };

  const repo = repoRes.data;
  const baseRef = await ghFetch<{ object?: { sha?: string } }>(
    `/repos/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`
  );
  if (!baseRef.ok) return baseRef;
  const sha = baseRef.data.object?.sha;
  if (!sha) return { ok: false, error: `could not resolve tip of ${fromBranch}` };

  const created = await ghFetch<{ object?: { sha?: string } }>(`/repos/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha },
  });
  if (!created.ok) {
    if (created.status === 422) {
      return { ok: false, error: `branch "${branch}" may already exist` };
    }
    return created;
  }

  return {
    ok: true,
    data: {
      repo,
      branch,
      from_branch: fromBranch,
      sha: created.data.object?.sha ?? sha,
      url: `https://github.com/${repo}/tree/${encodeURIComponent(branch)}`,
    },
  };
}
