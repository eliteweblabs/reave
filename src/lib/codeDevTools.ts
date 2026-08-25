/**
 * Local filesystem + shell tools for the in-app coding agent.
 * Gated by the `code_dev` install feature (web dev agencies and internal installs).
 *
 * Paths are sandboxed to the project root. Shell runs with cwd = project root.
 */
import { execFile } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { maybeDeferExecCommand } from './deferredDeploy';
import { projectRoot } from './projectRoot';

const MAX_READ_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 512 * 1024;
const MAX_LIST_ENTRIES = 500;
const MAX_EXEC_OUTPUT = 32_000;
const MAX_GREP_MATCHES = 200;
const MAX_GREP_LINE_LEN = 500;
const EXEC_TIMEOUT_MS = 60_000;

/** Minimal env for shell children — never forward secrets from process.env. */
const SAFE_EXEC_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'SHELL',
  'NODE_ENV',
  'npm_config_cache',
  'npm_config_prefix',
] as const;

function safeExecEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { FORCE_COLOR: '0' };
  for (const key of SAFE_EXEC_ENV_KEYS) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

/** Block obviously destructive or exfiltration-oriented shell patterns. */
const BLOCKED_EXEC_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--recursive\b)/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(curl|wget)\s+[^\s|;&]+\s*\|/i,
  /\b(nc|netcat|ncat)\s+/i,
  /\bssh\s+[^\s]+@/i,
  />\s*\/dev\/(tcp|udp)\//i,
  /\|\s*(ba)?sh\b/i,
  /\bchmod\s+[0-7]*[67][0-7]{2}\b/,
  /\bsudo\b/i,
  /\bsu\s+-/i,
  /\bkillall\b/i,
  /\bpkill\s+-9\b/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\b(chown|chgrp)\s+root\b/i,
];

function validateExecCommand(cmd: string): string | null {
  for (const pattern of BLOCKED_EXEC_PATTERNS) {
    if (pattern.test(cmd)) {
      return 'command blocked by safety policy';
    }
  }
  return null;
}


function resolveSafePath(
  userPath: string,
): { ok: true; abs: string; rel: string } | { ok: false; error: string } {
  const root = projectRoot();
  const raw = (userPath || '.').trim() || '.';
  if (raw.includes('\0')) return { ok: false, error: 'invalid path' };
  const abs = resolve(root, raw);
  const rel = relative(root, abs);
  if (rel.startsWith(`..${sep}`) || rel === '..' || (rel && resolve(root, rel) !== abs)) {
    return { ok: false, error: 'path escapes project root' };
  }
  return { ok: true, abs, rel: rel || '.' };
}

function isEnvLikePath(rel: string): boolean {
  const base = rel.split(sep).pop() ?? rel;
  return base === '.env' || base.startsWith('.env.');
}

export type CodeDevResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function codeDevReadFile(
  path: string,
  opts: { offset?: number; limit?: number } = {},
): CodeDevResult {
  const resolved = resolveSafePath(path);
  if (!resolved.ok) return resolved;
  if (isEnvLikePath(resolved.rel)) {
    return { ok: false, error: 'reading .env files is blocked' };
  }
  if (!existsSync(resolved.abs)) return { ok: false, error: `not found: ${resolved.rel}` };
  const st = statSync(resolved.abs);
  if (!st.isFile()) return { ok: false, error: `not a file: ${resolved.rel}` };
  if (st.size > MAX_READ_BYTES) {
    const offset = Math.max(1, Math.floor(opts.offset ?? 1));
    const limit = Math.min(500, Math.max(1, Math.floor(opts.limit ?? 200)));
    const content = readFileSync(resolved.abs, 'utf8');
    const lineArr = content.split('\n');
    const slice = lineArr.slice(offset - 1, offset - 1 + limit);
    return {
      ok: true,
      data: {
        path: resolved.rel,
        bytes: st.size,
        total_lines: lineArr.length,
        offset,
        limit,
        truncated_file: true,
        content: slice
          .map((line, i) => `${offset + i}|${line.slice(0, MAX_GREP_LINE_LEN)}`)
          .join('\n'),
      },
    };
  }
  const content = readFileSync(resolved.abs, 'utf8');
  const lineArr = content.split('\n');
  const offset = Math.max(1, Math.floor(opts.offset ?? 1));
  const limit = Math.floor(opts.limit ?? 0);
  if (limit > 0 && (offset > 1 || limit < lineArr.length)) {
    const slice = lineArr.slice(offset - 1, offset - 1 + limit);
    return {
      ok: true,
      data: {
        path: resolved.rel,
        bytes: Buffer.byteLength(content, 'utf8'),
        total_lines: lineArr.length,
        offset,
        limit,
        content: slice.map((line, i) => `${offset + i}|${line}`).join('\n'),
      },
    };
  }
  return {
    ok: true,
    data: { path: resolved.rel, bytes: Buffer.byteLength(content, 'utf8'), total_lines: lineArr.length, content },
  };
}

