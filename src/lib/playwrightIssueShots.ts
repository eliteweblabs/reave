/**
 * Pending Playwright issue screenshots for the current agent run.
 *
 * The audit tool strips PNG bytes from the model payload (token budget).
 * Shots live here until create_work / update_work files them onto the
 * project and embeds a UX Evidence section in the notes.
 */

import { getAgentContext } from './agentContext';
import {
  storeAddProjectFile,
  storeDeleteProjectFile,
  storeListProjectFiles,
  type ProjectFileSummary,
} from './projectFiles';
import { type PlaywrightIssueKind } from './playwrightIssueDetect';

export {
  formatUxEvidenceMarkdown,
  issueShotFilename,
  mergeUxEvidenceSection,
  UX_EVIDENCE_HEADING,
} from './playwrightIssueDetect';

export type PendingIssueShot = {
  id: string;
  kind: PlaywrightIssueKind;
  viewport: 'desktop' | 'mobile';
  title: string;
  detail: string;
  filename: string;
  pngBase64: string;
};

type PendingRun = {
  runId: string;
  url: string;
  createdAt: number;
  consumed: boolean;
  shots: PendingIssueShot[];
};

const RUN_TTL_MS = 30 * 60 * 1000;
const runs = new Map<string, PendingRun>();

function pruneRuns(now = Date.now()): void {
  for (const [id, run] of runs) {
    if (run.consumed || now - run.createdAt > RUN_TTL_MS) runs.delete(id);
  }
}

export function stashPlaywrightIssueShots(opts: {
  runId: string;
  url: string;
  shots: PendingIssueShot[];
}): void {
  pruneRuns();
  if (!opts.shots.length) return;
  runs.set(opts.runId, {
    runId: opts.runId,
    url: opts.url,
    createdAt: Date.now(),
    consumed: false,
    shots: opts.shots,
  });
  const ctx = getAgentContext();
  ctx.playwrightShotRunId = opts.runId;
}

export function peekPlaywrightIssueShotRun(runId?: string): PendingRun | null {
  pruneRuns();
  const id = runId || getAgentContext().playwrightShotRunId;
  if (!id) return null;
  const run = runs.get(id);
  if (!run || run.consumed) return null;
  return run;
}

export async function attachPlaywrightIssueShots(
  slug: string,
  runId?: string,
  opts: { uploadedBy?: string | null; sourceRef?: string | null } = {},
): Promise<Array<ProjectFileSummary & { title: string; detail: string }>> {
  const run = peekPlaywrightIssueShotRun(runId);
  if (!run?.shots.length) return [];

  const existing = await storeListProjectFiles(slug);
  const saved: Array<ProjectFileSummary & { title: string; detail: string }> = [];

  for (const shot of run.shots) {
    const prior = existing.filter((f) => f.filename === shot.filename);
    for (const file of prior) {
      await storeDeleteProjectFile(slug, file.id);
    }
    const result = await storeAddProjectFile(slug, {
      filename: shot.filename,
      mediaType: 'image/png',
      dataBase64: shot.pngBase64,
      uploadedBy: opts.uploadedBy ?? null,
      source: 'agent',
      sourceRef: opts.sourceRef ?? run.runId,
    });
    if (result.ok) {
      saved.push({ ...result.file, title: shot.title, detail: shot.detail });
    }
  }

  run.consumed = true;
  const ctx = getAgentContext();
  if (ctx.playwrightShotRunId === run.runId) delete ctx.playwrightShotRunId;
  runs.delete(run.runId);

  return saved;
}
