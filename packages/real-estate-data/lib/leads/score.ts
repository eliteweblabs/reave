import { buildComplianceTimeline } from '../compliance/rules.js';
import type { ComplianceItem } from '../compliance/types.js';
import { buildHazardProfile } from '../hazards/profile.js';
import type { HazardProfile } from '../hazards/profile.js';
import type { PropertyRecord } from '../providers/types.js';
import { TRADE_BY_SLUG, type TradeSlug } from '../trades.js';
import type { ServiceAreaConfig } from '../violations/places.js';
import { lookupViolations, type ViolationLookupOptions } from '../violations/index.js';

export type LiabilityRadarReport = {
  property: PropertyRecord;
  compliance: ReturnType<typeof buildComplianceTimeline>;
  hazards: HazardProfile;
  violations: Awaited<ReturnType<typeof lookupViolations>>;
  tradeMatches: Array<{ trade: TradeSlug; reasons: string[]; score: number }>;
  summary: string;
};

export type LeadScore = {
  score: number;
  reasons: string[];
  matchedTrades: TradeSlug[];
  topComplianceItems: ComplianceItem[];
};

function complianceMatchesTrade(item: ComplianceItem, trade: TradeSlug): boolean {
  const def = TRADE_BY_SLUG.get(trade);
  if (!def) return false;
  return def.complianceRuleIds.includes(item.id) || item.contractorTypes.includes(trade);
}

export function scoreLeadForTrades(
  property: Partial<PropertyRecord>,
  trades: TradeSlug[],
  opts?: { hasSeptic?: boolean; isRental?: boolean; recentStorm?: boolean },
): LeadScore {
  const timeline = buildComplianceTimeline({
    yearBuilt: property.yearBuilt ?? null,
    state: property.state ?? null,
    hasSeptic: opts?.hasSeptic,
    isRental: opts?.isRental,
  });
  const hazards = buildHazardProfile(property, {
    recentStorm: opts?.recentStorm,
  });

  const reasons: string[] = [];
  let score = 0;
  const matchedTrades: TradeSlug[] = [];
  const topComplianceItems: ComplianceItem[] = [];

  const allItems = [...timeline.overdue, ...timeline.dueSoon, ...timeline.informational];

  for (const trade of trades) {
    const def = TRADE_BY_SLUG.get(trade);
    if (!def) continue;

    const tradeReasons: string[] = [];
    let tradeScore = 0;

    for (const item of allItems) {
      if (!complianceMatchesTrade(item, trade)) continue;
      if (item.status === 'overdue') {
        tradeScore += item.urgency === 'high' ? 40 : 25;
        tradeReasons.push(`Overdue: ${item.title}`);
        topComplianceItems.push(item);
      } else if (item.status === 'due_soon') {
        tradeScore += 15;
        tradeReasons.push(`Due soon: ${item.title}`);
        topComplianceItems.push(item);
      }
    }

    for (const boost of def.hazardBoosts) {
      const level = boost === 'flood' ? hazards.flood.level : boost === 'wildfire' ? hazards.wildfire.level : hazards.storm.recentEvent ? 'moderate' : 'none';
      if (level === 'high' || level === 'severe') {
        tradeScore += 30;
        tradeReasons.push(`${boost} hazard: ${level}`);
      } else if (level === 'moderate') {
        tradeScore += 15;
        tradeReasons.push(`${boost} hazard: moderate`);
      }
    }

    if (tradeScore > 0) {
      matchedTrades.push(trade);
      score = Math.max(score, tradeScore);
      reasons.push(...tradeReasons.map((r) => `[${def.label}] ${r}`));
    }
  }

  return {
    score: Math.min(100, score),
    reasons: [...new Set(reasons)].slice(0, 12),
    matchedTrades,
    topComplianceItems: topComplianceItems.slice(0, 6),
  };
}

export async function buildLiabilityRadarReport(
  property: PropertyRecord,
  trades: TradeSlug[],
  opts?: { hasSeptic?: boolean; isRental?: boolean; serviceArea?: ServiceAreaConfig },
): Promise<LiabilityRadarReport> {
  const compliance = buildComplianceTimeline({
    yearBuilt: property.yearBuilt ?? null,
    state: property.state ?? null,
    hasSeptic: opts?.hasSeptic,
    isRental: opts?.isRental,
  });
  const hazards = buildHazardProfile(property);
  const violationOpts: ViolationLookupOptions = opts?.serviceArea ? { serviceArea: opts.serviceArea } : {};
  const violations = await lookupViolations(
    {
      address: property.street ?? property.fullAddress,
      city: property.city,
      state: property.state,
      zip: property.zip,
    },
    violationOpts,
  );

  const tradeMatches = trades.map((trade) => {
    const lead = scoreLeadForTrades(property, [trade], opts);
    return { trade, reasons: lead.reasons, score: lead.score };
  }).filter((t) => t.score > 0).sort((a, b) => b.score - a.score);

  const age = compliance.propertyAgeYears;
  const overdueCount = compliance.overdue.length;
  const violCount = violations.ok ? violations.violations.filter((v) => v.status === 'open').length : 0;

  const summary = [
    property.fullAddress,
    age != null ? `Built ${property.yearBuilt} (${age} years old)` : 'Year built unknown',
    overdueCount ? `${overdueCount} overdue lifecycle item(s)` : null,
    violCount ? `${violCount} open municipal violation(s)` : null,
    hazards.flood.level !== 'none' ? `Flood risk: ${hazards.flood.level}` : null,
    hazards.wildfire.level !== 'none' ? `Wildfire context: ${hazards.wildfire.level}` : null,
  ].filter(Boolean).join(' · ');

  return { property, compliance, hazards, violations, tradeMatches, summary };
}
