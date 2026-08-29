import { calculateDscr, parseDscrInput } from '../lib/dscrCalculator';
import {
  analyzeDeal,
  calculate1031,
  calculateAffordability,
  calculateBrrrr,
  calculateFlip,
  calculateMortgage,
  calculateRefinance,
  calculateRentVsBuy,
  formatDateLabel,
  formatMonths,
  formatPct,
  formatUsd,
  money,
} from '../lib/realEstateCalculators';

function formValues(form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form);
  const out: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function setText(root: Element, name: string, value: string) {
  const el = root.querySelector(`[data-out="${name}"]`);
  if (el) el.textContent = value;
}

function bindDeal(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = analyzeDeal({
      purchasePrice: money(v.purchasePrice),
      loanAmount: money(v.loanAmount),
      ratePct: money(v.ratePct),
      termYears: money(v.termYears) || 30,
      monthlyRent: money(v.monthlyRent),
      vacancyPct: money(v.vacancyPct),
      monthlyTaxes: money(v.monthlyTaxes),
      monthlyInsurance: money(v.monthlyInsurance),
      monthlyHoa: money(v.monthlyHoa),
      monthlyOtherOpex: money(v.monthlyOtherOpex),
      closingCosts: money(v.closingCosts),
      rehabCosts: money(v.rehabCosts),
    });
    setText(out, 'noi', formatUsd(r.noi));
    setText(out, 'cap', formatPct(r.capRatePct));
    setText(out, 'coc', formatPct(r.cashOnCashPct));
    setText(out, 'dscr', r.investorDscr == null ? '—' : r.investorDscr.toFixed(2));
    setText(out, 'grm', r.grm == null ? '—' : `${r.grm.toFixed(1)}×`);
    setText(out, 'one', formatPct(r.onePercentPct));
    setText(out, 'cashflow', formatUsd(r.monthlyCashFlow, true));
    setText(out, 'pi', formatUsd(r.monthlyPi, true));
    setText(out, 'egi', formatUsd(r.effectiveGrossIncome));
    setText(out, 'opex', formatUsd(r.operatingExpenses));
    setText(out, 'invested', formatUsd(r.cashInvested));
    setText(out, 'be', formatPct(r.breakEvenOccupancyPct));
  };
  form.addEventListener('input', run);
  run();
}

function bindDscr(form: HTMLFormElement, out: Element) {
  const run = () => {
    const parsed = parseDscrInput(formValues(form));
    if ('error' in parsed) {
      setText(out, 'status', 'Check inputs');
      setText(out, 'dscr', '—');
      return;
    }
    const r = calculateDscr(parsed);
    setText(out, 'status', r.passed ? 'Passes' : r.errors[0] || 'Does not pass');
    setText(out, 'dscr', r.dscr == null ? '—' : r.dscr.toFixed(2));
    setText(out, 'ltv', r.ltv == null ? '—' : formatPct(r.ltv));
    setText(out, 'rate', r.rate == null ? '—' : formatPct(r.rate, 3));
    setText(out, 'pi', formatUsd(r.principalAndInterest, true));
    setText(out, 'piti', formatUsd(r.piti, true));
    out.classList.toggle('is-pass', r.passed);
    out.classList.toggle('is-fail', !r.passed);
  };
  form.addEventListener('input', run);
  form.addEventListener('change', run);
  run();
}

function bindMortgage(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = calculateMortgage({
      loanAmount: money(v.loanAmount),
      ratePct: money(v.ratePct),
      termYears: money(v.termYears) || 30,
      monthlyTaxes: money(v.monthlyTaxes),
      monthlyInsurance: money(v.monthlyInsurance),
      monthlyHoa: money(v.monthlyHoa),
    });
    setText(out, 'pi', formatUsd(r.monthlyPi, true));
    setText(out, 'piti', formatUsd(r.monthlyPiti, true));
    setText(out, 'interest', formatUsd(r.totalInterest));
    setText(out, 'y1p', formatUsd(r.firstYearPrincipal));
    setText(out, 'y1i', formatUsd(r.firstYearInterest));
  };
  form.addEventListener('input', run);
  run();
}

function bindAfford(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = calculateAffordability({
      monthlyIncome: money(v.monthlyIncome),
      dtiPct: money(v.dtiPct) || 43,
      monthlyDebts: money(v.monthlyDebts),
      ratePct: money(v.ratePct),
      termYears: money(v.termYears) || 30,
      monthlyTaxes: money(v.monthlyTaxes),
      monthlyInsurance: money(v.monthlyInsurance),
      downPayment: money(v.downPayment),
    });
    setText(out, 'price', formatUsd(r.maxPrice));
    setText(out, 'loan', formatUsd(r.maxLoan));
    setText(out, 'piti', formatUsd(r.maxPiti, true));
  };
  form.addEventListener('input', run);
  run();
}

