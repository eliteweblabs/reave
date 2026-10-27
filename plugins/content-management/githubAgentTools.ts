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
  githubWriteFileBinary,
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
