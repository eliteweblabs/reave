/**
 * Guard: investor / mortgage calculator formulas stay internally consistent.
 * Run: npm run check:re-calcs
 */
import assert from 'node:assert/strict';
import { monthlyPrincipalAndInterest } from '../src/lib/dscrCalculator.ts';
import {
  DEFAULT_DEAL,
  analyzeDeal,
  calculate1031,
  calculateAffordability,
  calculateBrrrr,
  calculateFlip,
  calculateMortgage,
  calculateRefinance,
  calculateRentVsBuy,
  loanFromPayment,
} from '../src/lib/realEstateCalculators.ts';

const deal = analyzeDeal(DEFAULT_DEAL);
assert.equal(deal.annualGrossRent, 3800 * 12);
assert.equal(Math.round(deal.effectiveGrossIncome), Math.round(3800 * 12 * 0.95));
assert.equal(deal.operatingExpenses, (550 + 150 + 400) * 12);
assert.ok(deal.noi > 0);
assert.ok(deal.capRatePct && deal.capRatePct > 4 && deal.capRatePct < 6);
assert.ok(deal.grm && deal.grm > 13 && deal.grm < 15);
assert.ok(deal.onePercentPct && deal.onePercentPct < 1);
assert.ok(deal.investorDscr && deal.investorDscr > 0.6);
assert.equal(deal.cashInvested, 650_000 - 520_000 + 12_000);

const pi = monthlyPrincipalAndInterest(6.75, 520_000, 360);
assert.ok(Math.abs(deal.monthlyPi - pi) < 0.01);
const inverted = loanFromPayment(pi, 6.75, 360);
assert.ok(Math.abs(inverted - 520_000) < 1);

const mortgage = calculateMortgage({
  loanAmount: 400_000,
  ratePct: 6.5,
  termYears: 30,
  monthlyTaxes: 400,
  monthlyInsurance: 120,
  monthlyHoa: 0,
});
assert.ok(mortgage.monthlyPi > 2500 && mortgage.monthlyPi < 2600);
assert.ok(mortgage.monthlyPiti > mortgage.monthlyPi);
assert.ok(mortgage.totalInterest > 0);
assert.ok(Math.abs(mortgage.firstYearPrincipal + mortgage.firstYearInterest - mortgage.monthlyPi * 12) < 1);

const afford = calculateAffordability({
  monthlyIncome: 12_000,
  dtiPct: 43,
  monthlyDebts: 400,
  ratePct: 6.75,
  termYears: 30,
  monthlyTaxes: 500,
  monthlyInsurance: 150,
  downPayment: 80_000,
});
assert.ok(afford.maxPiti > 4000);
assert.ok(afford.maxLoan > 400_000);
assert.equal(afford.maxPrice, afford.maxLoan + 80_000);

const refi = calculateRefinance({
  currentBalance: 400_000,
  currentRatePct: 7.25,
  currentTermYears: 28,
  newRatePct: 6.25,
  newTermYears: 30,
  closingCosts: 6_000,
});
assert.ok(refi.monthlySavings > 0);
assert.ok(refi.breakEvenMonths && refi.breakEvenMonths > 0 && refi.breakEvenMonths < 24);

const worse = calculateRefinance({
  currentBalance: 400_000,
  currentRatePct: 5.5,
  currentTermYears: 28,
  newRatePct: 6.75,
  newTermYears: 30,
  closingCosts: 6_000,
});
assert.ok(worse.monthlySavings < 0);
assert.equal(worse.breakEvenMonths, null);

const buy = calculateRentVsBuy({
  homePrice: 650_000,
  downPayment: 130_000,
  ratePct: 6.75,
  termYears: 30,
  monthlyTaxes: 550,
  monthlyInsurance: 150,
  monthlyHoa: 0,
  monthlyRent: 3_200,
  years: 5,
  appreciationPct: 3,
  rentGrowthPct: 3,
  investmentReturnPct: 7,
  sellingCostPct: 6,
});
assert.ok(buy.buyMonthly > 0);
assert.ok(buy.buyNetWorth !== 0);
assert.ok(buy.winner === 'buy' || buy.winner === 'rent');

const flip = calculateFlip({
  purchasePrice: 280_000,
  rehab: 60_000,
  arv: 420_000,
  holdingMonths: 6,
  holdingMonthly: 2_000,
  sellingCostPct: 8,
  closingCosts: 8_000,
});
assert.equal(flip.seventyPercentMaxOffer, 420_000 * 0.7 - 60_000);
assert.ok(flip.profit > 0);
assert.ok(flip.roiPct && flip.roiPct > 0);

const brrrr = calculateBrrrr({
  purchasePrice: 220_000,
  rehab: 40_000,
  closingCosts: 8_000,
  arv: 340_000,
  refinanceLtvPct: 75,
  refinanceCosts: 5_000,
});
assert.equal(brrrr.cashIn, 268_000);
assert.equal(brrrr.refinanceLoan, 255_000);
assert.equal(brrrr.cashOut, 30_000);
assert.equal(brrrr.cashLeftIn, 238_000);

const exchange = calculate1031({ saleDate: '2026-01-15' });
assert.ok(!('error' in exchange));
if (!('error' in exchange)) {
  assert.equal(exchange.identifyBy, '2026-03-01');
  assert.equal(exchange.closeBy, '2026-07-14');
}

const bad = calculate1031({ saleDate: 'not-a-date' });
assert.ok('error' in bad);

console.log('verify-real-estate-calculators: ok');
