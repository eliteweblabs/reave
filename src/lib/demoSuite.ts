/**
 * Demo suite URL params — ?demo=tier-1&modules=[001,004,006,009]&industry=plumbing
 *
 * Parsed on landing, stored in a cookie, and passed to seed-demo.ts on POST /api/admin/demo.
 */
import {
  catalogForChecklist,
  demoModuleById,
  parseDemoModuleIds,
  resolveDemoModuleFeatures,
  type DemoModuleCatalogEntry,
} from './demoModuleCatalog';
import type { FeatureId } from './featureCatalog';

export const DEMO_SUITE_COOKIE = 'reave_demo_suite';
export const DEMO_SUITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Default module ids when no URL/cookie — all catalog modules for full demo stack. */
export const DEFAULT_DEMO_MODULE_IDS = catalogForChecklist().map((e) => e.id);

export function buildDemoSuiteConfig(opts: {
  tier?: number;
  moduleIds: readonly string[];
  industry: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
}): DemoSuiteConfig {
  const moduleIds = opts.moduleIds.map((id) => id.padStart(3, '0'));
  const visitorName = opts.visitorName?.trim().slice(0, 120) || undefined;
  const visitorEmail = opts.visitorEmail?.trim().toLowerCase().slice(0, 254) || undefined;
  return {
    tier: opts.tier ?? 1,
    moduleIds,
    features: resolveDemoModuleFeatures(moduleIds),
    industry: opts.industry.trim().toLowerCase() || 'general',
    capturedAt: new Date().toISOString(),
    ...(visitorName ? { visitorName } : {}),
    ...(visitorEmail ? { visitorEmail } : {}),
  };
}

/** Fallback suite for demo installs before a sales URL is opened. */
export const DEFAULT_DEMO_SUITE: DemoSuiteConfig = buildDemoSuiteConfig({
  moduleIds: DEFAULT_DEMO_MODULE_IDS,
  industry: 'general',
  tier: 1,
});

export type DemoSuiteConfig = {
  /** Installation tier — 1 = full platform (only tier supported for now). */
  tier: number;
  /** Zero-padded module ids, e.g. ["001","004"]. */
  moduleIds: string[];
  /** Resolved feature ids from moduleIds. */
  features: FeatureId[];
  /** Industry slug for seed content — plumbing, general, etc. */
  industry: string;
  /** ISO timestamp when suite was captured. */
  capturedAt: string;
  /** Visitor display name from the demo loader (optional). */
  visitorName?: string;
  /** Visitor email from the demo loader (optional). */
  visitorEmail?: string;
};

export type DemoSuiteParseResult = {
  ok: true;
  suite: DemoSuiteConfig;
} | {
  ok: false;
  error: string;
};

function parseTier(raw: string | null | undefined): number {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return 1;
  const m = v.match(/tier[-_]?(\d+)/);
  if (m) return Number.parseInt(m[1]!, 10) || 1;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Parse demo suite from URL search params. */
export function parseDemoSuiteFromSearchParams(params: URLSearchParams): DemoSuiteParseResult | null {
  const demo = params.get('demo');
  const modulesRaw = params.get('modules');
  const industry = params.get('industry')?.trim().toLowerCase() || 'general';
  const visitorName =
    params.get('name')?.trim() ||
    params.get('guest')?.trim() ||
    params.get('visitorName')?.trim() ||
    '';
  const visitorEmail =
    params.get('email')?.trim().toLowerCase() ||
    params.get('visitorEmail')?.trim().toLowerCase() ||
    '';

  if (!demo && !modulesRaw && !params.get('industry')) return null;
  if (!demo && !modulesRaw) {
    return { ok: false, error: 'Missing demo or modules param' };
  }

  const moduleIds = parseDemoModuleIds(modulesRaw ?? '');
  if (!moduleIds.length) {
    return { ok: false, error: 'modules param must list at least one id, e.g. modules=[001,004]' };
  }

  const unknown = moduleIds.filter((id) => !demoModuleById(id));
  if (unknown.length) {
    return { ok: false, error: `Unknown module id(s): ${unknown.join(', ')}` };
  }

  return {
    ok: true,
    suite: buildDemoSuiteConfig({
      tier: parseTier(demo),
      moduleIds,
      industry,
      visitorName: visitorName || null,
      visitorEmail: visitorEmail || null,
    }),
  };
}

export function serializeDemoSuite(suite: DemoSuiteConfig): string {
  return JSON.stringify(suite);
}

export function parseDemoSuiteCookie(raw: string | null | undefined): DemoSuiteConfig | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as DemoSuiteConfig;
    if (!Array.isArray(parsed.moduleIds) || !parsed.industry) return null;
    parsed.features = resolveDemoModuleFeatures(parsed.moduleIds);
    if (typeof parsed.visitorName === 'string') {
      parsed.visitorName = parsed.visitorName.trim().slice(0, 120) || undefined;
    } else {
      delete parsed.visitorName;
    }
    if (typeof parsed.visitorEmail === 'string') {
      parsed.visitorEmail = parsed.visitorEmail.trim().toLowerCase().slice(0, 254) || undefined;
    } else {
      delete parsed.visitorEmail;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function demoSuiteSummary(suite: DemoSuiteConfig): string {
  const labels = suite.moduleIds
    .map((id) => demoModuleById(id)?.label ?? id)
    .join(', ');
  const who = suite.visitorName?.trim();
  const base = `Tier ${suite.tier} · ${suite.industry} · ${labels}`;
  return who ? `${who} · ${base}` : base;
}

export function demoModuleCatalog(): DemoModuleCatalogEntry[] {
  return catalogForChecklist();
}

/** Build a demo landing URL for sales. */
export function buildDemoSuiteUrl(origin: string, opts: {
  tier?: number;
  moduleIds: string[];
  industry: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
}): string {
  const url = new URL('/', origin);
  url.searchParams.set('demo', `tier-${opts.tier ?? 1}`);
  url.searchParams.set('modules', `[${opts.moduleIds.join(',')}]`);
  url.searchParams.set('industry', opts.industry);
  const name = opts.visitorName?.trim();
  const email = opts.visitorEmail?.trim().toLowerCase();
  if (name) url.searchParams.set('name', name);
  if (email) url.searchParams.set('email', email);
  return url.toString();
}
