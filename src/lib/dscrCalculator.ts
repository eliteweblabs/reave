/**
 * Lender-grade residential DSCR (Debt Service Coverage Ratio).
 *
 * Same pricing matrix, LTV buckets, cash-out / 5–8 unit add-ons, and
 * beginning-of-period P&I used by the public DSCR calculators residential
 * lenders share with investors. Gross rent ÷ PITIA (P+I+taxes+insurance+HOA).
 */

export const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
] as const;

export type UsState = (typeof US_STATES)[number];

export const LTV_BUCKETS = [50, 55, 60, 65, 70, 75, 80] as const;

export const PRICING_MATRIX = [
  { fico: 760, rates: [6.25, 6.25, 6.25, 6.5, 6.625, 6.999, 7.5] },
  { fico: 740, rates: [6.25, 6.25, 6.375, 6.5, 6.625, 6.999, 7.625] },
  { fico: 720, rates: [6.375, 6.375, 6.625, 6.75, 6.75, 7.375, 7.999] },
  { fico: 700, rates: [6.5, 6.875, 6.875, 6.999, 7.25, 7.625, 8.375] },
  { fico: 680, rates: [6.875, 6.875, 6.999, 7.25, 7.5, 7.75, 8.625] },
  { fico: 660, rates: [7.125, 7.375, 7.5, 7.625, 7.75, 8.375, 9.375] },
  { fico: 640, rates: [7.625, 7.75, 7.875, 8.25, 8.5, 9.125, 9.375] },
] as const;

export const LOAN_PURPOSES = ['Purchase', 'RateAndTerm', 'Cashout'] as const;
export type LoanPurpose = (typeof LOAN_PURPOSES)[number];

export const UNIT_BANDS = ['1-4', '5-8'] as const;
export type UnitBand = (typeof UNIT_BANDS)[number];

export const MIN_FICO = 660;
export const MAX_FICO = 850;
export const MAX_LTV = 80;
export const LOAN_TERM_MONTHS = 360;

export type DscrInput = {
  state?: string;
  fico: number;
  units: UnitBand;
  purpose: LoanPurpose;
  propertyValue: number;
  loanAmount: number;
  monthlyRent: number;
  monthlyInsurance: number;
  monthlyTaxes: number;
  monthlyHoa?: number;
};

export type DscrResult = {
  passed: boolean;
  errors: string[];
  warnings: string[];
  state: string | null;
  fico: number;
  units: UnitBand;
  purpose: LoanPurpose;
  propertyValue: number;
  loanAmount: number;
  monthlyRent: number;
  monthlyInsurance: number;
  monthlyTaxes: number;
  monthlyHoa: number;
  ltv: number | null;
  equityPct: number | null;
  rate: number | null;
  principalAndInterest: number | null;
  piti: number | null;
  dscr: number | null;
  noRatioEligible: boolean;
};

export const DEFAULT_DSCR_INPUT: DscrInput = {
  state: 'California',
  fico: 800,
  units: '1-4',
  purpose: 'RateAndTerm',
  propertyValue: 1_000_000,
  loanAmount: 450_000,
  monthlyRent: 5_000,
  monthlyInsurance: 250,
  monthlyTaxes: 1_200,
  monthlyHoa: 0,
};

export function isUsState(value: string): value is UsState {
  return (US_STATES as readonly string[]).includes(value);
}

export function isLoanPurpose(value: string): value is LoanPurpose {
  return (LOAN_PURPOSES as readonly string[]).includes(value);
}

export function isUnitBand(value: string): value is UnitBand {
  return (UNIT_BANDS as readonly string[]).includes(value);
}

export function purposeLabel(purpose: LoanPurpose): string {
  if (purpose === 'RateAndTerm') return 'Rate & Term';
  if (purpose === 'Cashout') return 'Cash-out';
  return 'Purchase';
}

export function unitsLabel(units: UnitBand): string {
  return units === '5-8' ? '5-8 units' : '1-4 units';
}

