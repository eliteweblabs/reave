/**
 * High-level dev/status helpers for the admin agent so it can verify,
 * without a human, whether work was committed, pushed, and deployed.
 *
 * Source of truth:
 *  - committed / pushed  → GitHub REST API (githubClient).
 *  - deployed            → Railway injects RAILWAY_GIT_COMMIT_SHA on the running
 *                          service; we compare it to GitHub's latest commit and
 *                          ping the public health endpoint.
 *
 * Note on "uncommitted / unstaged changes" and "unpushed commits": those live in
 * a developer's local working tree and are NOT observable from GitHub. The
 * deployed assistant reports the remote truth; use run_terminal_command on a
 * machine that has the repo checked out to inspect a dirty working tree.
 */
import { serverEnv } from './serverEnv';
import { siteOriginFallback } from './requestOrigin';
import {
  githubCompare,
  githubGetCommit,
  githubGetDefaultBranch,
  githubListBranches,
  githubListCommits,
  githubRepoSlug,
  type GithubCommit,
} from './githubClient';

type StatusResult<T> = { ok: true; data: T } | { ok: false; error: string };

function deployedSha(): string | undefined {
  return serverEnv('RAILWAY_GIT_COMMIT_SHA')?.trim() || serverEnv('GIT_COMMIT_SHA')?.trim();
}

function healthUrl(): string {
  const explicit = serverEnv('DEPLOY_HEALTH_URL')?.trim();
  if (explicit) return explicit;
  const domain = serverEnv('RAILWAY_PUBLIC_DOMAIN')?.trim();
  return domain ? `https://${domain.replace(/^https?:\/\//, '')}/` : siteOriginFallback().replace(/\/?$/, '/');
}

/** Repo-level status: branch, latest commits, branch count, deployed delta. */
export async function getGitStatus(opts: { repo?: string; branch?: string; limit?: number } = {}): Promise<
  StatusResult<{
    repo: string;
    branch: string;
    latest_commits: GithubCommit[];
    branch_count: number;
    deployed_sha: string | null;
    deployed_is_latest: boolean | null;
    commits_behind_deploy: number | null;
    local_working_tree: string;
  }>
> {
  const branchRes = opts.branch ? ({ ok: true, data: opts.branch } as const) : await githubGetDefaultBranch(opts.repo);
  if (!branchRes.ok) return { ok: false, error: branchRes.error };
  const branch = branchRes.data;

  const commitsRes = await githubListCommits({ repo: opts.repo, branch, perPage: opts.limit ?? 8 });
  if (!commitsRes.ok) return { ok: false, error: commitsRes.error };

  const branchesRes = await githubListBranches({ repo: opts.repo, perPage: 100 });
  const branchCount = branchesRes.ok ? branchesRes.data.length : 0;

  const latestSha = commitsRes.data[0]?.sha ?? null;
  const deployed = deployedSha() ?? null;
  let deployedIsLatest: boolean | null = null;
  let behind: number | null = null;
  if (deployed && latestSha) {
    deployedIsLatest = deployed === latestSha;
    if (!deployedIsLatest) {
      const cmp = await githubCompare(deployed, latestSha, opts.repo);
      behind = cmp.ok ? cmp.data.ahead_by : null;
    } else {
      behind = 0;
    }
  }

  return {
    ok: true,
    data: {
      repo: opts.repo ?? githubRepoSlug(),
      branch,
      latest_commits: commitsRes.data,
      branch_count: branchCount,
      deployed_sha: deployed,
      deployed_is_latest: deployedIsLatest,
      commits_behind_deploy: behind,
      local_working_tree:
        'Not visible from GitHub (uncommitted/unstaged/unpushed live on a dev machine). Use run_terminal_command where the repo is checked out.',
    },
  };
}

export async function getRecentCommits(opts: {
  repo?: string;
  branch?: string;
  limit?: number;
  with_files?: boolean;
}): Promise<StatusResult<{ repo: string; branch: string | null; commits: unknown[] }>> {
  const commitsRes = await githubListCommits({ repo: opts.repo, branch: opts.branch, perPage: opts.limit ?? 5 });
  if (!commitsRes.ok) return { ok: false, error: commitsRes.error };

  let commits: unknown[] = commitsRes.data;
  if (opts.with_files) {
    const detailed = [] as unknown[];
    for (const c of commitsRes.data) {
      const d = await githubGetCommit(c.sha, opts.repo);
      if (d.ok) {
        detailed.push({
          ...c,
          stats: d.data.stats,
          files: d.data.files.map((f) => `${f.status[0].toUpperCase()} ${f.filename}`),
        });
      } else {
        detailed.push(c);
      }
    }
    commits = detailed;
  }

  return {
    ok: true,
    data: {
      repo: opts.repo ?? githubRepoSlug(),
      branch: opts.branch ?? null,
      commits,
    },
  };
}

