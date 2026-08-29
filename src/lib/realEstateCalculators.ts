/**
 * Industry-standard residential / investor calculators.
 * Deal metrics use NOI (not gross rent) except GRM and the 1% rule.
 * Lender DSCR stays in dscrCalculator.ts — that one is rent ÷ PITIA.
 */
import { monthlyPrincipalAndInterest } from './dscrCalculator.ts';

export { monthlyPrincipalAndInterest };

function n(value: unknown): number {
  const v = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,%]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

export function money(value: unknown): number {
  return n(value);
}

export type DealInput = {
  purchasePrice: number;
  loanAmount: number;
  ratePct: number;
  termYears: number;
  monthlyRent: number;
  vacancyPct: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyOtherOpex: number;
  closingCosts: number;
  rehabCosts: number;
};

export type DealResult = {
  annualGrossRent: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  noi: number;
  annualDebtService: number;
  monthlyPi: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  capRatePct: number | null;
  cashOnCashPct: number | null;
  grm: number | null;
  onePercentPct: number | null;
  investorDscr: number | null;
  breakEvenOccupancyPct: number | null;
  cashInvested: number;
};

export const DEFAULT_DEAL: DealInput = {
  purchasePrice: 650_000,
  loanAmount: 520_000,
  ratePct: 6.75,
  termYears: 30,
  monthlyRent: 3_800,
  vacancyPct: 5,
  monthlyTaxes: 550,
  monthlyInsurance: 150,
  monthlyHoa: 0,
  monthlyOtherOpex: 400,
  closingCosts: 12_000,
  rehabCosts: 0,
};

export function analyzeDeal(input: DealInput): DealResult {
  const annualGrossRent = input.monthlyRent * 12;
  const vacancy = Math.min(Math.max(input.vacancyPct, 0), 100) / 100;
  const effectiveGrossIncome = annualGrossRent * (1 - vacancy);
  const operatingExpenses =
    (input.monthlyTaxes + input.monthlyInsurance + input.monthlyHoa + input.monthlyOtherOpex) * 12;
  const noi = effectiveGrossIncome - operatingExpenses;
  const monthlyPi = monthlyPrincipalAndInterest(input.ratePct, input.loanAmount, input.termYears * 12);
  const annualDebtService = monthlyPi * 12;
  const annualCashFlow = noi - annualDebtService;
  const downPayment = Math.max(input.purchasePrice - input.loanAmount, 0);
  const cashInvested = downPayment + input.closingCosts + input.rehabCosts;
  const capRatePct = input.purchasePrice > 0 ? (noi / input.purchasePrice) * 100 : null;
  const cashOnCashPct = cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : null;
  const grm = annualGrossRent > 0 ? input.purchasePrice / annualGrossRent : null;
  const onePercentPct = input.purchasePrice > 0 ? (input.monthlyRent / input.purchasePrice) * 100 : null;
  const investorDscr = annualDebtService > 0 ? noi / annualDebtService : null;
  const potentialGross = annualGrossRent;
  const breakEvenOccupancyPct =
    potentialGross > 0 ? ((operatingExpenses + annualDebtService) / potentialGross) * 100 : null;

  return {
    annualGrossRent,
    effectiveGrossIncome,
    operatingExpenses,
    noi,
    annualDebtService,
    monthlyPi,
    monthlyCashFlow: annualCashFlow / 12,
    annualCashFlow,
    capRatePct,
    cashOnCashPct,
    grm,
    onePercentPct,
    investorDscr,
    breakEvenOccupancyPct,
    cashInvested,
  };
}

export type MortgageInput = {
  loanAmount: number;
  ratePct: number;
  termYears: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  monthlyHoa: number;
};

export type MortgageResult = {
  monthlyPi: number;
  monthlyPiti: number;
  totalInterest: number;
  totalPaid: number;
  firstYearPrincipal: number;
  firstYearInterest: number;
};

