/**
 * Git publish tools for the Agentic Website Editor.
 * Also reused by Dev & Infrastructure when that private module is on
 * and content_management is not (deploy repair still needs write_github_file).
 */
import { getGitStatus, getRecentCommits, listOpenBranches, checkDeploymentStatus } from '../../src/lib/devStatus';
import {
  githubCreateBranch,
  githubCreatePullRequest,
  githubCreateRepo,
  githubDefaultBranch,
  githubRepoSlug,
  githubWriteFile,
} from '../../src/lib/githubClient';
import { maybeDeferGithubWrite } from '../../src/lib/deferredDeploy';
import { getAgentContext } from '../../src/lib/agentContext';
import type { AgentToolDef, ToolContext, ToolHandler } from '../../src/lib/agentTools/types';

async function handle_get_git_status(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await getGitStatus({
    repo: typeof args.repo === 'string' && args.repo.trim() ? args.repo.trim() : undefined,
    branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_get_recent_commits(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await getRecentCommits({
    repo: typeof args.repo === 'string' && args.repo.trim() ? args.repo.trim() : undefined,
    branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
    with_files: args.with_files === true,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_check_deployment_status(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await checkDeploymentStatus({
    repo: typeof args.repo === 'string' && args.repo.trim() ? args.repo.trim() : undefined,
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
  const result = await githubCreateBranch({
    repo: typeof args.repo === 'string' ? args.repo : undefined,
    branch: String(args.branch ?? '').trim(),
    from_branch: typeof args.from_branch === 'string' ? args.from_branch : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_write_github_file(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const writeArgs = {
    repo: typeof args.repo === 'string' ? args.repo : undefined,
    branch: String(args.branch ?? '').trim(),
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

async function handle_create_pull_request(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await githubCreatePullRequest({
    repo: typeof args.repo === 'string' ? args.repo : undefined,
    head: String(args.head ?? '').trim(),
    base: typeof args.base === 'string' && args.base.trim() ? args.base.trim() : undefined,
    title: String(args.title ?? '').trim(),
    body: typeof args.body === 'string' ? args.body : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

export function githubPublishDefinitions(_ctx: ToolContext): AgentToolDef[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_git_status',
        description:
          'Snapshot of the GitHub repo (source of truth): current/default branch, latest commits, branch count, and whether the live site is on the latest commit. Pass repo for sibling services. Local uncommitted/unstaged changes are NOT visible here.',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'GitHub owner/repo; defaults to GITHUB_REPO.' },
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
        description:
          'Recent commit history from GitHub (author, message, timestamp, link; optionally files changed). Pass repo for sibling services. Use with_files:true when diagnosing a failed publish.',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'GitHub owner/repo; defaults to GITHUB_REPO.' },
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
          'Is the latest pushed code live? Compares the deployed commit to GitHub latest and pings a health URL. Works with any host that deploys from this repo. Pass repo + health_url for sibling services.',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'GitHub owner/repo; defaults to GITHUB_REPO.' },
            health_url: { type: 'string', description: 'Health ping URL; defaults to DEPLOY_HEALTH_URL or the public site.' },
          },
          additionalProperties: false,
        },
      },
    },
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
          'Create a new GitHub repository under a user or org account. Requires GITHUB_TOKEN with repo creation permission (classic PAT: repo scope; fine-grained: Administration write on the org). Use auto_init:true when you need a default branch before write_github_file.',
        parameters: {
          type: 'object',
          properties: {
            repo: {
              type: 'string',
              description: 'owner/name for the new repo, e.g. eliteweblabs/my-client-site',
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
        description: `Create a new branch from an existing branch (default from_branch: ${githubDefaultBranch()}). Use before write_github_file when no feature branch exists yet. Requires GITHUB_TOKEN with Contents write.`,
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
              description: `Existing branch to branch from (defaults to ${githubDefaultBranch()})`,
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
        name: 'write_github_file',
        description:
          'Create or update a file in a GitHub repo via the Contents API. Commits directly to the given branch (branch must already exist). Requires GITHUB_TOKEN with Contents write. Returns commit SHA and URL. For a long file (a full page, a big component), write it in sections: one call for the first chunk, then more calls with append:true — a single call carrying the whole body will be cut off by the output limit and nothing will be written.',
        parameters: {
          type: 'object',
          properties: {
            repo: {
              type: 'string',
              description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
            },
            branch: { type: 'string', description: 'Target branch to commit to' },
            path: { type: 'string', description: 'File path in the repo, e.g. src/pages/about.astro' },
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
        name: 'create_pull_request',
        description:
          'Open a pull request on GitHub. Use after write_github_file commits on a feature branch. Requires GITHUB_TOKEN with Pull requests write.',
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
              description: `Base branch to merge into (defaults to ${githubDefaultBranch()})`,
            },
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR description (markdown ok)' },
          },
          required: ['head', 'title'],
          additionalProperties: false,
        },
      },
    },
  ];
}

export const githubPublishHandlers: Record<string, ToolHandler> = {
  get_git_status: handle_get_git_status,
  get_recent_commits: handle_get_recent_commits,
  check_deployment_status: handle_check_deployment_status,
  list_open_branches: handle_list_open_branches,
  create_github_repo: handle_create_github_repo,
  create_github_branch: handle_create_github_branch,
  write_github_file: handle_write_github_file,
  create_pull_request: handle_create_pull_request,
};
