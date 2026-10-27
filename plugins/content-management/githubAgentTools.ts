/**
 * Git publish tools for the Agentic Website Editor.
 * Also reused by Dev & Infrastructure when that private module is on
 * and content_management is not (deploy repair still needs write_github_file).
 *
 * Client installs are locked to this install's website repo. Ops / official
 * reave.app can still pass a sibling repo for deploy repair.
 */
import { getGitStatus, getRecentCommits, listOpenBranches, checkDeploymentStatus } from '../../src/lib/devStatus';
import {
  githubCreateBranch,
  githubCreatePullRequest,
  githubCreateRepo,
  githubDefaultBranch,
  githubReadFile,
  githubRepoSlug,
  githubRevertLastCommit,
  githubWriteFile,
} from '../../src/lib/githubClient';
import { maybeDeferGithubWrite } from '../../src/lib/deferredDeploy';
import { getAgentContext } from '../../src/lib/agentContext';
import { isOpsInstall } from '../../src/lib/installConfig';
import { githubWebsiteRepoSlug, resolveWebsiteEditorRepo } from '../../src/lib/websiteEditorRepo';
import type { AgentToolDef, ToolContext, ToolHandler } from '../../src/lib/agentTools/types';

function requestedRepo(args: Record<string, unknown>): string | undefined {
  return typeof args.repo === 'string' && args.repo.trim() ? args.repo.trim() : undefined;
}

function editorRepoOrError(args: Record<string, unknown>): { ok: true; repo: string } | { ok: false; error: string } {
  const resolved = resolveWebsiteEditorRepo(requestedRepo(args));
  if (!resolved.ok) return { ok: false, error: resolved.error };
  return { ok: true, repo: resolved.data };
}

