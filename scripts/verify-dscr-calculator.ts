/**
 * Guard: DSCR math matches the lender matrix / beginning-of-period P&I.
 * Run: npm run check:dscr
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_DSCR_INPUT,
  calculateDscr,
  lookupBaseRate,
  monthlyPrincipalAndInterest,
  parseDscrInput,
} from '../src/lib/dscrCalculator.ts';

const sample = calculateDscr(DEFAULT_DSCR_INPUT);
assert.equal(sample.ltv != null ? Number(sample.ltv.toFixed(2)) : null, 45);
assert.equal(sample.rate, 6.25);
assert.ok(sample.principalAndInterest && sample.principalAndInterest > 2700 && sample.principalAndInterest < 2800);
assert.ok(sample.piti && sample.piti > 4150 && sample.piti < 4250);
assert.ok(sample.dscr && sample.dscr > 1.18 && sample.dscr < 1.2);
assert.equal(sample.passed, true);
assert.equal(sample.errors.length, 0);

assert.equal(lookupBaseRate(800, 45), 6.25);
assert.equal(lookupBaseRate(720, 80), 7.999);
assert.equal(lookupBaseRate(650, 70), 8.5);
assert.equal(lookupBaseRate(639, 50), null);
assert.equal(lookupBaseRate(760, 81), null);

const cashout = calculateDscr({
  ...DEFAULT_DSCR_INPUT,
  purpose: 'Cashout',
  loanAmount: 750_000,
  monthlyRent: 2000,
});
assert.equal(cashout.ltv != null ? Number(cashout.ltv.toFixed(2)) : null, 75);
assert.equal(cashout.rate, 6.999 + 0.25);
assert.equal(cashout.passed, false);
assert.ok(cashout.errors.some((e) => /1\.00/.test(e)));
assert.equal(cashout.noRatioEligible, true);

const units58 = calculateDscr({ ...DEFAULT_DSCR_INPUT, units: '5-8' });
assert.equal(units58.rate, 6.5);

const lowFico = calculateDscr({ ...DEFAULT_DSCR_INPUT, fico: 640 });
assert.equal(lowFico.passed, false);
assert.ok(lowFico.errors.some((e) => /660/.test(e)));

const highLtv = calculateDscr({ ...DEFAULT_DSCR_INPUT, loanAmount: 900_000 });
assert.equal(highLtv.passed, false);
assert.ok(highLtv.errors.some((e) => /80%/.test(e)));

const parsed = parseDscrInput({
  state: 'Texas',
  fico: '740',
  units: '1-4',
  purpose: 'Purchase',
  propertyValue: '$750,000',
  loanAmount: '500,000',
  monthlyRent: '4,200',
  monthlyInsurance: '180',
  monthlyTaxes: '900',
});
assert.ok(!('error' in parsed));
if (!('error' in parsed)) {
  assert.equal(parsed.state, 'Texas');
  assert.equal(parsed.propertyValue, 750000);
  assert.equal(parsed.purpose, 'Purchase');
}

const pi = monthlyPrincipalAndInterest(6.25, 450_000);
assert.ok(Math.abs(pi - 2756.37) < 0.05);

console.log('verify-dscr-calculator: ok');
