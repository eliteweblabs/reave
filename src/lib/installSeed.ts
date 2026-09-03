/**
 * First-boot sample data for a new install (deploy-wizard SEED_ON_BOOT).
 * Runs inbox / todos / schedule seeds without turning on sales DEMO_MODE.
 */
import { getDemoSetupStatus, isDemoMode } from './demoMode';
import { runDemoSeed } from './demoSeedRunner';
import { ensureInstallBootstrap } from './installBootstrap';
import { isEmailApiConfigured, ensureSeededInboxClearedOnLiveEmail } from './seededInboxCleanup';
import { seedIndustryKnowledge } from './seedIndustryKnowledge';
import { serverEnv } from './serverEnv';

export function shouldSeedOnBoot(): boolean {
  const flag = serverEnv('SEED_ON_BOOT')?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function installSeedIndustry(): string {
  return serverEnv('DEMO_INDUSTRY')?.trim() || 'general';
}

function envOn(name: string, fallback = false): boolean {
  const raw = serverEnv(name)?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function wantsSampleDataSeed(): boolean {
  if (!shouldSeedOnBoot()) return false;
  return (
    envOn('SEED_INBOX') ||
    envOn('SEED_TODOS') ||
    envOn('SEED_SCHEDULE') ||
    envOn('SEED_KNOWLEDGE')
  );
}

let running: Promise<{ ok: boolean; detail: string }> | null = null;

export async function ensureInstallSeed(): Promise<{ ok: boolean; detail: string; skipped?: boolean }> {
  await ensureInstallBootstrap().catch((e) => console.warn('[install-bootstrap] failed', e));

  if (!shouldSeedOnBoot()) return { ok: true, skipped: true, detail: 'SEED_ON_BOOT is off' };
  if (!wantsSampleDataSeed()) {
    return { ok: true, skipped: true, detail: 'Sample seed toggles are off' };
  }
  if (running) return running;

  running = (async () => {
    const industry = installSeedIndustry();
    let knowledgeDetail = 'Knowledge seed skipped';
    if (envOn('SEED_KNOWLEDGE')) {
      const knowledge = await seedIndustryKnowledge(industry);
      knowledgeDetail = knowledge.detail;
    }

    const status = await getDemoSetupStatus();
    if (status.seeded) {
      await ensureSeededInboxClearedOnLiveEmail().catch((e) =>
        console.warn('[install-seed] seeded inbox cleanup failed', e),
      );
      return {
        ok: true,
        skipped: true,
        detail: `Sample data already present. ${knowledgeDetail}`,
      };
    }
    if (!status.checks.find((c) => c.id === 'database')?.ok) {
      return { ok: false, detail: 'DATABASE_URL is not ready for sample data' };
    }

    const skipInbox = !envOn('SEED_INBOX') || (isEmailApiConfigured() && !isDemoMode());
    const result = runDemoSeed({
      industry,
      withBookings: envOn('SEED_SCHEDULE'),
      skipInbox,
      skipTodos: !envOn('SEED_TODOS'),
      skipSchedule: !envOn('SEED_SCHEDULE'),
    });
    if (!result.ok) return { ok: false, detail: result.error };
    await ensureSeededInboxClearedOnLiveEmail().catch((e) =>
      console.warn('[install-seed] seeded inbox cleanup failed', e),
    );
    return {
      ok: true,
      detail: `Seeded ${industry} sample data. ${knowledgeDetail}`,
    };
  })();

  try {
    return await running;
  } finally {
    running = null;
  }
}
