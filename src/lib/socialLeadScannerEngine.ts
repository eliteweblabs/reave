/**
 * Agentic Social Lead Scanner — cron engine.
 *
 * Platform adapters are registered here as they ship. Until OAuth/API scopes land,
 * scans record a run note listing pending platforms — config and hits storage are live.
 */
import { getCompanyConfig } from './companyConfig';
import { hasFeature } from './features';
import { accountsFromCompany } from './social/accounts';
import type { SocialPlatformId } from './social/types';
import {
  getSocialLeadScannerConfig,
  matchSocialLeadKeyword,
  recordSocialLeadScannerRun,
  upsertSocialLeadScannerHit,
  type SocialLeadScannerConfig,
} from './socialLeadScannerStore';

export type SocialLeadScanCandidate = {
  platform: SocialPlatformId;
  externalId?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  text: string;
  url?: string | null;
};

export type SocialLeadPlatformAdapter = {
  id: SocialPlatformId;
  /** Pull recent public posts/comments/mentions for keyword matching. */
  scan: (keywords: string[], config: SocialLeadScannerConfig) => Promise<SocialLeadScanCandidate[]>;
};

const ADAPTERS = new Map<SocialPlatformId, SocialLeadPlatformAdapter>();

/** Register a live platform adapter (called from OAuth/API modules as they ship). */
export function registerSocialLeadPlatformAdapter(adapter: SocialLeadPlatformAdapter): void {
  ADAPTERS.set(adapter.id, adapter);
}

export function socialLeadScannerEnabled(): boolean {
  return hasFeature('social_lead_scanner');
}

export type SocialLeadScannerRunResult = {
  ok: boolean;
  skipped?: string;
  hitsFound?: number;
  adaptersPending?: SocialPlatformId[];
  errors?: string[];
};

export async function runSocialLeadScanner(options?: {
  force?: boolean;
  source?: 'cron' | 'admin';
}): Promise<SocialLeadScannerRunResult> {
  if (!socialLeadScannerEnabled()) {
    return { ok: false, skipped: 'social_lead_scanner not enabled' };
  }

  const config = await getSocialLeadScannerConfig();
  if (!config.enabled && !options?.force) {
    return { ok: true, skipped: 'scanner disabled in settings' };
  }
  if (!config.keywords.length) {
    await recordSocialLeadScannerRun({ note: 'Add keywords to start monitoring.' });
    return { ok: true, skipped: 'no keywords configured' };
  }

  const company = await getCompanyConfig();
  const accounts = accountsFromCompany(company);
  const configured = new Set(accounts.map((a) => a.platform));
  const targets = config.platforms.filter((p) => configured.has(p));

  const adaptersPending: SocialPlatformId[] = [];
  const errors: string[] = [];
  let hitsFound = 0;

  for (const platform of targets) {
    const adapter = ADAPTERS.get(platform);
    if (!adapter) {
      adaptersPending.push(platform);
      continue;
    }
    try {
      const candidates = await adapter.scan(config.keywords, config);
      for (const candidate of candidates) {
        const matched = matchSocialLeadKeyword(candidate.text, config.keywords);
        if (!matched) continue;
        await upsertSocialLeadScannerHit({
          platform: candidate.platform,
          externalId: candidate.externalId,
          authorName: candidate.authorName,
          authorHandle: candidate.authorHandle,
          text: candidate.text,
          url: candidate.url,
          keywordMatched: matched,
        });
        hitsFound += 1;
      }
    } catch (e) {
      errors.push(`${platform}: ${e instanceof Error ? e.message : 'scan failed'}`);
    }
  }

  const unconfigured = config.platforms.filter((p) => !configured.has(p));
  const notes: string[] = [];
  if (adaptersPending.length) {
    notes.push(
      `Platform API adapters pending for ${adaptersPending.join(', ')} — OAuth under Socials when live.`,
    );
  }
  if (unconfigured.length) {
    notes.push(`Add profile links under Socials for ${unconfigured.join(', ')}.`);
  }
  if (hitsFound) notes.push(`Found ${hitsFound} new match${hitsFound === 1 ? '' : 'es'}.`);
  if (!notes.length) notes.push('Scan complete — no new matches.');

  await recordSocialLeadScannerRun({
    error: errors.length ? errors.join('; ') : null,
    note: notes.join(' '),
  });

  return {
    ok: errors.length === 0,
    hitsFound,
    adaptersPending,
    errors: errors.length ? errors : undefined,
  };
}

export async function socialLeadScannerStatusSummary(): Promise<Record<string, unknown>> {
  const config = await getSocialLeadScannerConfig();
  return {
    enabled: config.enabled,
    keywordCount: config.keywords.length,
    platforms: config.platforms,
    autoDraft: config.autoDraft,
    lastRunAt: config.lastRunAt,
    lastRunNote: config.lastRunNote,
    lastRunError: config.lastRunError,
    adaptersLive: [...ADAPTERS.keys()],
  };
}
