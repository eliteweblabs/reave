/** Infographic / compare page content — cited industry stats + three-way positioning. */

/** Top-down flow sections on /compare (order matters). */
export const COMPARE_FLOW_STEPS = [
  { id: 'waste', label: 'Overspending' },
  { id: 'utilization', label: 'Under-utilization' },
  { id: 'spectrum', label: 'Waste spectrum' },
  { id: 'paths', label: 'Three paths' },
  { id: 'model', label: '90 / 10 model' },
  { id: 'matrix', label: 'Feature matrix' },
  { id: 'cost', label: 'Cost comparison' },
] as const;

export type CompareFlowStepId = (typeof COMPARE_FLOW_STEPS)[number]['id'];

export type SpectrumTier = {
  id: string;
  severity: 'Mild' | 'Moderate' | 'Serious' | 'Severe' | 'Critical';
  theme: string;
  headline: string;
  stat: string;
  detail: string;
  source: string;
};

export const WASTE_SPECTRUM: SpectrumTier[] = [
  {
    id: 'license-waste',
    severity: 'Mild',
    theme: 'License waste',
    headline: '1 in 3 licenses never gets used',
    stat: '25–36%',
    detail: 'Fully unused seats — shelfware. Gartner: 25–35%. Zylo 2026: 36%.',
    source: 'Gartner · Zylo 2026 SMI',
  },
  {
    id: 'underutilization',
    severity: 'Moderate',
    theme: 'Underutilization',
    headline: 'Half your seats sit mostly idle',
    stat: '46–65%',
    detail: 'Unused or underutilized (<50% of purchased seats active). Vertice: 65% combined.',
    source: 'Vertice Q2 2026',
  },
  {
    id: 'budget-bleed',
    severity: 'Serious',
    theme: 'Budget bleed',
    headline: 'A third of SaaS spend vanishes',
    stat: '34%',
    detail: 'Median waste across 500 enterprises — unused licenses, duplicates, shadow IT.',
    source: 'VendorBenchmark',
  },
  {
    id: 'app-sprawl',
    severity: 'Severe',
    theme: 'App sprawl',
    headline: '100+ apps, most unsanctioned',
    stat: '101–831',
    detail: 'Okta avg: 101 apps. Torii: 831 total, 61% Shadow IT. BetterCloud: 44% unsanctioned.',
    source: 'Okta 2025 · Torii 2026 · BetterCloud',
  },
  {
    id: 'human-cost',
    severity: 'Critical',
    theme: 'Human cost',
    headline: 'A full workweek lost to switching',
    stat: '44+ hrs/yr',
    detail: '33 app switches/day. 72% of orgs lose ≥5% of weekly hours navigating between tools.',
    source: 'Lokalise · Buddy Punch',
  },
];

export type LicenseSegment = {
  id: string;
  label: string;
  pct: number;
  tone: 'active' | 'under' | 'shelf';
};

export const LICENSE_BREAKDOWN: LicenseSegment[] = [
  { id: 'active', label: 'Actively used', pct: 35, tone: 'active' },
  { id: 'under', label: 'Underutilized (<50% seats)', pct: 51, tone: 'under' },
  { id: 'shelf', label: 'Shelfware (zero use)', pct: 14, tone: 'shelf' },
];

export type PainPoint = { label: string; value: string };

export const SAAS_PAIN: PainPoint[] = [
  { label: 'Underused licenses', value: '36% go completely unused' },
  { label: 'Not integrated', value: '4.3 duplicate subscriptions avg.' },
  { label: 'No syncing', value: '52% say data is scattered' },
  { label: 'Per-seat creep', value: '~$5,607/employee/yr on SaaS' },
  { label: 'Shadow IT', value: '44% of apps lack IT approval' },
  { label: 'Tool fatigue', value: '33 app switches per day' },
];

export const CUSTOM_PAIN: PainPoint[] = [
  { label: 'Build cost', value: '$40K–$100K typical CRM/portal' },
  { label: 'Timeline', value: '3–6 months to production' },
  { label: 'Maintenance', value: '15–25% of build cost annually' },
  { label: 'Hosting & infra', value: 'Separate line item' },
  { label: 'Service fees', value: '$100–175/hr US dev rates' },
  { label: 'Scope creep', value: 'Offshore builds often stall at 80%' },
];

