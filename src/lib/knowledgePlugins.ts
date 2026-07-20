/**
 * Plugin/feature gates for bundled knowledge slugs.
 *
 * - Core slugs: always listed when the file exists (generic app mechanics).
 * - Plugin slugs: only when the matching install feature is enabled AND any
 *   service env checks pass (same idea as agent tool modules).
 * - Custom / unlisted slugs: always visible (business-specific DB or markdown).
 */
import type { FeatureId } from './features';
import { hasFeature } from './features';
import { isCraterConfigured } from './craterClient';
import { isChangeDetectionConfigured } from './changedetectionClient';
import { isBookingConfigured } from './bookingClient';
import { isUptimeRobotConfigured } from './uptimerobotClient';

export type KnowledgePluginGate =
  | { kind: 'core' }
  | { kind: 'feature'; feature: FeatureId; configured?: () => boolean };

/** Bundled playbooks tied to optional modules — omit when plugin not employed. */
export const KNOWLEDGE_PLUGIN_GATES: Record<string, KnowledgePluginGate> = {
  'crater-billing': { kind: 'feature', feature: 'billing', configured: isCraterConfigured },
  carddav: { kind: 'feature', feature: 'carddav' },
  'client-portal': { kind: 'feature', feature: 'client_portal' },
  'code-dev-tools': { kind: 'feature', feature: 'code_dev' },
  'github-dev-tools': { kind: 'feature', feature: 'dev_infra' },
  'kinsta-wordpress': { kind: 'feature', feature: 'dev_infra' },
  'railway-deploy-webhook': { kind: 'feature', feature: 'dev_infra' },
  newsletter: { kind: 'feature', feature: 'email_marketing' },
  'uptime-monitoring': { kind: 'feature', feature: 'uptime_monitoring', configured: isUptimeRobotConfigured },
  // Site audits / monitoring playbooks (no dedicated slug today for ChangeDetection)
  // Scheduling: add slug here when a cal.com playbook ships
};

/** Core bundled docs — generic product mechanics, always available. */
export const CORE_KNOWLEDGE_SLUGS: ReadonlySet<string> = new Set([
  'contact-api-reference',
  'contact-import',
  'email-rules',
  'siri-examples',
  'siri-quick-reference',
  'siri-shortcuts',
]);

export function isKnowledgeSlugAvailable(slug: string): boolean {
  const gate = KNOWLEDGE_PLUGIN_GATES[slug];
  if (!gate) {
    if (CORE_KNOWLEDGE_SLUGS.has(slug)) return true;
    // Business/custom docs (DB or unlisted bundled) — always show
    return true;
  }
  if (gate.kind === 'core') return true;
  if (!hasFeature(gate.feature)) return false;
  if (gate.configured && !gate.configured()) return false;
  return true;
}
