/**
 * Defer GitHub commits and git pushes until an agent chat turn finishes.
 *
 * Pushing to main triggers a Railway deploy, which restarts the container and
 * kills in-flight agent runs. Queue deploy-triggering work during a turn and
 * flush after the reply is saved so the run is not interrupted mid-turn.
 */
import { getAgentContext } from './agentContext';
import { isAgentRunActive } from './agentRunControl';
import { splitGitPushCommand } from './deferredDeploySplit';
import {
  githubDefaultBranch,
  githubWriteFile,
  type GithubFileWriteResult,
} from './githubClient';
import { serverEnv } from './serverEnv';

export type DeferredGithubWrite = {
  repo?: string;
  branch: string;
  path: string;
  content: string;
  message: string;
  append?: boolean;
};

type RunQueue = {
  github: DeferredGithubWrite[];
  pushes: string[];
};

const queues = new Map<string, RunQueue>();

function runKey(userId: string, threadId: string): string {
  return `${userId}:${threadId}`;
}

function queueFor(userId: string, threadId: string): RunQueue {
  const key = runKey(userId, threadId);
  let q = queues.get(key);
  if (!q) {
    q = { github: [], pushes: [] };
    queues.set(key, q);
  }
  return q;
}

function deployedOnRailway(): boolean {
  return Boolean(
    serverEnv('RAILWAY_GIT_COMMIT_SHA')?.trim() || serverEnv('GIT_COMMIT_SHA')?.trim(),
  );
}

/** When true (default on Railway), defer main-branch GitHub writes and git push until turn end. */
export function isDeferredDeployEnabled(): boolean {
  const raw = serverEnv('DEFER_DEPLOY_UNTIL_TURN_END')?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
  return deployedOnRailway();
}

function isDefaultBranch(branch: string): boolean {
  return branch.trim().toLowerCase() === githubDefaultBranch().toLowerCase();
}

/** True when deploy-triggering tool calls should be queued for this turn. */
export function shouldDeferDeploy(): boolean {
  if (!isDeferredDeployEnabled()) return false;
  const { userId, threadId } = getAgentContext();
  if (!userId?.trim() || !threadId?.trim()) return false;
  return isAgentRunActive(userId, threadId);
}

export { splitGitPushCommand } from './deferredDeploySplit';

export type DeferredGithubWriteResult = GithubFileWriteResult & {
  deferred: true;
  note: string;
};

/** Queue a write_github_file to main, or return null to proceed immediately. */
export function maybeDeferGithubWrite(opts: DeferredGithubWrite): DeferredGithubWriteResult | null {
  if (!shouldDeferDeploy()) return null;
  if (!isDefaultBranch(opts.branch)) return null;

  const { userId, threadId } = getAgentContext();
  if (!userId || !threadId) return null;

  queueFor(userId, threadId).github.push({ ...opts });

  return {
    deferred: true,
    repo: opts.repo?.trim() || '',
    branch: opts.branch,
    path: opts.path,
    sha: 'deferred',
    commit_sha: 'deferred',
    commit_url: '',
    created: !opts.append,
    note:
      'Commit queued locally — will push to GitHub when this chat turn finishes so the deploy does not interrupt the run.',
  };
}

export type DeferredExecResult = {
  deferred: true;
  command: string;
  run_now?: { exit_code: number; stdout: string; stderr: string };
  note: string;
};

/**
 * Run a shell command, deferring any `git push` segments until the turn ends.
 * Returns null when the command should run normally (no deferral).
 */
export async function maybeDeferExecCommand(
  command: string,
): Promise<DeferredExecResult | null> {
  if (!shouldDeferDeploy()) return null;

  const split = splitGitPushCommand(command);
  if (!split) return null;

  const { userId, threadId } = getAgentContext();
  if (!userId || !threadId) return null;

  const q = queueFor(userId, threadId);
  for (const pushCmd of split.pushCommands) {
    q.pushes.push(pushCmd);
  }

  if (!split.runNow) {
    return {
      deferred: true,
      command,
      note:
        'git push queued — will run when this chat turn finishes so the deploy does not interrupt the run.',
    };
  }

  const { codeDevExecCommand } = await import('./codeDevTools');
  const runResult = await codeDevExecCommand(split.runNow);
  if (!runResult.ok) {
    return {
      deferred: true,
      command,
      note: `git push queued, but the preceding command failed: ${runResult.error}`,
    };
  }

  const data = runResult.data;
  return {
    deferred: true,
    command,
    run_now: {
      exit_code: typeof data.exit_code === 'number' ? data.exit_code : 0,
      stdout: String(data.stdout ?? ''),
      stderr: String(data.stderr ?? ''),
    },
    note:
      'git push queued — will run when this chat turn finishes so the deploy does not interrupt the run.',
  };
}

export type FlushItemResult = { ok: boolean; error?: string };

export type FlushDeferredDeployResult = {
  ok: boolean;
  github: Array<{ path: string } & FlushItemResult>;
  pushes: Array<{ command: string } & FlushItemResult>;
};

/** Apply queued GitHub writes and git pushes for a thread. Safe to call when empty. */
export async function flushDeferredDeploy(
  userId: string,
  threadId: string,
): Promise<FlushDeferredDeployResult> {
  const key = runKey(userId, threadId);
  const q = queues.get(key);
  if (!q || (!q.github.length && !q.pushes.length)) {
    return { ok: true, github: [], pushes: [] };
  }

  queues.delete(key);

  const github: FlushDeferredDeployResult['github'] = [];
  for (const write of q.github) {
    const result = await githubWriteFile(write);
    if (result.ok) {
      github.push({ path: write.path, ok: true });
    } else {
      github.push({ path: write.path, ok: false, error: result.error });
    }
  }

  const pushes: FlushDeferredDeployResult['pushes'] = [];
  const { codeDevExecCommand } = await import('./codeDevTools');
  for (const command of q.pushes) {
    const result = await codeDevExecCommand(command);
    if (result.ok) {
      const exitCode = typeof result.data.exit_code === 'number' ? result.data.exit_code : 0;
      if (exitCode === 0) {
        pushes.push({ command, ok: true });
      } else {
        pushes.push({
          command,
          ok: false,
          error: `exit ${exitCode}: ${String(result.data.stderr ?? result.data.stdout ?? '').slice(0, 200)}`,
        });
      }
    } else {
      pushes.push({ command, ok: false, error: result.error });
    }
  }

  const ok = github.every((g) => g.ok) && pushes.every((p) => p.ok);
  const shipped = github.some((g) => g.ok) || pushes.some((p) => p.ok);
  if (shipped) {
    const { ensureDefaultDeployResume } = await import('./deployResume');
    await ensureDefaultDeployResume(threadId);
  }
  return { ok, github, pushes };
}

/** Append a deploy-failure note when flush did not fully succeed. */
export function formatFlushFailureNote(result: FlushDeferredDeployResult): string {
  const lines: string[] = [];
  for (const g of result.github) {
    if (!g.ok) lines.push(`GitHub \`${g.path}\`: ${g.error ?? 'failed'}`);
  }
  for (const p of result.pushes) {
    if (!p.ok) lines.push(`\`${p.command}\`: ${p.error ?? 'failed'}`);
  }
  if (!lines.length) return '';
  return (
    '_(Deploy note: queued changes did not all reach GitHub — ' +
    `${lines.join('; ')}. Retry or check Railway logs.)_`
  );
}

/** Test helper — clear all queues. */
export function _clearDeferredDeployQueuesForTests(): void {
  queues.clear();
}
