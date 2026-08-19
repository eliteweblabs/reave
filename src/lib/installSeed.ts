/**
 * First-boot sample data for a new install (deploy-wizard SEED_ON_BOOT).
 * Runs inbox / todos / schedule seeds without turning on sales DEMO_MODE.
 */
import { getDemoSetupStatus } from './demoMode';
import { runDemoSeed } from './demoSeedRunner';
import { serverEnv } from './serverEnv';

export function shouldSeedOnBoot(): boolean {
  const flag = serverEnv('SEED_ON_BOOT')?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function installSeedIndustry(): string {
  return serverEnv('DEMO_INDUSTRY')?.trim() || 'general';
}

function envOn(name: string, fallback = true): boolean {
  const raw = serverEnv(name)?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw !== '0' && raw !== 'false' && raw !== 'no';
}

let running: Promise<{ ok: boolean; detail: string }> | null = null;

export async function ensureInstallSeed(): Promise<{ ok: boolean; detail: string; skipped?: boolean }> {
  if (!shouldSeedOnBoot()) return { ok: true, skipped: true, detail: 'SEED_ON_BOOT is off' };
  if (running) return running;

  running = (async () => {
    const status = await getDemoSetupStatus();
    if (status.seeded) return { ok: true, skipped: true, detail: 'Sample data already present' };
    if (!status.checks.find((c) => c.id === 'database')?.ok) {
      return { ok: false, detail: 'DATABASE_URL is not ready for sample data' };
    }

    const result = runDemoSeed({
      industry: installSeedIndustry(),
      withBookings: envOn('SEED_SCHEDULE', true),
      skipInbox: !envOn('SEED_INBOX', true),
      skipTodos: !envOn('SEED_TODOS', true),
      skipSchedule: !envOn('SEED_SCHEDULE', true),
    });
    if (!result.ok) return { ok: false, detail: result.error };
    return { ok: true, detail: `Seeded ${installSeedIndustry()} sample data` };
  })();

  try {
    return await running;
  } finally {
    running = null;
  }
}
