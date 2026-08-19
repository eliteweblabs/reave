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
  skipInbox?: boolean;
  skipTodos?: boolean;
  skipSchedule?: boolean;
  dryRun?: boolean;
  industry?: string;
  moduleIds?: string[];
  tier?: number;
  /** Override DEMO_REAL_CONTACT_* for this run (visitor personalization). */
  visitorName?: string;
  visitorEmail?: string;
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
  if (options.skipInbox) args.push('--no-inbox');
  if (options.skipTodos) args.push('--no-todos');
  if (options.skipSchedule) args.push('--no-schedule');
  if (options.dryRun) args.push('--dry-run');
  if (options.industry?.trim()) {
    args.push('--industry', options.industry.trim());
  }
  if (options.moduleIds?.length) {
    args.push('--module-ids', options.moduleIds.join(','));
  }
  if (options.tier != null && options.tier > 0) {
    args.push('--tier', String(options.tier));
  }

  const child = spawnSync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      ...(options.visitorEmail?.trim()
        ? { DEMO_REAL_CONTACT_EMAIL: options.visitorEmail.trim().toLowerCase() }
        : {}),
      ...(options.visitorName?.trim()
        ? { DEMO_REAL_CONTACT_NAME: options.visitorName.trim() }
        : {}),
    },
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
