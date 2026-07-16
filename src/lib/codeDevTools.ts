/**
 * Local filesystem + shell tools for the in-app coding agent.
 * Gated by the `code_dev` install feature (Reave only — not for other installs).
 *
 * Paths are sandboxed to the project root. Shell runs with cwd = project root.
 */
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_READ_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 512 * 1024;
const MAX_LIST_ENTRIES = 500;
const MAX_EXEC_OUTPUT = 32_000;
const EXEC_TIMEOUT_MS = 60_000;

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
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

export function codeDevReadFile(path: string): CodeDevResult {
  const resolved = resolveSafePath(path);
  if (!resolved.ok) return resolved;
  if (!existsSync(resolved.abs)) return { ok: false, error: `not found: ${resolved.rel}` };
  const st = statSync(resolved.abs);
  if (!st.isFile()) return { ok: false, error: `not a file: ${resolved.rel}` };
  if (st.size > MAX_READ_BYTES) {
    return { ok: false, error: `file too large (${st.size} bytes; max ${MAX_READ_BYTES})` };
  }
  const content = readFileSync(resolved.abs, 'utf8');
  return {
    ok: true,
    data: { path: resolved.rel, bytes: Buffer.byteLength(content, 'utf8'), content },
  };
}

export function codeDevWriteFile(path: string, content: string): CodeDevResult {
  const resolved = resolveSafePath(path);
  if (!resolved.ok) return resolved;
  if (isEnvLikePath(resolved.rel)) {
    return { ok: false, error: 'writing .env files is blocked' };
  }
  if (typeof content !== 'string') return { ok: false, error: 'content must be a string' };
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_WRITE_BYTES) {
    return { ok: false, error: `content too large (${bytes} bytes; max ${MAX_WRITE_BYTES})` };
  }
  const parent = dirname(resolved.abs);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  const created = !existsSync(resolved.abs);
  writeFileSync(resolved.abs, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  return {
    ok: true,
    data: { path: resolved.rel, bytes, created, updated: !created },
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

export async function codeDevExecCommand(command: string): Promise<CodeDevResult> {
  const cmd = command.trim();
  if (!cmd) return { ok: false, error: 'command is required' };
  if (cmd.length > 2000) return { ok: false, error: 'command too long' };

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
        env: { ...process.env, FORCE_COLOR: '0' },
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
