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
    const rateRemaining = res.headers.get('x-ratelimit-remaining');
    const rateReset = res.headers.get('x-ratelimit-reset');
    const retryAfter = res.headers.get('retry-after');
    const rateLimited =
      (res.status === 403 || res.status === 429) &&
      (rateRemaining === '0' || /rate limit/i.test(msg));
    let hint = '';
    if (rateLimited) {
      const resetSec = Number(rateReset);
      const retrySec = Number(retryAfter);
      const waitMin =
        Number.isFinite(retrySec) && retrySec > 0
          ? Math.max(1, Math.ceil(retrySec / 60))
          : Number.isFinite(resetSec) && resetSec > 0
            ? Math.max(1, Math.ceil((resetSec * 1000 - Date.now()) / 60_000))
            : null;
      hint = waitMin
        ? ` GitHub API rate limited — retry in ~${waitMin}m`
        : ' GitHub API rate limited — try again later';
    } else if (res.status === 403 && rateRemaining === '0') {
      hint = ' (rate limited)';
    }
    const requiredPerms = res.headers.get('x-accepted-github-permissions');
    const permHint =
      res.status === 403 && !rateLimited && requiredPerms
        ? ` Required: ${requiredPerms}. For fine-grained PATs, set Repository access to this repo and grant Contents (read+write) + Pull requests (read+write).`
        : res.status === 403 && !rateLimited && /resource not accessible/i.test(msg)
          ? ' Fine-grained PAT likely missing repo access or Contents write on the target repo.'
          : '';
    return {
      ok: false,
      error: rateLimited ? hint.trim() : `${msg}${hint}${permHint}`,
      status: res.status,
    };
  }

  return { ok: true, data: (parsed as T) ?? ([] as unknown as T) };
}

export type GithubCommit = {
  sha: string;
  short_sha: string;
  message: string;
  author: string;
  /** Git author date (ISO). */
  date: string;
  /** Git committer date (ISO) — when the commit actually landed on the branch. */
  pushed_at: string;
  url: string;
};

type RawCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string };
    committer?: { name?: string; date?: string };
  };
  author?: { login?: string } | null;
};

function normalizeCommit(c: RawCommit): GithubCommit {
  const fullMsg = c.commit?.message ?? '';
  const authorDate = c.commit?.author?.date ?? '';
  const committerDate = c.commit?.committer?.date ?? authorDate;
  return {
    sha: c.sha,
    short_sha: c.sha.slice(0, 7),
    message: fullMsg.split('\n')[0].slice(0, 200),
    author: c.author?.login || c.commit?.author?.name || 'unknown',
    date: authorDate,
    pushed_at: committerDate,
    url: c.html_url,
  };
}

export async function githubGetDefaultBranch(repo?: string): Promise<GithubResult<string>> {
  const repoRes = resolveRepo(repo);
  if (!repoRes.ok) return repoRes;
  const res = await ghFetch<{ default_branch?: string }>(`/repos/${repoRes.data}`);
  if (!res.ok) return res;
  return { ok: true, data: res.data.default_branch || 'main' };
}

export async function githubListCommits(opts: {
  repo?: string;
  branch?: string;
  perPage?: number;
}): Promise<GithubResult<GithubCommit[]>> {
  const repoRes = resolveRepo(opts.repo);
  if (!repoRes.ok) return repoRes;
  const perPage = Math.min(Math.max(opts.perPage ?? 5, 1), 30);
  const res = await ghFetch<RawCommit[]>(`/repos/${repoRes.data}/commits`, {
    query: { sha: opts.branch, per_page: perPage },
  });
  if (!res.ok) return res;
  return { ok: true, data: (res.data ?? []).map(normalizeCommit) };
}

export type GithubCommitDetail = GithubCommit & {
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  stats?: { additions: number; deletions: number; total: number };
};

