/**
 * DSCR Calculator admin — lender-grade rental DSCR, same formula as /dscr.
 */
import { mountPanelSkeleton } from './shared.js?v=20260810a';

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
  'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
  'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

const DEFAULTS = {
  state: 'California',
  fico: '800',
  units: '1-4',
  purpose: 'RateAndTerm',
  propertyValue: '1000000',
  loanAmount: '450000',
  monthlyRent: '5000',
  monthlyInsurance: '250',
  monthlyTaxes: '1200',
  monthlyHoa: '0',
};

const SCENARIO_KEY = 'reave_dscr_scenarios';

function moneyInput(value) {
  const n = Number(String(value ?? '').replace(/[$,]/g, ''));
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('en-US').format(n);
}

function parseMoney(value) {
  return Number(String(value ?? '').replace(/[$,]/g, '')) || 0;
}

function optionList(items, selected) {
  return items
    .map((item) => {
      const value = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? item : item.label;
      return `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`;
    })
    .join('');
}

function renderForm(values) {
  return (
    `<form id="dscr-form" class="dscr-form">` +
    `<div class="dscr-field"><label for="dscr-state">Subject property state</label>` +
    `<select id="dscr-state" name="state">${optionList(US_STATES, values.state)}</select></div>` +
    `<div class="dscr-field-row">` +
    `<div class="dscr-field"><label for="dscr-fico">Borrower middle FICO</label>` +
    `<input id="dscr-fico" name="fico" type="number" min="300" max="850" step="1" value="${values.fico}" required /></div>` +
    `<div class="dscr-field"><label for="dscr-units">Subject property units</label>` +
    `<select id="dscr-units" name="units">${optionList(
      [
        { value: '1-4', label: '1-4 units' },
        { value: '5-8', label: '5-8 units' },
      ],
      values.units,
    )}</select></div>` +
    `</div>` +
    `<div class="dscr-field"><label for="dscr-purpose">Purpose of loan</label>` +
    `<select id="dscr-purpose" name="purpose">${optionList(
      [
        { value: 'Purchase', label: 'Purchase' },
        { value: 'RateAndTerm', label: 'Rate & Term' },
        { value: 'Cashout', label: 'Cash-out' },
      ],
      values.purpose,
    )}</select></div>` +
    `<div class="dscr-field-row">` +
    `<div class="dscr-field"><label for="dscr-value">Value of subject property</label>` +
    `<input id="dscr-value" name="propertyValue" inputmode="decimal" value="${moneyInput(values.propertyValue)}" required /></div>` +
    `<div class="dscr-field"><label for="dscr-loan">Proposed loan amount</label>` +
    `<input id="dscr-loan" name="loanAmount" inputmode="decimal" value="${moneyInput(values.loanAmount)}" required /></div>` +
    `</div>` +
    `<div class="dscr-field-row">` +
    `<div class="dscr-field"><label for="dscr-rent">Est. monthly rent</label>` +
    `<input id="dscr-rent" name="monthlyRent" inputmode="decimal" value="${moneyInput(values.monthlyRent)}" required /></div>` +
    `<div class="dscr-field"><label for="dscr-ins">Est. monthly insurance</label>` +
    `<input id="dscr-ins" name="monthlyInsurance" inputmode="decimal" value="${moneyInput(values.monthlyInsurance)}" required /></div>` +
    `</div>` +
    `<div class="dscr-field-row">` +
    `<div class="dscr-field"><label for="dscr-tax">Est. monthly property taxes</label>` +
    `<input id="dscr-tax" name="monthlyTaxes" inputmode="decimal" value="${moneyInput(values.monthlyTaxes)}" required /></div>` +
    `<div class="dscr-field"><label for="dscr-hoa">Monthly HOA dues (if any)</label>` +
    `<input id="dscr-hoa" name="monthlyHoa" inputmode="decimal" value="${moneyInput(values.monthlyHoa)}" /></div>` +
    `</div>` +
    `<div class="dscr-actions">` +
    `<button type="submit" class="prof-btn-primary">Calculate DSCR</button>` +
    `<button type="button" id="dscr-save" class="prof-btn-secondary">Save scenario</button>` +
    `<button type="button" id="dscr-copy" class="prof-btn-secondary">Copy results</button>` +
    `<a class="prof-btn-secondary" id="dscr-public" href="/dscr" target="_blank" rel="noreferrer">Open public page</a>` +
    `</div>` +
    `</form>`
  );
}