function bindRefi(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = calculateRefinance({
      currentBalance: money(v.currentBalance),
      currentRatePct: money(v.currentRatePct),
      currentTermYears: money(v.currentTermYears) || 30,
      newRatePct: money(v.newRatePct),
      newTermYears: money(v.newTermYears) || 30,
      closingCosts: money(v.closingCosts),
    });
    setText(out, 'now', formatUsd(r.currentPi, true));
    setText(out, 'next', formatUsd(r.newPi, true));
    setText(out, 'save', formatUsd(r.monthlySavings, true));
    setText(out, 'be', formatMonths(r.breakEvenMonths));
  };
  form.addEventListener('input', run);
  run();
}

function bindRentBuy(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = calculateRentVsBuy({
      homePrice: money(v.homePrice),
      downPayment: money(v.downPayment),
      ratePct: money(v.ratePct),
      termYears: money(v.termYears) || 30,
      monthlyTaxes: money(v.monthlyTaxes),
      monthlyInsurance: money(v.monthlyInsurance),
      monthlyHoa: money(v.monthlyHoa),
      monthlyRent: money(v.monthlyRent),
      years: money(v.years) || 5,
      appreciationPct: money(v.appreciationPct),
      rentGrowthPct: money(v.rentGrowthPct),
      investmentReturnPct: money(v.investmentReturnPct),
      sellingCostPct: money(v.sellingCostPct),
    });
    setText(out, 'buyMo', formatUsd(r.buyMonthly, true));
    setText(out, 'buyNw', formatUsd(r.buyNetWorth));
    setText(out, 'rentNw', formatUsd(r.rentNetWorth));
    setText(out, 'winner', r.winner === 'tie' ? 'About even' : r.winner === 'buy' ? 'Buying wins' : 'Renting wins');
  };
  form.addEventListener('input', run);
  run();
}

function bindFlip(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = calculateFlip({
      purchasePrice: money(v.purchasePrice),
      rehab: money(v.rehab),
      arv: money(v.arv),
      holdingMonths: money(v.holdingMonths) || 6,
      holdingMonthly: money(v.holdingMonthly),
      sellingCostPct: money(v.sellingCostPct),
      closingCosts: money(v.closingCosts),
    });
    setText(out, 'profit', formatUsd(r.profit));
    setText(out, 'roi', formatPct(r.roiPct));
    setText(out, 'allin', formatUsd(r.allIn));
    setText(out, 'seventy', formatUsd(r.seventyPercentMaxOffer));
  };
  form.addEventListener('input', run);
  run();
}

function bindBrrrr(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = calculateBrrrr({
      purchasePrice: money(v.purchasePrice),
      rehab: money(v.rehab),
      closingCosts: money(v.closingCosts),
      arv: money(v.arv),
      refinanceLtvPct: money(v.refinanceLtvPct) || 75,
      refinanceCosts: money(v.refinanceCosts),
    });
    setText(out, 'cashin', formatUsd(r.cashIn));
    setText(out, 'refi', formatUsd(r.refinanceLoan));
    setText(out, 'out', formatUsd(r.cashOut));
    setText(out, 'left', formatUsd(r.cashLeftIn));
    setText(out, 'recycle', formatPct(r.recyclePct));
  };
  form.addEventListener('input', run);
  run();
}

function bind1031(form: HTMLFormElement, out: Element) {
  const run = () => {
    const v = formValues(form);
    const r = calculate1031({ saleDate: v.saleDate || '' });
    if ('error' in r) {
      setText(out, 'id', r.error);
      setText(out, 'close', '—');
      return;
    }
    setText(out, 'id', formatDateLabel(r.identifyBy));
    setText(out, 'close', formatDateLabel(r.closeBy));
  };
  form.addEventListener('input', run);
  form.addEventListener('change', run);
  run();
}

const binders: Record<string, (form: HTMLFormElement, out: Element) => void> = {
  deal: bindDeal,
  dscr: bindDscr,
  mortgage: bindMortgage,
  afford: bindAfford,
  refi: bindRefi,
  rentbuy: bindRentBuy,
  flip: bindFlip,
  brrrr: bindBrrrr,
  exchange: bind1031,
};

export function mountTonyCalculatorSuite(root: HTMLElement) {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-panel]')];

  const show = (id: string) => {
    tabs.forEach((tab) => tab.setAttribute('aria-selected', tab.dataset.tab === id ? 'true' : 'false'));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== id;
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => show(tab.dataset.tab || 'deal'));
  });

  for (const panel of panels) {
    const id = panel.dataset.panel || '';
    const form = panel.querySelector('form');
    const out = panel.querySelector('[data-results]');
    const bind = binders[id];
    if (form && out && bind) bind(form, out);
  }

  const initial = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.tab || 'deal';
  show(initial);
}