export function calculateMortgage(input: MortgageInput): MortgageResult {
  const nper = Math.max(input.termYears, 0) * 12;
  const monthlyPi = monthlyPrincipalAndInterest(input.ratePct, input.loanAmount, nper || 360);
  const monthlyPiti = monthlyPi + input.monthlyTaxes + input.monthlyInsurance + input.monthlyHoa;
  const totalPaid = monthlyPi * nper;
  const totalInterest = Math.max(totalPaid - input.loanAmount, 0);
  let balance = input.loanAmount;
  const monthlyRate = input.ratePct / 100 / 12;
  let firstYearPrincipal = 0;
  let firstYearInterest = 0;
  for (let i = 0; i < Math.min(12, nper); i++) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    const principal = monthlyPi - interest;
    firstYearInterest += interest;
    firstYearPrincipal += principal;
    balance = Math.max(balance - principal, 0);
  }
  return { monthlyPi, monthlyPiti, totalInterest, totalPaid, firstYearPrincipal, firstYearInterest };
}

export type AffordabilityInput = {
  monthlyIncome: number;
  dtiPct: number;
  monthlyDebts: number;
  ratePct: number;
  termYears: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  downPayment: number;
};

export type AffordabilityResult = {
  maxPiti: number;
  maxPi: number;
  maxLoan: number;
  maxPrice: number;
};

export function calculateAffordability(input: AffordabilityInput): AffordabilityResult {
  const maxPiti = Math.max(input.monthlyIncome * (input.dtiPct / 100) - input.monthlyDebts, 0);
  const maxPi = Math.max(maxPiti - input.monthlyTaxes - input.monthlyInsurance, 0);
  const maxLoan = loanFromPayment(maxPi, input.ratePct, input.termYears * 12);
  return {
    maxPiti,
    maxPi,
    maxLoan,
    maxPrice: maxLoan + input.downPayment,
  };
}

/** Inverse of beginning-of-period P&I used by monthlyPrincipalAndInterest. */
export function loanFromPayment(monthlyPi: number, annualRatePct: number, nper: number): number {
  if (!(monthlyPi > 0) || !(nper > 0)) return 0;
  const rate = annualRatePct / 100 / 12;
  if (rate === 0) return monthlyPi * nper;
  const pvif = (1 + rate) ** nper;
  return (monthlyPi * (1 + rate) * (pvif - 1)) / (rate * pvif);
}

export type RefinanceInput = {
  currentBalance: number;
  currentRatePct: number;
  currentTermYears: number;
  newRatePct: number;
  newTermYears: number;
  closingCosts: number;
};

export type RefinanceResult = {
  currentPi: number;
  newPi: number;
  monthlySavings: number;
  breakEvenMonths: number | null;
};

export function calculateRefinance(input: RefinanceInput): RefinanceResult {
  const currentPi = monthlyPrincipalAndInterest(
    input.currentRatePct,
    input.currentBalance,
    input.currentTermYears * 12,
  );
  const newPi = monthlyPrincipalAndInterest(input.newRatePct, input.currentBalance, input.newTermYears * 12);
  const monthlySavings = currentPi - newPi;
  const breakEvenMonths =
    monthlySavings > 0 ? input.closingCosts / monthlySavings : monthlySavings < 0 ? null : 0;
  return { currentPi, newPi, monthlySavings, breakEvenMonths };
}

export type RentVsBuyInput = {
  homePrice: number;
  downPayment: number;
  ratePct: number;
  termYears: number;
  monthlyTaxes: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyRent: number;
  years: number;
  appreciationPct: number;
  rentGrowthPct: number;
  investmentReturnPct: number;
  sellingCostPct: number;
};

export type RentVsBuyResult = {
  buyMonthly: number;
  rentMonthlyStart: number;
  buyNetWorth: number;
  rentNetWorth: number;
  winner: 'buy' | 'rent' | 'tie';
};