export async function githubGetCommit(sha: string, repo?: string): Promise<GithubResult<GithubCommitDetail>> {
  const repoRes = resolveRepo(repo);
  if (!repoRes.ok) return repoRes;
  const res = await ghFetch<
    RawCommit & {
      stats?: { additions: number; deletions: number; total: number };
      files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
    }
  >(`/repos/${repoRes.data}/commits/${encodeURIComponent(sha)}`);
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

export async function githubListBranches(opts: { repo?: string; perPage?: number } = {}): Promise<GithubResult<GithubBranch[]>> {
  const repoRes = resolveRepo(opts.repo);
  if (!repoRes.ok) return repoRes;
  const perPage = Math.min(Math.max(opts.perPage ?? 30, 1), 100);
  const res = await ghFetch<Array<{ name: string; protected?: boolean; commit: { sha: string } }>>(
    `/repos/${repoRes.data}/branches`,
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
export async function githubCompare(base: string, head: string, repo?: string): Promise<GithubResult<GithubComparison>> {
  const repoRes = resolveRepo(repo);
  if (!repoRes.ok) return repoRes;
  const res = await ghFetch<{ status?: string; ahead_by?: number; behind_by?: number }>(
    `/repos/${repoRes.data}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
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

/**
 * Create or update a file via the GitHub Contents API.
 *
 * With `append`, the existing file is fetched and the new content is added to the
 * end. That is what makes a long file writable at all from a deployed container:
 * the body travels inside one tool call's arguments, which are output tokens, so
 * anything past the model's output budget has to arrive in sections.
 */
export async function githubWriteFile(opts: {
  repo?: string;
  branch: string;
  path: string;
  content: string;
  message: string;
  append?: boolean;
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

  const existing = await ghFetch<{ sha?: string; content?: string; encoding?: string }>(
    `/repos/${repo}/contents/${encodedPath}`,
    { query: { ref: branch } },
  );
  const existingSha = existing.ok ? existing.data.sha : undefined;
  if (!existing.ok && existing.status !== 404) return existing;

  let content = opts.content;
  if (opts.append && existing.ok && existing.data.content) {
    const prior = Buffer.from(existing.data.content, 'base64').toString('utf8');
    const joiner = prior.endsWith('\n') || !prior ? '' : '\n';
    content = `${prior}${joiner}${content}`;
  }

  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
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

export type GithubFileReadResult = {
  repo: string;
  path: string;
  sha: string;
  content: string;
};

/** Read a UTF-8 file from GitHub (Contents API). */
export async function githubReadFile(opts: {
  repo?: string;
  path: string;
  ref?: string;
}): Promise<GithubResult<GithubFileReadResult>> {
  const repoRes = resolveRepo(opts.repo);
  if (!repoRes.ok) return repoRes;

  const path = opts.path.trim();
  if (!path || !isSafeRepoPath(path)) return { ok: false, error: 'invalid path' };

  const repo = repoRes.data;
  const res = await ghFetch<{ sha?: string; content?: string; encoding?: string }>(
    `/repos/${repo}/contents/${encodeRepoPath(path)}`,
    { query: { ref: opts.ref?.trim() || undefined } },
  );
  if (!res.ok) return res;
  if (!res.data.content) return { ok: false, error: 'not a file (or empty content)' };

  const encoding = res.data.encoding === 'base64' ? 'base64' : 'utf8';
  const content =
    encoding === 'base64' ? Buffer.from(res.data.content, 'base64').toString('utf8') : res.data.content;

  return {
    ok: true,
    data: {
      repo,
      path: path.replace(/^\/+/, ''),
      sha: res.data.sha ?? '',
      content,
    },
  };
}

export type GithubRevertResult = {
  repo: string;
  branch: string;
  reverted_sha: string;
  reverted_message: string;
  commit_sha: string;
  commit_url: string;
  files: string[];
};

/**
 * Revert the tip commit on a branch by committing the parent tree on top of HEAD.
 * Same effect as `git revert` of the latest commit (no history rewrite).
 */
export async function githubRevertLastCommit(opts: {
  repo?: string;
  branch?: string;
}): Promise<GithubResult<GithubRevertResult>> {
  if (!token()) {
    return { ok: false, error: 'GITHUB_TOKEN is required to undo a website change' };
  }

  const repoRes = resolveRepo(opts.repo);
  if (!repoRes.ok) return repoRes;

  const repo = repoRes.data;
  const branch = opts.branch?.trim() || githubDefaultBranch();
  if (!branch || !isSafeBranchName(branch)) return { ok: false, error: 'invalid branch name' };

  const history = await ghFetch<RawCommit[]>(`/repos/${repo}/commits`, {
    query: { sha: branch, per_page: 2 },
  });
  if (!history.ok) return history;
  const head = history.data[0];
  const parent = history.data[1];
  if (!head?.sha) return { ok: false, error: 'no commits on this branch' };
  if (!parent?.sha) return { ok: false, error: 'nothing to undo — this is the first commit' };

  const detail = await githubGetCommit(head.sha, repo);
  const files = detail.ok ? detail.data.files.map((f) => f.filename) : [];

  const parentGit = await ghFetch<{ tree?: { sha?: string } }>(
    `/repos/${repo}/git/commits/${encodeURIComponent(parent.sha)}`,
  );
  if (!parentGit.ok) return parentGit;
  const tree = parentGit.data.tree?.sha;
  if (!tree) return { ok: false, error: 'could not read the previous commit tree' };

  const subject = (head.commit?.message ?? 'last change').split('\n')[0].slice(0, 72);
  const created = await ghFetch<{ sha?: string; html_url?: string }>(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: {
      message: `Revert "${subject}"`,
      tree,
      parents: [head.sha],
    },
  });
  if (!created.ok) return created;
  const newSha = created.data.sha;
  if (!newSha) return { ok: false, error: 'GitHub did not return a revert commit SHA' };

  const moved = await ghFetch<{ object?: { sha?: string } }>(
    `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: 'PATCH', body: { sha: newSha } },
  );
  if (!moved.ok) return moved;

  return {
    ok: true,
    data: {
      repo,
      branch,
      reverted_sha: head.sha,
      reverted_message: subject,
      commit_sha: newSha,
      commit_url: `https://github.com/${repo}/commit/${newSha}`,
      files,
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
      `Fine-grained PAT is read-only on this repo. In GitHub → Developer settings → Fine-grained tokens: grant Contents read+write on ${slug} only (client website editor must not include eliteweblabs/reave). Then update GITHUB_TOKEN on Railway.`;
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

export type GithubRepoCreateResult = {
  repo: string;
  url: string;
  clone_url: string;
  private: boolean;
  created: boolean;
};

/**
 * Create a new GitHub repository under a user or org account.
 * Uses POST /user/repos for personal accounts, POST /orgs/{org}/repos for orgs.
 * The token must have the `repo` scope (classic PAT) or repo creation permission
 * (fine-grained PAT with Administration: write on the org).
 */
export async function githubCreateRepo(opts: {
  /** owner/repo — if owner is an org, uses the orgs endpoint */
  repo: string;
  description?: string;
  private?: boolean;
  /** Auto-init with an empty README so the repo has a default branch */
  auto_init?: boolean;
}): Promise<GithubResult<GithubRepoCreateResult>> {
  if (!token()) {
    return { ok: false, error: 'GITHUB_TOKEN is required for create_github_repo' };
  }

  const parts = opts.repo.trim().split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: 'repo must be owner/name, e.g. eliteweblabs/my-site' };
  }
  const [owner, name] = parts;

  // Detect whether owner is an org or the authenticated user.
  const userRes = await ghFetch<{ login?: string }>('/user');
  const isOrg = userRes.ok && userRes.data.login?.toLowerCase() !== owner.toLowerCase();

  const endpoint = isOrg ? `/orgs/${owner}/repos` : '/user/repos';

  const body: Record<string, unknown> = {
    name,
    private: opts.private ?? true,
    auto_init: opts.auto_init ?? false,
  };
  if (opts.description) body.description = opts.description;

  const res = await ghFetch<{
    full_name?: string;
    html_url?: string;
    clone_url?: string;
    private?: boolean;
  }>(endpoint, { method: 'POST', body });

  if (!res.ok) return res;

  const fullName = res.data.full_name ?? opts.repo;
  return {
    ok: true,
    data: {
      repo: fullName,
      url: res.data.html_url ?? `https://github.com/${fullName}`,
      clone_url: res.data.clone_url ?? `https://github.com/${fullName}.git`,
      private: res.data.private ?? true,
      created: true,
    },
  };
}