/**
 * Write a file, or append to it.
 *
 * Append exists because a file's whole body travels inside a single tool call's
 * arguments, which are billed as output tokens: a large page cannot be written in
 * one call no matter how big the budget is. Appending lets the model build a long
 * file in sections instead of failing on the first oversized attempt.
 */
export function codeDevWriteFile(
  path: string,
  content: string,
  opts: { append?: boolean } = {},
): CodeDevResult {
  const resolved = resolveSafePath(path);
  if (!resolved.ok) return resolved;
  if (isEnvLikePath(resolved.rel)) {
    return { ok: false, error: 'writing .env files is blocked' };
  }
  if (typeof content !== 'string') return { ok: false, error: 'content must be a string' };

  const exists = existsSync(resolved.abs);
  const append = Boolean(opts.append) && exists;
  const existingBytes = append ? statSync(resolved.abs).size : 0;
  const bytes = Buffer.byteLength(content, 'utf8');
  if (existingBytes + bytes > MAX_WRITE_BYTES) {
    return {
      ok: false,
      error: `content too large (${existingBytes + bytes} bytes; max ${MAX_WRITE_BYTES})`,
    };
  }

  const parent = dirname(resolved.abs);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  const body = content.endsWith('\n') ? content : `${content}\n`;
  if (append) appendFileSync(resolved.abs, body, 'utf8');
  else writeFileSync(resolved.abs, body, 'utf8');

  return {
    ok: true,
    data: {
      path: resolved.rel,
      bytes,
      total_bytes: existingBytes + bytes,
      created: !exists,
      updated: exists,
      appended: append,
    },
  };
}

export function codeDevListFiles(path: string, recursive = false): CodeDevResult {
  const resolved = resolveSafePath(path);
  if (!resolved.ok) return resolved;
  if (!existsSync(resolved.abs)) return { ok: false, error: `not found: ${resolved.rel}` };
  const st = statSync(resolved.abs);
  if (!st.isDirectory()) return { ok: false, error: `not a directory: ${resolved.rel}` };

  const entries: Array<{ path: string; type: 'file' | 'dir'; size?: number }> = [];
  const root = projectRoot();

  const walk = (dirAbs: string) => {
    if (entries.length >= MAX_LIST_ENTRIES) return;
    let names: string[];
    try {
      names = readdirSync(dirAbs);
    } catch (e) {
      return;
    }
    names.sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      if (entries.length >= MAX_LIST_ENTRIES) break;
      if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.astro') continue;
      if (isEnvLikePath(name)) continue;
      const abs = join(dirAbs, name);
      let childSt;
      try {
        childSt = statSync(abs);
      } catch {
        continue;
      }
      const rel = relative(root, abs) || '.';
      if (childSt.isDirectory()) {
        entries.push({ path: rel, type: 'dir' });
        if (recursive) walk(abs);
      } else if (childSt.isFile()) {
        entries.push({ path: rel, type: 'file', size: childSt.size });
      }
    }
  };

  walk(resolved.abs);
  return {
    ok: true,
    data: {
      path: resolved.rel,
      recursive,
      truncated: entries.length >= MAX_LIST_ENTRIES,
      entries,
    },
  };
}

