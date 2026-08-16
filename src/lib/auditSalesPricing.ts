/**
 * Page 2 of the audit sales sheet — services, modules, and prices.
 * Numbers come from INSTALLATION_TIERS so the leave-behind stays in sync
 * with /pricing. Show the money up front; take the tier that closes.
 */
import { INSTALLATION_TIERS, formatInstallUsd } from './installationTiers';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const AUDIT_SERVICES_TITLE = 'Services & pricing';

export const AUDIT_SERVICES_LEAD =
  'Prices are on this page. Month one is the full tier; the fee halves each month through month four, then holds. Pick the scope that fits — we will start there.';

export const AUDIT_SERVICES_DISCLAIMER =
  'AI API tokens are billed separately at cost. This is a leave-behind, not a signed quote.';

/** Core OS first so the entry price is the first number they see. */
export function salesSheetTiers() {
  return INSTALLATION_TIERS.slice().sort((a, b) => b.tier - a.tier);
}

export function renderAuditServicesArticle(opts: {
  logoHtml: string;
  footerHtml: string;
  kicker?: string;
}): string {
  const tiers = salesSheetTiers();
  const kicker = (opts.kicker || '').trim();
  const kickerHtml = kicker ? `<p class="doc-onepager-kicker">${esc(kicker)}</p>` : '';

  const tableRows = tiers
    .map(
      (t) =>
        `<tr><th scope="row">${esc(t.name)}</th><td>${esc(formatInstallUsd(t.month1))}</td><td>${esc(formatInstallUsd(t.month2))}</td><td>${esc(formatInstallUsd(t.month3))}</td><td>${esc(formatInstallUsd(t.month4))}</td><td>${esc(formatInstallUsd(t.month5Plus))}/mo</td></tr>`,
    )
    .join('');

  const cards = tiers
    .map((t) => {
      const items = t.features
        .map((f) => `<li>${esc(f.label)}</li>`)
        .join('');
      return `<article class="ss-tier"><h3 class="ss-tier-name">${esc(t.name)}</h3><p class="ss-tier-price">${esc(formatInstallUsd(t.month1))} → ${esc(formatInstallUsd(t.month5Plus))}/mo</p><p class="ss-tier-summary">${esc(t.summary)}</p><ul class="ss-tier-mods">${items}</ul></article>`;
    })
    .join('');

  return `
<article class="doc-onepager ss-services" data-page="services">
  <header class="doc-onepager-header">
    <div class="doc-onepager-logo">${opts.logoHtml}</div>
    <div class="doc-onepager-mast">
      <h1 class="doc-onepager-title">${esc(AUDIT_SERVICES_TITLE)}</h1>
      ${kickerHtml}
    </div>
  </header>
  <p class="ss-services-lead">${esc(AUDIT_SERVICES_LEAD)}</p>
  <div class="ss-services-table-wrap">
    <table class="ss-services-table">
      <thead>
        <tr>
          <th scope="col">Plan</th>
          <th scope="col">Month 1</th>
          <th scope="col">Month 2</th>
          <th scope="col">Month 3</th>
          <th scope="col">Month 4</th>
          <th scope="col">Month 5+</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <p class="ss-services-note">${esc(AUDIT_SERVICES_DISCLAIMER)}</p>
  <div class="ss-tier-grid">${cards}</div>
  <footer class="doc-onepager-footer">${opts.footerHtml}</footer>
</article>`.trim();
}

export function appendPrintOnePagerArticle(sheetHtml: string, articleHtml: string): string {
  if (!articleHtml.trim()) return sheetHtml;
  const stageOpen = '<div class="doc-onepager-stage">';
  const stageAt = sheetHtml.lastIndexOf(stageOpen);
  if (stageAt < 0) return `${sheetHtml}\n${articleHtml}`;
  const close = '</div>';
  const closeAt = sheetHtml.lastIndexOf(close);
  if (closeAt < stageAt) return `${sheetHtml}\n${articleHtml}`;
  return `${sheetHtml.slice(0, closeAt)}${articleHtml}${sheetHtml.slice(closeAt)}`;
}

export const DOCUMENT_SERVICES_PAGE_CSS = `
.doc-onepager-stage {
  flex-direction: column;
  gap: 16px;
}
.ss-services {
  gap: 2.2%;
}
.ss-services-lead {
  margin: 0;
  font-size: clamp(9px, 1.55cqi, 13px);
  line-height: 1.4;
  color: #2a2a2a;
}
.ss-services-table-wrap {
  flex: 0 0 auto;
  overflow: hidden;
}
.ss-services-table {
  width: 100%;
  border-collapse: collapse;
  font-size: clamp(8px, 1.35cqi, 12px);
}
.ss-services-table th,
.ss-services-table td {
  padding: 0.35em 0.4em;
  border-bottom: 1px solid var(--doc-rule);
  text-align: right;
}
.ss-services-table thead th {
  font-size: 0.85em;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--doc-muted);
  font-weight: 700;
}
.ss-services-table tbody th {
  text-align: left;
  font-weight: 700;
  color: var(--doc-ink);
}
.ss-services-note {
  margin: 0;
  font-size: clamp(8px, 1.2cqi, 11px);
  font-style: italic;
  color: var(--doc-muted);
}
.ss-tier-grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2.2%;
}
.doc-onepager[data-orientation="portrait"] .ss-tier-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2.8% 3%;
}
.ss-tier {
  min-width: 0;
  padding-right: 4%;
  border-right: 1px solid var(--doc-rule);
}
.ss-tier:last-child {
  border-right: none;
  padding-right: 0;
}
.doc-onepager[data-orientation="portrait"] .ss-tier:nth-child(2n) {
  border-right: none;
  padding-right: 0;
}
.ss-tier-name {
  margin: 0 0 0.25em;
  font-size: clamp(11px, 1.7cqi, 15px);
  font-weight: 700;
  letter-spacing: -0.02em;
}
.ss-tier-price {
  margin: 0 0 0.4em;
  font-size: clamp(10px, 1.5cqi, 13px);
  font-weight: 700;
  color: var(--doc-ink);
}
.ss-tier-summary {
  margin: 0 0 0.5em;
  font-size: clamp(8px, 1.25cqi, 11px);
  line-height: 1.35;
  color: #2a2a2a;
}
.ss-tier-mods {
  margin: 0;
  padding-left: 1.1em;
  font-size: clamp(8px, 1.2cqi, 11px);
  line-height: 1.35;
  color: #2a2a2a;
}
.ss-tier-mods li { margin: 0 0 0.2em; }
@media print {
  .doc-onepager-stage { gap: 0; }
  .doc-onepager { break-after: page; page-break-after: always; }
  .doc-onepager:last-of-type { break-after: auto; page-break-after: auto; }
}
`.trim();