export const REAVE_WINS: string[] = [
  '90% core ships on day zero — CRM, portal, inbox, AI, mobile',
  '10% bolt-ons for industry weirdness — no fork, no rewrite',
  'One login, one contact list, one AI agent across every channel',
  'White-labeled — no Powered by badge anywhere',
  'No CMS — change copy and swap images by asking the agent',
  '$250–625/mo steady state (vs. $500–2K+ SaaS stack)',
  'Built by operators who ship this for real clients',
];

export type CompareIndicator = 'weak' | 'mixed' | 'strong';

export type CompareRow = {
  dimension: string;
  saas: CompareIndicator;
  saasNote: string;
  reave: CompareIndicator;
  reaveNote: string;
  custom: CompareIndicator;
  customNote: string;
};

export const COMPARE_MATRIX: CompareRow[] = [
  {
    dimension: 'Time to go live',
    saas: 'strong',
    saasNote: 'Same day signup',
    reave: 'strong',
    reaveNote: 'Day one: full OS',
    custom: 'weak',
    customNote: '3–6+ months',
  },
  {
    dimension: 'Upfront cost',
    saas: 'strong',
    saasNote: '$0–500/mo',
    reave: 'strong',
    reaveNote: '$2K–5K install',
    custom: 'weak',
    customNote: '$40K–100K+',
  },
  {
    dimension: 'Monthly steady state',
    saas: 'mixed',
    saasNote: '$500–2K+ stack',
    reave: 'strong',
    reaveNote: '$250–625/mo',
    custom: 'strong',
    customNote: '$750–2K maint.',
  },
  {
    dimension: 'Everything integrated',
    saas: 'weak',
    saasNote: 'Zapier duct tape',
    reave: 'strong',
    reaveNote: 'One contact list',
    custom: 'strong',
    customNote: 'Built to spec',
  },
  {
    dimension: 'Data syncs everywhere',
    saas: 'weak',
    saasNote: 'Manual export/import',
    reave: 'strong',
    reaveNote: 'CRM → portal → billing',
    custom: 'strong',
    customNote: 'If you scoped it',
  },
  {
    dimension: 'License utilization',
    saas: 'weak',
    saasNote: '36% unused avg.',
    reave: 'strong',
    reaveNote: 'One platform',
    custom: 'strong',
    customNote: 'You own it all',
  },
  {
    dimension: 'White-labeled',
    saas: 'mixed',
    saasNote: 'Their logo on yours',
    reave: 'strong',
    reaveNote: 'Your brand only',
    custom: 'strong',
    customNote: 'Fully bespoke',
  },
  {
    dimension: 'Website content updates',
    saas: 'mixed',
    saasNote: 'CMS login per tool',
    reave: 'strong',
    reaveNote: 'Ask the agent',
    custom: 'weak',
    customNote: 'Ticket to your dev',
  },
  {
    dimension: 'AI knows your business',
    saas: 'weak',
    saasNote: 'Generic chatbot',
    reave: 'strong',
    reaveNote: 'Agent + playbooks',
    custom: 'mixed',
    customNote: 'Custom if scoped',
  },
  {
    dimension: 'Industry-specific flows',
    saas: 'weak',
    saasNote: 'Force-fit templates',
    reave: 'strong',
    reaveNote: '10% bolt-ons',
    custom: 'strong',
    customNote: '100% custom',
  },
  {
    dimension: 'Maintenance burden',
    saas: 'strong',
    saasNote: 'Vendor handles it',
    reave: 'strong',
    reaveNote: 'Managed install',
    custom: 'weak',
    customNote: '15–25%/yr of build',
  },
  {
    dimension: 'Vendor lock-in',
    saas: 'weak',
    saasNote: '12+ subscriptions',
    reave: 'mixed',
    reaveNote: 'Your install',
    custom: 'strong',
    customNote: 'You own the code',
  },
  {
    dimension: 'Shadow IT sprawl',
    saas: 'weak',
    saasNote: '44% unsanctioned',
    reave: 'strong',
    reaveNote: 'One governed OS',
    custom: 'strong',
    customNote: 'One system',
  },
];

export type CostScenario = {
  label: string;
  year1: string;
  year3: string;
  tone: 'saas' | 'reave' | 'custom';
  note: string;
};

