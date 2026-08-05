/**
 * In-memory registry of Siri-triggered audits currently running.
 * Powers Work tab "auditing…" indicators without creating a chat thread.
 */

export type SiriAuditTier = 'quick' | 'full';

export type SiriAuditRun = {
  slug: string;
  tier: SiriAuditTier;
  label: string;
  userId: string;
  startedAt: number;
};

const activeRuns = new Map<string, SiriAuditRun>();

export function siriAuditThreadId(slug: string): string {
  return `siri-audit:${slug}`;
}

export function registerSiriAuditRun(run: SiriAuditRun): void {
  activeRuns.set(run.slug, run);
}

export function clearSiriAuditRun(slug: string): void {
  activeRuns.delete(slug);
}

export function getSiriAuditRun(slug: string): SiriAuditRun | null {
  return activeRuns.get(slug) ?? null;
}

export function listSiriAuditRuns(userId?: string): SiriAuditRun[] {
  const runs = [...activeRuns.values()];
  if (!userId) return runs;
  return runs.filter((run) => run.userId === userId);
}