/** Branches with how far ahead/behind the default branch they are. */
export async function listOpenBranches(opts: { repo?: string } = {}): Promise<
  StatusResult<{ repo: string; default_branch: string; branches: unknown[] }>
> {
  const defRes = await githubGetDefaultBranch(opts.repo);
  if (!defRes.ok) return { ok: false, error: defRes.error };
  const def = defRes.data;

  const branchesRes = await githubListBranches({ repo: opts.repo, perPage: 100 });
  if (!branchesRes.ok) return { ok: false, error: branchesRes.error };

  const out: unknown[] = [];
  for (const b of branchesRes.data) {
    if (b.name === def) {
      out.push({ name: b.name, default: true, short_sha: b.short_sha, protected: b.protected });
      continue;
    }
    const cmp = await githubCompare(def, b.name, opts.repo);
    out.push({
      name: b.name,
      default: false,
      short_sha: b.short_sha,
      protected: b.protected,
      ahead_of_default: cmp.ok ? cmp.data.ahead_by : null,
      behind_default: cmp.ok ? cmp.data.behind_by : null,
    });
  }

  return { ok: true, data: { repo: opts.repo ?? githubRepoSlug(), default_branch: def, branches: out } };
}

/** Is the latest pushed code actually live? Compares deployed SHA to GitHub + health ping. */
export async function checkDeploymentStatus(opts: {
  repo?: string;
  /** Override health ping URL (sibling services). When omitted, uses this Astro service. */
  healthUrl?: string;
} = {}): Promise<
  StatusResult<{
    repo: string;
    default_branch: string;
    latest_commit: GithubCommit | null;
    deployed_sha: string | null;
    deployed_short_sha: string | null;
    up_to_date: boolean | null;
    commits_behind: number | null;
    health: { url: string; reachable: boolean; status: number | null };
    summary: string;
    /** True when checking a sibling repo — deployed SHA comparison may not apply. */
    sibling_repo: boolean;
  }>
> {
  const repo = opts.repo ?? githubRepoSlug();
  const siblingRepo = repo.toLowerCase() !== githubRepoSlug().toLowerCase();

  const defRes = await githubGetDefaultBranch(repo);
  if (!defRes.ok) return { ok: false, error: defRes.error };
  const def = defRes.data;

  const commitsRes = await githubListCommits({ repo, branch: def, perPage: 1 });
  if (!commitsRes.ok) return { ok: false, error: commitsRes.error };
  const latest = commitsRes.data[0] ?? null;

  const deployed = siblingRepo ? null : deployedSha() ?? null;
  let upToDate: boolean | null = null;
  let behind: number | null = null;
  if (deployed && latest) {
    upToDate = deployed === latest.sha;
    if (!upToDate) {
      const cmp = await githubCompare(deployed, latest.sha, repo);
      behind = cmp.ok ? cmp.data.ahead_by : null;
    } else {
      behind = 0;
    }
  }

  const url = opts.healthUrl?.trim() || healthUrl();
  let reachable = false;
  let httpStatus: number | null = null;
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    httpStatus = res.status;
    reachable = res.ok;
  } catch {
    reachable = false;
  }

  let summary: string;
  if (siblingRepo) {
    summary = `Sibling repo ${repo}: latest on ${def} is ${latest?.short_sha ?? 'unknown'}. Health ${url} is ${reachable ? 'reachable' : 'unreachable'} (${httpStatus ?? 'n/a'}). Deployed SHA not available from this Astro service — compare GitHub commits and health only.`;
  } else if (!deployed) {
    summary = `Deployed commit unknown (RAILWAY_GIT_COMMIT_SHA not set). Website is ${reachable ? 'reachable' : 'unreachable'} (${httpStatus ?? 'n/a'}).`;
  } else if (upToDate) {
    summary = `Live at latest commit ${latest?.short_sha} on ${def}. Website ${reachable ? 'reachable' : 'unreachable'} (${httpStatus ?? 'n/a'}).`;
  } else {
    summary = `Deployed ${deployed.slice(0, 7)} is behind ${def} by ${behind ?? '?'} commit(s); latest is ${latest?.short_sha}. Website ${reachable ? 'reachable' : 'unreachable'} (${httpStatus ?? 'n/a'}).`;
  }

  return {
    ok: true,
    data: {
      repo,
      default_branch: def,
      latest_commit: latest,
      deployed_sha: deployed,
      deployed_short_sha: deployed ? deployed.slice(0, 7) : null,
      up_to_date: siblingRepo ? (reachable ? true : false) : upToDate,
      commits_behind: behind,
      health: { url, reachable, status: httpStatus },
      summary,
      sibling_repo: siblingRepo,
    },
  };
}