/** Annual % → monthly beginning-of-period principal & interest. */
export function monthlyPrincipalAndInterest(
  annualRatePct: number,
  loanAmount: number,
  nper = LOAN_TERM_MONTHS,
): number {
  if (!(loanAmount > 0) || !Number.isFinite(loanAmount)) return 0;
  const rate = annualRatePct / 100 / 12;
  if (rate === 0) return loanAmount / nper;
  const pvif = (1 + rate) ** nper;
  return (rate * loanAmount * pvif) / (pvif - 1) / (1 + rate);
}

export function lookupBaseRate(fico: number, ltv: number): number | null {
  if (!(fico >= 640) || !(ltv > 0)) return null;
  const row = PRICING_MATRIX.find((r) => fico >= r.fico) ?? PRICING_MATRIX[PRICING_MATRIX.length - 1]!;
  const col = LTV_BUCKETS.findIndex((bucket) => ltv <= bucket);
  if (col < 0) return null;
  return row.rates[col] ?? null;
}

function money(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(String(n ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(v) ? v : NaN;
}

function int(n: unknown): number {
  const v = typeof n === 'number' ? n : Number.parseInt(String(n ?? ''), 10);
  return Number.isFinite(v) ? v : NaN;
}

export function parseDscrInput(raw: Record<string, unknown>): DscrInput | { error: string } {
  const stateRaw = String(raw.state ?? raw.propertyState ?? '').trim();
  const state = stateRaw && isUsState(stateRaw) ? stateRaw : stateRaw || undefined;
  const unitsRaw = String(raw.units ?? raw.numUnits ?? '1-4').trim();
  const units = unitsRaw === '5-8' ? '5-8' : unitsRaw === '1-4' ? '1-4' : '';
  const purposeRaw = String(raw.purpose ?? raw.purposeOfLoan ?? 'RateAndTerm').replace(/\s+/g, '');
  const purpose =
    purposeRaw === 'Cashout' || purposeRaw === 'Cash-out' || purposeRaw === 'CashOut'
      ? 'Cashout'
      : purposeRaw === 'Purchase'
        ? 'Purchase'
        : purposeRaw === 'RateAndTerm' || purposeRaw === 'Rate&Term' || purposeRaw === 'RateTerm'
          ? 'RateAndTerm'
          : '';

  if (!isUnitBand(units)) return { error: 'units must be 1-4 or 5-8' };
  if (!isLoanPurpose(purpose)) return { error: 'purpose must be Purchase, RateAndTerm, or Cashout' };

  const input: DscrInput = {
    state,
    fico: int(raw.fico ?? raw.ficoScore),
    units,
    purpose,
    propertyValue: money(raw.propertyValue ?? raw.valueSubjectProperty),
    loanAmount: money(raw.loanAmount ?? raw.proposedLoanAmt),
    monthlyRent: money(raw.monthlyRent ?? raw.rent),
    monthlyInsurance: money(raw.monthlyInsurance ?? raw.insurance),
    monthlyTaxes: money(raw.monthlyTaxes ?? raw.taxes),
    monthlyHoa: money(raw.monthlyHoa ?? raw.hoa ?? 0) || 0,
  };

  if (!(input.fico >= 300) || input.fico > MAX_FICO) {
    return { error: `fico must be between 300 and ${MAX_FICO}` };
  }
  if (!(input.propertyValue > 0)) return { error: 'propertyValue must be greater than 0' };
  if (!(input.loanAmount > 0)) return { error: 'loanAmount must be greater than 0' };
  if (!(input.monthlyRent >= 0)) return { error: 'monthlyRent must be 0 or greater' };
  if (!(input.monthlyInsurance >= 0)) return { error: 'monthlyInsurance must be 0 or greater' };
  if (!(input.monthlyTaxes >= 0)) return { error: 'monthlyTaxes must be 0 or greater' };
  if (!(input.monthlyHoa! >= 0)) return { error: 'monthlyHoa must be 0 or greater' };
  return input;
}

export function calculateDscr(input: DscrInput): DscrResult {
  const hoa = input.monthlyHoa ?? 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  const state = input.state && isUsState(input.state) ? input.state : input.state?.trim() || null;

  const ltv =
    input.propertyValue > 0 ? (input.loanAmount / input.propertyValue) * 100 : null;
  const equityPct = ltv != null ? 100 - ltv : null;

  if (input.fico < MIN_FICO) {
    errors.push(`FICO score must be at least ${MIN_FICO}`);
  }
  if (ltv != null && ltv > MAX_LTV) {
    errors.push(`The maximum LTV ratio is ${MAX_LTV}%`);
  }

  let rate: number | null = null;
  if (ltv != null && ltv > 0 && input.fico >= 640 && ltv <= MAX_LTV) {
    const base = lookupBaseRate(input.fico, ltv);
    if (base == null) {
      if (errors.length === 0) errors.push('No pricing available for this FICO/LTV combination');
    } else {
      rate = base;
      if (input.units === '5-8') rate += 0.25;
      if (input.purpose === 'Cashout') rate += 0.25;
    }
  } else if (ltv != null && ltv > 0 && errors.length === 0 && rate == null) {
    errors.push('No pricing available for this FICO/LTV combination');
  }

  let principalAndInterest: number | null = null;
  let piti: number | null = null;
  let dscr: number | null = null;

  if (rate != null) {
    principalAndInterest = monthlyPrincipalAndInterest(rate, input.loanAmount);
    piti = principalAndInterest + input.monthlyInsurance + input.monthlyTaxes + hoa;
    dscr = piti > 0 ? input.monthlyRent / piti : 0;

    const isCashOut = input.purpose === 'Cashout';
    const minFico = isCashOut ? 680 : 700;
    const maxLtvWithDscr = isCashOut ? 70 : 75;
    const under1 = dscr < 1;
    if (under1 && input.fico < minFico) {
      errors.push(`When FICO Score is less than ${minFico}, the minimum acceptable DSCR is 1.00`);
    } else if (under1 && ltv != null && ltv > maxLtvWithDscr) {
      errors.push(`When LTV is greater than ${maxLtvWithDscr}%, the minimum acceptable DSCR is 1.00`);
    }
  }

  const noRatioEligible = equityPct != null && equityPct >= 25;
  if (errors.length && noRatioEligible) {
    warnings.push('25%+ equity may qualify for a no-ratio DSCR product when rent does not cover PITI.');
  }

  return {
    passed: errors.length === 0 && dscr != null,
    errors,
    warnings,
    state,
    fico: input.fico,
    units: input.units,
    purpose: input.purpose,
    propertyValue: input.propertyValue,
    loanAmount: input.loanAmount,
    monthlyRent: input.monthlyRent,
    monthlyInsurance: input.monthlyInsurance,
    monthlyTaxes: input.monthlyTaxes,
    monthlyHoa: hoa,
    ltv,
    equityPct,
    rate,
    principalAndInterest,
    piti,
    dscr,
    noRatioEligible,
  };
}

export function formatUsd(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUsdCents(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPct(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatRatePct(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(rate / 100);
}

export function formatDscrRatio(dscr: number | null): string {
  if (dscr == null || !Number.isFinite(dscr)) return '—';
  return dscr.toFixed(2);
}

export function serializeDscrResult(result: DscrResult) {
  return {
    passed: result.passed,
    errors: result.errors,
    warnings: result.warnings,
    state: result.state,
    fico: result.fico,
    units: result.units,
    unitsLabel: unitsLabel(result.units),
    purpose: result.purpose,
    purposeLabel: purposeLabel(result.purpose),
    propertyValue: result.propertyValue,
    loanAmount: result.loanAmount,
    monthlyRent: result.monthlyRent,
    monthlyInsurance: result.monthlyInsurance,
    monthlyTaxes: result.monthlyTaxes,
    monthlyHoa: result.monthlyHoa,
    ltv: result.ltv,
    ltvLabel: formatPct(result.ltv),
    equityPct: result.equityPct,
    rate: result.rate,
    rateLabel: formatRatePct(result.rate),
    principalAndInterest: result.principalAndInterest,
    principalAndInterestLabel: formatUsdCents(result.principalAndInterest),
    piti: result.piti,
    pitiLabel: formatUsdCents(result.piti),
    dscr: result.dscr,
    dscrLabel: formatDscrRatio(result.dscr),
    noRatioEligible: result.noRatioEligible,
  };
}
