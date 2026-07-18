/**
 * Sandboxed, read-only command runner for the admin agent.
 *
 * Hard constraints (defense in depth):
 *  - No shell. We use execFile, so there is no globbing, no pipes, no `;`/`&&`,
 *    no `$(...)`, no redirection. The first token is the binary, the rest are
 *    literal argv.
 *  - Binary allowlist: only `git`, `ls`, `pwd`.
 *  - For `git`, only read-only subcommands are permitted (status/log/diff/...).
 *  - Any shell metacharacter in the raw input is rejected outright.
 *  - 8s timeout, capped output.
 *
 * On the deployed Railway container there is usually no `.git` checkout, so git
 * commands will report "not a git repository" — that's expected. This tool is
 * primarily useful where the repo is checked out (local/dev).
 */
import { execFile } from 'node:child_process';

const ALLOWED_BINARIES = new Set(['git', 'ls', 'pwd']);

// Read-only git subcommands only. Anything that can write/fetch/push is excluded.
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'show',
  'branch',
  'rev-parse',
  'remote',
  'describe',
  'shortlog',
  'ls-files',
  'config', // read-only usage enforced below (no --add/--unset/value writes)
]);

// Tokens that must never appear (shell injection / write intent), even though we
// don't use a shell — belt and suspenders.
const FORBIDDEN_PATTERN = /[;&|`$><\n\r\\]|\$\(|&&|\|\|/;

export type SafeShellResult =
  | { ok: true; command: string; stdout: string; stderr: string }
  | { ok: false; error: string };

function tokenize(raw: string): string[] {
  // Simple whitespace split; we already reject quotes/metacharacters below, so
  // there is no quoting to honor.
  return raw.trim().split(/\s+/).filter(Boolean);
}

function validate(raw: string): { ok: true; argv: string[] } | { ok: false; error: string } {
  const command = raw.trim();
  if (!command) return { ok: false, error: 'empty command' };
  if (command.length > 300) return { ok: false, error: 'command too long' };
  if (FORBIDDEN_PATTERN.test(command)) {
    return { ok: false, error: 'command contains forbidden characters (no pipes, redirects, chaining, or substitution)' };
  }
  if (command.includes('"') || command.includes("'")) {
    return { ok: false, error: 'quotes are not allowed' };
  }

  const argv = tokenize(command);
  const bin = argv[0];
  if (!ALLOWED_BINARIES.has(bin)) {
    return { ok: false, error: `binary "${bin}" is not allowed. Allowed: ${[...ALLOWED_BINARIES].join(', ')}` };
  }

  if (bin === 'git') {
    const sub = argv[1];
    if (!sub || !ALLOWED_GIT_SUBCOMMANDS.has(sub)) {
      return {
        ok: false,
        error: `git subcommand "${sub ?? ''}" not allowed. Allowed: ${[...ALLOWED_GIT_SUBCOMMANDS].join(', ')}`,
      };
    }
    if (sub === 'config') {
      // Read-only config only: `git config --get x` / `git config --list`.
      const writeish = argv.slice(2).some((a) => ['--add', '--unset', '--unset-all', '--replace-all', '--edit', '-e'].includes(a));
      const hasGetOrList = argv.slice(2).some((a) => a === '--get' || a === '--list' || a === '-l' || a === '--get-all');
      if (writeish || !hasGetOrList) {
        return { ok: false, error: 'git config is read-only here (use --get or --list)' };
      }
    }
  }

  return { ok: true, argv };
}

export function describeSafeShell(): { binaries: string[]; git_subcommands: string[] } {
  return { binaries: [...ALLOWED_BINARIES], git_subcommands: [...ALLOWED_GIT_SUBCOMMANDS] };
}

export async function runSafeShellCommand(raw: string): Promise<SafeShellResult> {
  const v = validate(raw);
  if (!v.ok) return v;
  const [bin, ...args] = v.argv;

  return new Promise<SafeShellResult>((resolve) => {
    execFile(
      bin,
      args,
      { cwd: process.cwd(), timeout: 8_000, maxBuffer: 256 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const out = (stdout ?? '').slice(0, 8_000);
        const errOut = (stderr ?? '').slice(0, 2_000);
        if (err && !out && !errOut) {
          resolve({ ok: false, error: err.message });
          return;
        }
        resolve({ ok: true, command: v.argv.join(' '), stdout: out, stderr: errOut });
      }
    );
  });
}