export const COST_SCENARIOS: CostScenario[] = [
  {
    label: 'Box-stock SaaS stack',
    year1: '$18K–24K',
    year3: '$54K–72K',
    tone: 'saas',
    note: '12–24 mo × $1.5–2K/mo, plus ~36% waste on licenses',
  },
  {
    label: 'reΛVe.app Operations tier',
    year1: '~$14K',
    year3: '~$19K',
    tone: 'reave',
    note: '$3K install ramp + $375/mo steady state',
  },
  {
    label: 'Bespoke CRM + portal',
    year1: '~$90K',
    year3: '~$120K',
    tone: 'custom',
    note: '$75K build + ~$15K/yr maintenance',
  },
];

export const PROBLEM_HEADLINES = [
  "You're paying for 305 apps. Using half of them.",
  '36% of your licenses are shelfware.',
  '44% of your software runs outside IT.',
  'Your team switches apps 33 times before lunch.',
  'AI added 27 new apps — and zero governance.',
];

export const SOLUTION_HEADLINES = [
  'Not a blank canvas. Not a $100K build. A Business OS.',
  '90% ships day one. 10% makes it yours.',
  'Replace the stack. Keep the bespoke.',
  'One login. One AI. One portal. Your brand.',
  'Take your time back.',
];

export const MONEY_STATS = [
  { label: 'Avg. annual waste per enterprise', value: '$19.8M', source: 'Zylo 2026 SMI' },
  { label: 'Implied global license waste', value: '$117B', source: 'Axis Intelligence' },
  { label: 'Efficiency score', value: '$0.64 per $1 spent', source: 'Zylo / Axis' },
];

export const COMPARE_SOURCES = [
  'Zylo 2026 SaaS Management Index',
  'Vertice Q2 2026 ($75B+ processed spend)',
  'Gartner SaaS management guidance',
  'Okta Businesses at Work 2025',
  'BetterCloud 2026 State of SaaS (525 IT/security pros)',
  'Torii 2026 SaaS Benchmark',
  'GoodFirms 2026 Custom Software Cost Survey',
  'VendorBenchmark SaaS Sprawl (500 enterprises)',
  'Lokalise tool fatigue survey (1,000 knowledge workers)',
];

/** Radar chart axes — subset of the feature matrix. */
export const COMPARE_RADAR_DIMENSIONS = [
  'Time to go live',
  'Everything integrated',
  'Data syncs everywhere',
  'License utilization',
  'AI knows your business',
  'Industry-specific flows',
  'Maintenance burden',
  'Shadow IT sprawl',
] as const;

export function indicatorScore(ind: CompareIndicator): number {
  if (ind === 'strong') return 3;
  if (ind === 'mixed') return 2;
  return 1;
}

/** Quarterly cumulative spend ($K) for TCO line chart — illustrative model. */
export const TCO_CUMULATIVE_K = {
  labels: ['Q1 Y1', 'Q2', 'Q3', 'Q4', 'Q1 Y2', 'Q2', 'Q3', 'Q4', 'Q1 Y3', 'Q2', 'Q3', 'Q4'],
  series: [
    {
      id: 'saas',
      label: 'Box SaaS',
      color: '#737373',
      values: [5.3, 10.5, 15.8, 21, 26.3, 31.5, 36.8, 42, 47.3, 52.5, 57.8, 63],
    },
    {
      id: 'reave',
      label: 'reΛVe.app',
      color: '#171717',
      values: [4.1, 5.3, 6.4, 7.5, 8.6, 9.8, 10.9, 12, 13.1, 14.3, 15.4, 19],
    },
    {
      id: 'custom',
      label: 'Custom dev',
      color: '#a3a3a3',
      values: [37.5, 75, 78.8, 82.5, 86.3, 90, 93.8, 97.5, 101.3, 105, 108.8, 120],
    },
  ],
} as const;

/** Radial bar magnitudes for waste spectrum (relative severity). */
export const SPECTRUM_RADIAL = WASTE_SPECTRUM.map((tier, i) => ({
  id: tier.id,
  label: tier.theme,
  value: 20 + i * 18,
  color: ['#e5e5e5', '#a3a3a3', '#737373', '#525252', '#171717'][i] ?? '#171717',
  stat: tier.stat,
}));