export async function codeDevGrep(
  pattern: string,
  searchPath = '.',
  opts: { glob?: string; ignoreCase?: boolean } = {},
): Promise<CodeDevResult> {
  const rawPattern = (pattern || '').trim();
  if (!rawPattern) return { ok: false, error: 'pattern is required' };
  if (rawPattern.length > 300) return { ok: false, error: 'pattern too long' };

  const resolved = resolveSafePath(searchPath.trim() || '.');
  if (!resolved.ok) return resolved;

  const root = projectRoot();
  const rgArgs = [
    '--line-number',
    '--no-heading',
    '--color=never',
    '--max-count',
    String(Math.ceil(MAX_GREP_MATCHES / 10)),
    '--glob=!.git/**',
    '--glob=!node_modules/**',
    '--glob=!dist/**',
    '--glob=!.astro/**',
    '--glob=!.env',
    '--glob=!.env.*',
  ];
  if (opts.ignoreCase) rgArgs.push('-i');
  if (opts.glob?.trim()) rgArgs.push(`--glob=${opts.glob.trim()}`);
  rgArgs.push(rawPattern, resolved.rel === '.' ? '.' : resolved.rel);

  const runRg = () =>
    new Promise<{ ok: true; stdout: string } | { ok: false; error: string }>((resolvePromise) => {
      execFile('rg', rgArgs, { cwd: root, timeout: 30_000, maxBuffer: 512 * 1024 }, (err, stdout) => {
        if (err && !stdout) {
          const code = (err as { code?: unknown }).code;
          if (code === 1) return resolvePromise({ ok: true, stdout: '' });
          return resolvePromise({ ok: false, error: err.message });
        }
        resolvePromise({ ok: true, stdout: stdout ?? '' });
      });
    });

  let stdout: string;
  const rg = await runRg();
  if (rg.ok) {
    stdout = rg.stdout;
  } else {
    const grepArgs = ['-rn', '--binary-files=without-match', rawPattern, resolved.rel === '.' ? '.' : resolved.rel];
    const grep = await new Promise<{ ok: boolean; stdout: string; error?: string }>((resolvePromise) => {
      execFile(
        'grep',
        grepArgs,
        { cwd: root, timeout: 30_000, maxBuffer: 512 * 1024 },
        (err, out) => {
          if (err && !out) {
            const code = (err as { code?: unknown }).code;
            if (code === 1) return resolvePromise({ ok: true, stdout: '' });
            return resolvePromise({ ok: false, stdout: '', error: err.message });
          }
          resolvePromise({ ok: true, stdout: out ?? '' });
        },
      );
    });
    if (!grep.ok) return { ok: false, error: grep.error ?? 'grep failed' };
    stdout = grep.stdout;
  }

  const lines = stdout
    .split('\n')
    .filter(Boolean)
    .slice(0, MAX_GREP_MATCHES)
    .map((line) => (line.length > MAX_GREP_LINE_LEN ? `${line.slice(0, MAX_GREP_LINE_LEN)}…` : line));

  return {
    ok: true,
    data: {
      pattern: rawPattern,
      path: resolved.rel,
      match_count: lines.length,
      truncated: stdout.split('\n').filter(Boolean).length > lines.length,
      matches: lines,
    },
  };
}

export async function codeDevExecCommand(command: string): Promise<CodeDevResult> {
  const cmd = command.trim();
  if (!cmd) return { ok: false, error: 'command is required' };
  if (cmd.length > 2000) return { ok: false, error: 'command too long' };
  if (/\b\.env(?:\.|$|\s)/.test(cmd)) {
    return { ok: false, error: 'commands that reference .env files are blocked' };
  }
  const blocked = validateExecCommand(cmd);
  if (blocked) return { ok: false, error: blocked };

  const deferred = await maybeDeferExecCommand(cmd);
  if (deferred) {
    return {
      ok: true,
      data: {
        command: cmd,
        cwd: '.',
        exit_code: deferred.run_now?.exit_code ?? 0,
        stdout: deferred.run_now?.stdout ?? '',
        stderr: deferred.run_now?.stderr ?? '',
        deferred: true,
        note: deferred.note,
      },
    };
  }

  const root = projectRoot();
  return new Promise((resolvePromise) => {
    // Use /bin/sh -c so git/npm/node pipelines work; cwd is always project root.
    execFile(
      '/bin/sh',
      ['-c', cmd],
      {
        cwd: root,
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: 512 * 1024,
        env: safeExecEnv(),
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const out = (stdout ?? '').slice(0, MAX_EXEC_OUTPUT);
        const errOut = (stderr ?? '').slice(0, Math.floor(MAX_EXEC_OUTPUT / 4));
        const timedOut = Boolean(err && /ETIMEDOUT|timed out/i.test(err.message));
        const exitCode =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        if (err && !out && !errOut) {
          resolvePromise({ ok: false, error: err.message });
          return;
        }
        resolvePromise({
          ok: true,
          data: {
            command: cmd,
            cwd: '.',
            exit_code: exitCode,
            stdout: out,
            stderr: errOut,
            timed_out: timedOut,
          },
        });
      },
    );
  });
}

export function codeDevProjectRoot(): string {
  return projectRoot();
}