async function handle_get_git_status(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const result = await getGitStatus({
    repo: repo.repo,
    branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_get_recent_commits(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const result = await getRecentCommits({
    repo: repo.repo,
    branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
    with_files: args.with_files === true,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_check_deployment_status(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const result = await checkDeploymentStatus({
    repo: repo.repo,
    healthUrl: typeof args.health_url === 'string' && args.health_url.trim() ? args.health_url.trim() : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_list_open_branches(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await listOpenBranches();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_create_github_repo(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isOpsInstall()) {
    return JSON.stringify({
      error:
        'Client installs cannot create GitHub repos. Only the agency owner provisions the front-end website repo.',
    });
  }
  const result = await githubCreateRepo({
    repo: String(args.repo ?? '').trim(),
    description: typeof args.description === 'string' ? args.description : undefined,
    private: typeof args.private === 'boolean' ? args.private : undefined,
    auto_init: typeof args.auto_init === 'boolean' ? args.auto_init : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_create_github_branch(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const result = await githubCreateBranch({
    repo: repo.repo,
    branch: String(args.branch ?? '').trim(),
    from_branch: typeof args.from_branch === 'string' ? args.from_branch : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_read_github_file(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const result = await githubReadFile({
    repo: repo.repo,
    path: String(args.path ?? '').trim(),
    ref: typeof args.ref === 'string' && args.ref.trim() ? args.ref.trim() : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_write_github_file(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const writeArgs = {
    repo: repo.repo,
    branch: String(args.branch ?? '').trim() || githubDefaultBranch(),
    path: String(args.path ?? '').trim(),
    content: String(args.content ?? ''),
    message: String(args.message ?? '').trim(),
    append: args.append === true,
  };
  const deferred = maybeDeferGithubWrite(writeArgs);
  if (deferred) return JSON.stringify(deferred);
  const result = await githubWriteFile(writeArgs);
  if (!result.ok) return JSON.stringify({ error: result.error });
  const branch = writeArgs.branch.trim() || githubDefaultBranch();
  if (branch.toLowerCase() === githubDefaultBranch().toLowerCase()) {
    const { threadId } = getAgentContext();
    if (threadId) {
      const { ensureDefaultDeployResume } = await import('../../src/lib/deployResume');
      await ensureDefaultDeployResume(threadId);
    }
  }
  return JSON.stringify(result.data);
}

async function handle_undo_website_change(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const result = await githubRevertLastCommit({
    repo: repo.repo,
    branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  const { threadId } = getAgentContext();
  if (threadId) {
    const { ensureDefaultDeployResume } = await import('../../src/lib/deployResume');
    await ensureDefaultDeployResume(threadId);
  }
  return JSON.stringify(result.data);
}

async function handle_create_pull_request(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });
  const result = await githubCreatePullRequest({
    repo: repo.repo,
    head: String(args.head ?? '').trim(),
    base: typeof args.base === 'string' && args.base.trim() ? args.base.trim() : undefined,
    title: String(args.title ?? '').trim(),
    body: typeof args.body === 'string' ? args.body : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

/**
 * push_binary_to_github
 * Commit a binary file (PNG, SVG, PDF, etc.) to a GitHub repo via the
 * Contents API (base64 encoding). Accepts either a public URL to fetch from,
 * or a raw base64 payload. Used when the owner drops a logo/image into chat
 * and wants it committed directly to a client website repo.
 */
async function handle_push_binary_to_github(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const repo = editorRepoOrError(args);
  if (!repo.ok) return JSON.stringify({ error: repo.error });

  const filePath = String(args.path ?? '').trim();
  if (!filePath) return JSON.stringify({ error: 'path is required' });

  const url = typeof args.url === 'string' && args.url.trim() ? args.url.trim() : undefined;
  const base64 = typeof args.base64 === 'string' && args.base64.trim() ? args.base64.trim() : undefined;
  if (!url && !base64) return JSON.stringify({ error: 'Either url or base64 is required' });

  const branch = typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : githubDefaultBranch();
  const message = typeof args.message === 'string' && args.message.trim()
    ? args.message.trim()
    : `Add ${filePath.split('/').pop()}`;

  const token = process.env.GITHUB_TOKEN;
  if (!token) return JSON.stringify({ error: 'GITHUB_TOKEN not configured' });

  const GITHUB_API = 'https://api.github.com';

  // Build base64 content
  let fileBase64: string;
  if (url) {
    try {
      const fetchRes = await fetch(url, {
        headers: { 'User-Agent': 'reave-studio/1.0' },
        redirect: 'follow',
      });
      if (!fetchRes.ok) {
        return JSON.stringify({ error: `Failed to fetch URL: ${fetchRes.status} ${fetchRes.statusText}` });
      }
      const buffer = await fetchRes.arrayBuffer();
      fileBase64 = Buffer.from(buffer).toString('base64');
    } catch (e) {
      return JSON.stringify({ error: `Fetch error: ${e instanceof Error ? e.message : String(e)}` });
    }
  } else {
    // Strip data URI prefix if present
    fileBase64 = (base64 as string).replace(/^data:[^;]+;base64,/, '');
  }

  // Get existing SHA if file already exists (needed for update)
  let existingSha: string | undefined;
  try {
    const shaRes = await fetch(`${GITHUB_API}/repos/${repo.repo}/contents/${filePath}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (shaRes.ok) {
      const shaData = await shaRes.json() as { sha?: string };
      existingSha = shaData.sha;
    }
  } catch { /* file doesn't exist yet — ok */ }

  const payload: Record<string, unknown> = { message, content: fileBase64, branch };
  if (existingSha) payload.sha = existingSha;

  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo.repo}/contents/${filePath}`, {
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
      return JSON.stringify({ error: `GitHub API error ${res.status}: ${errText}` });
    }

    const data = await res.json() as {
      commit?: { sha?: string; html_url?: string };
      content?: { html_url?: string; download_url?: string };
    };

    // Trigger deploy resume like write_github_file does
    if (branch.toLowerCase() === githubDefaultBranch().toLowerCase()) {
      const { threadId } = getAgentContext();
      if (threadId) {
        const { ensureDefaultDeployResume } = await import('../../src/lib/deployResume');
        await ensureDefaultDeployResume(threadId);
      }
    }

    return JSON.stringify({
      ok: true,
      commit_sha: data.commit?.sha,
      commit_url: data.commit?.html_url,
      file_url: data.content?.download_url,
      html_url: data.content?.html_url,
      updated: !!existingSha,
      repo: repo.repo,
      path: filePath,
    });
  } catch (e) {
    return JSON.stringify({ error: `GitHub request failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}

function repoParam(description: string): Record<string, unknown> {
  return { repo: { type: 'string', description } };
}

export function githubPublishDefinitions(_ctx: ToolContext): AgentToolDef[] {
  const ops = isOpsInstall();
  const siteRepo = githubWebsiteRepoSlug() || (ops ? githubRepoSlug() : 'this install's website repo');
  const defaultBranch = githubDefaultBranch();
  const clientRepoNote = `Always this install's website repo (${siteRepo}). Cannot write to the reave.app.`;
  const repoProps = ops
    ? repoParam(`owner/repo (defaults to ${siteRepo} / GITHUB_REPO)`)
    : {};

  const defs: AgentToolDef[] = [
    {
      type: 'function',
      function: {
        name: 'get_git_status',
        description: ops
          ? 'Snapshot of the GitHub repo (source of truth): current/default branch, latest commits, branch count, and whether the live site is on the latest commit. Pass repo for sibling services. Local uncommitted/unstaged changes are NOT visible here.'
          : `Snapshot of ${siteRepo} (this install's front-end website). Latest commits and whether the live site matches. You cannot inspect the reave.app repo.`,
        parameters: {
          type: 'object',
          properties: {
            ...repoProps,
            branch: { type: 'string', description: 'Branch to inspect; defaults to the repo default branch.' },
            limit: { type: 'integer', description: 'How many recent commits to include (1-30, default 8).' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_recent_commits',
        description: ops
          ? 'Recent commit history from GitHub (author, message, timestamp, link; optionally files changed). Pass repo for sibling services. Use with_files:true when diagnosing a failed publish.'
          : `Recent commits on ${siteRepo}. Use with_files:true when undoing or checking what changed.`,
        parameters: {
          type: 'object',
          properties: {
            ...repoProps,
            branch: { type: 'string', description: 'Branch to read; defaults to the repo default branch.' },
            limit: { type: 'integer', description: 'Number of commits (1-30, default 5).' },
            with_files: { type: 'boolean', description: 'Include changed files + stats per commit (slower).' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_deployment_status',
        description:
          'Is the latest pushed code live? Compares the deployed commit to GitHub latest and pings a health URL.',
        parameters: {
          type: 'object',
          properties: {
            ...repoProps,
            health_url: { type: 'string', description: 'Health ping URL; defaults to DEPLOY_HEALTH_URL or the public site.' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_github_file',
        description: `Read a UTF-8 file from ${siteRepo}. Use this before editing. ${ops ? 'Pass repo for sibling services.' : clientRepoNote}`,
        parameters: {
          type: 'object',
          properties: {
            ...repoProps,
            path: { type: 'string', description: 'File path in the repo, e.g. index.html or src/pages/about.astro' },
            ref: { type: 'string', description: 'Branch or commit SHA (defaults to the default branch).' },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_github_file',
        description: ops
          ? 'Create or update a file in a GitHub repo via the Contents API. Commits directly to the given branch (branch must already exist). Requires GITHUB_TOKEN with Contents write. Returns commit SHA and URL. For a long file (a full page, a big component), write it in sections: one call for the first chunk, then more calls with append:true — a single call carrying the whole body will be cut off by the output limit and nothing will be written.'
          : `Create or update a file in ${siteRepo} and commit to main in this same turn. Clients will not say "commit", "save", or "publish" — the turn is the save. ${clientRepoNote} For a long file, write in sections with append:true.`,
        parameters: {
          type: 'object',
          properties: {
            ...repoProps,
            branch: { type: 'string', description: `Target branch (use "${defaultBranch}")` },
            path: { type: 'string', description: 'File path in the website repo' },
            content: {
              type: 'string',
              description:
                'File contents (UTF-8 text). The full file, or the next chunk when append is true.',
            },
            append: {
              type: 'boolean',
              description:
                'Add content to the end of the existing file instead of replacing it. Use for the 2nd and later chunks of a long file (default false).',
            },
            message: { type: 'string', description: 'Git commit message' },
          },
          required: ['branch', 'path', 'content', 'message'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'undo_website_change',
        description:
          'Undo the last commit on the website repo (revert, no history rewrite). Use when the owner says "undo that", "change it back", "go back", "never mind", "put it back", or "I don\'t like that". Commits the revert to main in this turn. Call again to undo the undo.',
        parameters: {
          type: 'object',
          properties: {
            ...repoProps,
            branch: { type: 'string', description: `Branch to revert (defaults to ${defaultBranch})` },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'push_binary_to_github',
        description:
          'Commit a binary file (PNG, SVG, PDF, GIF, WebP, etc.) to a GitHub repo via the Contents API. Use when the owner drops a logo, image, or other binary asset into chat and wants it committed to a client website repo. Pass url to fetch from a public URL server-side, or base64 for a raw base64 payload (e.g. from a chat attachment). Returns commit_sha, file_url, and html_url. Triggers deploy resume same as write_github_file.',
        parameters: {
          type: 'object',
          properties: {
            ...repoProps,
            path: {
              type: 'string',
              description: 'Target file path in the repo, e.g. public/logo.png or public/images/hero.jpg',
            },
            url: {
              type: 'string',
              description: 'Public URL to fetch the binary from (server-side fetch). Use when the file is accessible at a URL.',
            },
            base64: {
              type: 'string',
              description: 'Raw base64-encoded file content (with or without data URI prefix). Use when you have the raw bytes from a chat attachment.',
            },
            message: {
              type: 'string',
              description: 'Git commit message (defaults to "Add <filename>")',
            },
            branch: {
              type: 'string',
              description: `Branch to commit to (defaults to ${defaultBranch})`,
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    },
  ];

  if (ops) {
    defs.push(
      {
        type: 'function',
        function: {
          name: 'list_open_branches',
          description:
            'List active branches on GitHub with how far each is ahead/behind the default branch. Use to track in-progress work.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_github_repo',
          description:
            'Create a new GitHub repository under a user or org account. Requires GITHUB_TOKEN with repo creation permission (classic PAT: repo scope; fine-grained: Administration write on the org). Use auto_init:true when you need a default branch before write_github_file. Agency / ops only — provision each client\'s front-end website repo here (eliteweblabs/{slug}-site).',
          parameters: {
            type: 'object',
            properties: {
              repo: {
                type: 'string',
                description: 'owner/name for the new repo, e.g. eliteweblabs/tonybarlettajr-site',
              },
              description: { type: 'string', description: 'Short repo description' },
              private: {
                type: 'boolean',
                description: 'Whether the repo is private (default true)',
              },
              auto_init: {
                type: 'boolean',
                description:
                  'Initialize with an empty README so the repo has a default branch (default false)',
              },
            },
            required: ['repo'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_github_branch',
          description: `Create a new branch from an existing branch (default from_branch: ${defaultBranch}). Use before write_github_file when no feature branch exists yet. Requires GITHUB_TOKEN with Contents write.`,
          parameters: {
            type: 'object',
            properties: {
              repo: {
                type: 'string',
                description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
              },
              branch: { type: 'string', description: 'New branch name, e.g. feature/fix-typo' },
              from_branch: {
                type: 'string',
                description: `Existing branch to branch from (defaults to ${defaultBranch})`,
              },
            },
            required: ['branch'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_pull_request',
          description:
            'Open a pull request on GitHub. Use after write_github_file commits on a feature branch. Requires GITHUB_TOKEN with Pull requests write. This project normally commits straight to main — only when explicitly asked.',
          parameters: {
            type: 'object',
            properties: {
              repo: {
                type: 'string',
                description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
              },
              head: { type: 'string', description: 'Head branch (the branch with your changes)' },
              base: {
                type: 'string',
                description: `Base branch to merge into (defaults to ${defaultBranch})`,
              },
              title: { type: 'string', description: 'PR title' },
              body: { type: 'string', description: 'PR description (markdown ok)' },
            },
            required: ['head', 'title'],
            additionalProperties: false,
          },
        },
      },
    );
  }

  return defs;
}

export const githubPublishHandlers: Record<string, ToolHandler> = {
  get_git_status: handle_get_git_status,
  get_recent_commits: handle_get_recent_commits,
  check_deployment_status: handle_check_deployment_status,
  list_open_branches: handle_list_open_branches,
  create_github_repo: handle_create_github_repo,
  create_github_branch: handle_create_github_branch,
  read_github_file: handle_read_github_file,
  write_github_file: handle_write_github_file,
  undo_website_change: handle_undo_website_change,
  create_pull_request: handle_create_pull_request,
  push_binary_to_github: handle_push_binary_to_github,
};