function metric(label, value, hero) {
  return `<div class="dscr-metric${hero ? ' dscr-metric--hero' : ''}"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderResults(result) {
  if (!result) {
    return `<p class="dscr-empty">Enter the property and loan, then calculate.</p>`;
  }
  const passed = result.passed;
  const errors = (result.errors || [])
    .map((m) => `<p>⚠ ${m}${/[.!?]$/.test(m) ? '' : '.'}</p>`)
    .join('');
  const warn = (result.warnings || []).map((m) => `<p>${m}</p>`).join('');
  return (
    `<div class="dscr-status dscr-status--${passed ? 'pass' : 'fail'}">` +
    `<div class="dscr-status-icon" aria-hidden="true">${passed ? '✓' : '✕'}</div>` +
    `<div>` +
    `<h2>${passed ? 'You passed' : "Didn't pass DSCR"}</h2>` +
    `<p class="dscr-lede">${
      passed
        ? 'Rent covers the estimated payment on this structure.'
        : 'Adjust value, loan, rent, or FICO — or check a no-ratio path if you have 25%+ equity.'
    }</p>` +
    `</div></div>` +
    (errors ? `<div class="dscr-errors">${errors}</div>` : '') +
    (warn ? `<div class="dscr-warn">${warn}</div>` : '') +
    `<div class="dscr-metrics">` +
    metric('Loan-to-value (LTV)', result.ltvLabel || '—') +
    metric('Estimated interest rate', result.rateLabel || '—') +
    metric('Principal & interest', result.principalAndInterestLabel || '—') +
    metric('Combined payment (PITI)', result.pitiLabel || '—') +
    metric('DSCR ratio', result.dscrLabel || '—', true) +
    `</div>`
  );
}

function readScenarios() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCENARIO_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeScenarios(items) {
  localStorage.setItem(SCENARIO_KEY, JSON.stringify(items.slice(0, 20)));
}

function renderScenarios(items) {
  if (!items.length) return `<p class="dscr-empty">Saved scenarios stay on this device so you can compare structures.</p>`;
  return (
    `<ul class="dscr-scenarios">` +
    items
      .map((item, i) => {
        const title = item.name || `${item.result?.dscrLabel || '—'} DSCR · ${item.result?.ltvLabel || ''}`;
        return (
          `<li class="dscr-scenario">` +
          `<button type="button" class="dscr-load" data-idx="${i}">${title}</button>` +
          `<button type="button" class="dscr-forget" data-idx="${i}" aria-label="Remove scenario">✕</button>` +
          `</li>`
        );
      })
      .join('') +
    `</ul>`
  );
}

function collectInput(form) {
  const data = new FormData(form);
  return {
    state: String(data.get('state') || ''),
    fico: Number(data.get('fico')),
    units: String(data.get('units') || '1-4'),
    purpose: String(data.get('purpose') || 'RateAndTerm'),
    propertyValue: parseMoney(data.get('propertyValue')),
    loanAmount: parseMoney(data.get('loanAmount')),
    monthlyRent: parseMoney(data.get('monthlyRent')),
    monthlyInsurance: parseMoney(data.get('monthlyInsurance')),
    monthlyTaxes: parseMoney(data.get('monthlyTaxes')),
    monthlyHoa: parseMoney(data.get('monthlyHoa')),
  };
}

function applyValues(form, values) {
  if (!form || !values) return;
  form.state.value = values.state || 'California';
  form.fico.value = values.fico ?? '';
  form.units.value = values.units || '1-4';
  form.purpose.value = values.purpose || 'RateAndTerm';
  form.propertyValue.value = moneyInput(values.propertyValue);
  form.loanAmount.value = moneyInput(values.loanAmount);
  form.monthlyRent.value = moneyInput(values.monthlyRent);
  form.monthlyInsurance.value = moneyInput(values.monthlyInsurance);
  form.monthlyTaxes.value = moneyInput(values.monthlyTaxes);
  form.monthlyHoa.value = moneyInput(values.monthlyHoa);
}

function copyText(result) {
  if (!result) return '';
  return [
    result.passed ? 'DSCR passed' : 'DSCR did not pass',
    `DSCR ${result.dscrLabel}`,
    `LTV ${result.ltvLabel}`,
    `Rate ${result.rateLabel}`,
    `P&I ${result.principalAndInterestLabel}`,
    `PITI ${result.pitiLabel}`,
  ].join('\n');
}

let mounted = false;
let lastResult = null;
let lastInput = { ...DEFAULTS, ...Object.fromEntries(
  Object.entries(DEFAULTS).map(([k, v]) => [k, k === 'state' || k === 'units' || k === 'purpose' ? v : Number(String(v).replace(/,/g, ''))]),
) };

function paint(root) {
  const scenarios = readScenarios();
  root.innerHTML =
    `<div class="dscr-panel-scroll">` +
    `<div class="dscr-layout">` +
    `<div class="dscr-card">` +
    `<h1>DSCR Calculator</h1>` +
    `<p class="dscr-lede">Same lender formula: rent ÷ (principal + interest + taxes + insurance + HOA). Estimated rate from the FICO / LTV matrix. 5–8 units and cash-out each add 0.25%.</p>` +
    renderForm({
      ...DEFAULTS,
      ...lastInput,
      propertyValue: lastInput.propertyValue ?? DEFAULTS.propertyValue,
      loanAmount: lastInput.loanAmount ?? DEFAULTS.loanAmount,
    }) +
    `</div>` +
    `<div>` +
    `<div class="dscr-card" id="dscr-results">${renderResults(lastResult)}</div>` +
    `<div class="dscr-card" style="margin-top:1.25rem">` +
    `<h2>Saved scenarios</h2>` +
    `<p class="dscr-lede">Compare properties and loan structures side by side.</p>` +
    `<div id="dscr-scenario-list">${renderScenarios(scenarios)}</div>` +
    `</div></div></div></div>`;
}

async function calculate(form) {
  const input = collectInput(form);
  lastInput = input;
  const res = await fetch('/api/dscr/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    lastResult = {
      passed: false,
      errors: [data.error || 'Could not calculate DSCR'],
      warnings: [],
    };
  } else {
    lastResult = data.result;
  }
  const results = document.getElementById('dscr-results');
  if (results) results.innerHTML = renderResults(lastResult);
}

function bind(root) {
  const form = root.querySelector('#dscr-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void calculate(form);
  });
  for (const id of ['dscr-value', 'dscr-loan', 'dscr-rent', 'dscr-ins', 'dscr-tax', 'dscr-hoa']) {
    const el = root.querySelector(`#${id}`);
    el?.addEventListener('blur', () => {
      el.value = moneyInput(parseMoney(el.value));
    });
  }
  root.querySelector('#dscr-save')?.addEventListener('click', () => {
    if (!lastResult) return;
    const name = `${lastResult.dscrLabel || '—'} DSCR · ${lastResult.ltvLabel || ''} LTV · ${lastResult.purposeLabel || lastInput.purpose}`;
    writeScenarios([{ name, input: lastInput, result: lastResult, savedAt: Date.now() }, ...readScenarios()]);
    const list = root.querySelector('#dscr-scenario-list');
    if (list) list.innerHTML = renderScenarios(readScenarios());
  });
  root.querySelector('#dscr-copy')?.addEventListener('click', async () => {
    const text = copyText(lastResult);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  });
  root.querySelector('#dscr-scenario-list')?.addEventListener('click', (e) => {
    const load = e.target.closest('.dscr-load');
    const forget = e.target.closest('.dscr-forget');
    if (load) {
      const item = readScenarios()[Number(load.dataset.idx)];
      if (!item) return;
      lastInput = { ...DEFAULTS, ...item.input };
      lastResult = item.result || null;
      applyValues(form, lastInput);
      const results = document.getElementById('dscr-results');
      if (results) results.innerHTML = renderResults(lastResult);
    }
    if (forget) {
      const next = readScenarios().filter((_, i) => i !== Number(forget.dataset.idx));
      writeScenarios(next);
      const list = root.querySelector('#dscr-scenario-list');
      if (list) list.innerHTML = renderScenarios(next);
    }
  });
}

export function loadDscrTab() {
  const root = document.getElementById('dscr-panel');
  if (!root) return;
  if (!mounted) {
    mountPanelSkeleton(root, 'settings');
    paint(root);
    bind(root);
    mounted = true;
    const form = root.querySelector('#dscr-form');
    if (form) void calculate(form);
  }
}