export function calculateRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const loan = Math.max(input.homePrice - input.downPayment, 0);
  const pi = monthlyPrincipalAndInterest(input.ratePct, loan, input.termYears * 12);
  const buyMonthly = pi + input.monthlyTaxes + input.monthlyInsurance + input.monthlyHoa;
  let balance = loan;
  const monthlyRate = input.ratePct / 100 / 12;
  for (let i = 0; i < input.years * 12; i++) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    balance = Math.max(balance - (pi - interest), 0);
  }
  const futureValue = input.homePrice * (1 + input.appreciationPct / 100) ** input.years;
  const sellingCosts = futureValue * (input.sellingCostPct / 100);
  const buyNetWorth = futureValue - balance - sellingCosts;

  let invested = input.downPayment;
  let rent = input.monthlyRent;
  const monthlyInvest = input.investmentReturnPct / 100 / 12;
  for (let y = 0; y < input.years; y++) {
    for (let m = 0; m < 12; m++) {
      invested = invested * (1 + monthlyInvest) + Math.max(buyMonthly - rent, 0);
    }
    rent *= 1 + input.rentGrowthPct / 100;
  }
  const rentNetWorth = invested;
  const delta = buyNetWorth - rentNetWorth;
  return {
    buyMonthly,
    rentMonthlyStart: input.monthlyRent,
    buyNetWorth,
    rentNetWorth,
    winner: Math.abs(delta) < 1 ? 'tie' : delta > 0 ? 'buy' : 'rent',
  };
}

export type FlipInput = {
  purchasePrice: number;
  rehab: number;
  arv: number;
  holdingMonths: number;
  holdingMonthly: number;
  sellingCostPct: number;
  closingCosts: number;
};

export type FlipResult = {
  allIn: number;
  sellingCosts: number;
  profit: number;
  roiPct: number | null;
  seventyPercentMaxOffer: number;
};

export function calculateFlip(input: FlipInput): FlipResult {
  const holding = input.holdingMonthly * input.holdingMonths;
  const allIn = input.purchasePrice + input.rehab + holding + input.closingCosts;
  const sellingCosts = input.arv * (input.sellingCostPct / 100);
  const profit = input.arv - sellingCosts - allIn;
  const cashIn = input.purchasePrice + input.rehab + holding + input.closingCosts;
  return {
    allIn,
    sellingCosts,
    profit,
    roiPct: cashIn > 0 ? (profit / cashIn) * 100 : null,
    seventyPercentMaxOffer: input.arv * 0.7 - input.rehab,
  };
}

export type BrrrrInput = {
  purchasePrice: number;
  rehab: number;
  closingCosts: number;
  arv: number;
  refinanceLtvPct: number;
  refinanceCosts: number;
};

export type BrrrrResult = {
  cashIn: number;
  refinanceLoan: number;
  cashOut: number;
  cashLeftIn: number;
  recyclePct: number | null;
};

export function calculateBrrrr(input: BrrrrInput): BrrrrResult {
  const cashIn = input.purchasePrice + input.rehab + input.closingCosts;
  const refinanceLoan = input.arv * (input.refinanceLtvPct / 100);
  const cashOut = Math.max(refinanceLoan - input.purchasePrice - input.refinanceCosts, 0);
  const cashLeftIn = cashIn - cashOut;
  return {
    cashIn,
    refinanceLoan,
    cashOut,
    cashLeftIn,
    recyclePct: cashIn > 0 ? (cashOut / cashIn) * 100 : null,
  };
}

export type Exchange1031Input = {
  saleDate: string;
};

export type Exchange1031Result = {
  saleDate: string;
  identifyBy: string;
  closeBy: string;
  identifyDays: 45;
  closeDays: 180;
};

export function calculate1031(input: Exchange1031Input): Exchange1031Result | { error: string } {
  const sale = new Date(`${input.saleDate}T12:00:00`);
  if (Number.isNaN(sale.getTime())) return { error: 'Enter a valid sale date' };
  const identify = new Date(sale);
  identify.setDate(identify.getDate() + 45);
  const close = new Date(sale);
  close.setDate(close.getDate() + 180);
  return {
    saleDate: input.saleDate,
    identifyBy: identify.toISOString().slice(0, 10),
    closeBy: close.toISOString().slice(0, 10),
    identifyDays: 45,
    closeDays: 180,
  };
}

export function formatUsd(amount: number | null, cents = false): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
}

export function formatPct(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatMonths(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1) return '< 1 month';
  const months = Math.ceil(value);
  if (months >= 12) {
    const years = months / 12;
    return `${months} months (${years.toFixed(1)} yr)`;
  }
  return `${months} months`;
}

export function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
