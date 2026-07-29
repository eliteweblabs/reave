/**
 * Run scripts/seed-demo.ts from the admin API or agent tools.
 * Spawns the CLI script so seed logic stays in one place.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DemoSeedOptions = {
  fresh?: boolean;
  forceCompany?: boolean;
  withBookings?: boolean;
  dryRun?: boolean;
};

export type DemoSeedResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; error: string; stdout?: string; stderr?: string };

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (dir.endsWith('/src/lib') || dir.endsWith('\\src\\lib')) {
      return join(dir, '..', '..');
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

export function runDemoSeed(options: DemoSeedOptions = {}): DemoSeedResult {
  const root = repoRoot();
  const script = join(root, 'scripts', 'seed-demo.ts');
  const loader = join(root, 'scripts', 'ts-extensionless-resolve.mjs');

  const args = [
    '--import',
    loader,
    '--experimental-strip-types',
    script,
  ];
  if (options.fresh) args.push('--fresh');
  if (options.forceCompany) args.push('--force-company');
  if (options.withBookings) args.push('--with-bookings');
  if (options.dryRun) args.push('--dry-run');

  const child = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const stdout = child.stdout ?? '';
  const stderr = child.stderr ?? '';

  if (child.error) {
    return {
      ok: false,
      error: child.error.message,
      stdout,
      stderr,
    };
  }

  if (child.status !== 0) {
    const msg =
      stderr.trim().split('\n').pop() ||
      stdout.trim().split('\n').pop() ||
      `seed-demo exited with code ${child.status ?? 'unknown'}`;
    return { ok: false, error: msg, stdout, stderr };
  }

  return { ok: true, stdout, stderr };
}
