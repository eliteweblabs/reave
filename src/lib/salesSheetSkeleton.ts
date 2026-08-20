/**
 * Sync first-paint helpers for `/admin/sales-sheet`.
 * Kept free of Playwright / Postgres so unit checks can import them.
 */
import {
  parseSalesSheetOrientation,
  salesSheetAuditUrl,
  salesSheetInputFromSearchParams,
  salesSheetWantsGoogleShot,
  type AuditSalesSheetInput,
  type SalesSheetOrientation,
} from './auditSalesSheet';
import { extractPortal } from './contactApi';
import { escapeHtml } from './htmlEscape';
import { shortPlaceFromAddress } from './salesSheetPlacesView';

export type SalesSheetFormState = {
  name: string;
  site: string;
  overall: string;
  score: string;
  performance: string;
  security: string;
  visibility: string;
  headline: string;
  audit: string;
  label1: string;
  finding1: string;
  solution1: string;
  label2: string;
  finding2: string;
  solution2: string;
  label3: string;
  finding3: string;
  solution3: string;
};

export function formStateFromInput(input: AuditSalesSheetInput, auditUrl: string): SalesSheetFormState {
  const finding1 = input.findings[0];
  const finding2 = input.findings[1];
  const finding3 = input.findings[2];
  return {
    name: input.contact.name || '',
    site: input.website || '',
    overall: input.overall ?? '',
    score: input.overallScore != null ? String(input.overallScore) : '',
    performance: input.performance ?? '',
    security: input.security ?? '',
    visibility: input.visibility ?? '',
    headline: input.headline || '',
    audit: auditUrl,
    label1: finding1?.categoryLabel ?? '',
    finding1: finding1?.problem ?? '',
    solution1: finding1?.solution ?? '',
    label2: finding2?.categoryLabel ?? '',
    finding2: finding2?.problem ?? '',
    solution2: finding2?.solution ?? '',
    label3: finding3?.categoryLabel ?? '',
    finding3: finding3?.problem ?? '',
    solution3: finding3?.solution ?? '',
  };
}

/** Sync query/dummy values for the first paint — no Places or Playwright. */
export function salesSheetShellFromParams(params: URLSearchParams, origin: string): {
  orientation: SalesSheetOrientation;
  runSlug: string;
  input: AuditSalesSheetInput;
  wantGoogleShot: boolean;
  near: string;
  category: string;
  listedParam: string;
  auditUrl: string;
  form: SalesSheetFormState;
} {
  const orientation = parseSalesSheetOrientation(params.get('orientation'));
  const runSlug = (params.get('run') || '').trim();
  const input = salesSheetInputFromSearchParams(params);
  const contactPortal = extractPortal(input.contact);
  const near =
    (params.get('near') || '').trim() ||
    shortPlaceFromAddress(contactPortal?.address || '');
  const auditUrl = salesSheetAuditUrl(params, origin);
  return {
    orientation,
    runSlug,
    input,
    wantGoogleShot: salesSheetWantsGoogleShot(params.get('google')),
    near,
    category: (params.get('category') || '').trim(),
    listedParam: (params.get('listed') || '').trim(),
    auditUrl,
    form: formStateFromInput(input, auditUrl),
  };
}

function bone(extraClass = '', style = ''): string {
  const cls = extraClass ? `sk-bone ${extraClass}` : 'sk-bone';
  return `<span class="${cls}"${style ? ` style="${style}"` : ''} aria-hidden="true"></span>`;
}

function letterPageSkeleton(orientation: SalesSheetOrientation, face: 'front' | 'back'): string {
  const cols =
    orientation === 'portrait'
      ? `<div class="ss-skel-cols ss-skel-cols--portrait">
          <div class="ss-skel-col">${bone('ss-skel-line', 'width:42%')}${bone('ss-skel-line', 'width:88%')}${bone('ss-skel-line', 'width:74%')}${bone('ss-skel-line', 'width:80%')}</div>
          <div class="ss-skel-col">${bone('ss-skel-line', 'width:36%')}${bone('ss-skel-line', 'width:92%')}${bone('ss-skel-line', 'width:70%')}${bone('ss-skel-line', 'width:84%')}</div>
        </div>`
      : `<div class="ss-skel-cols">
          <div class="ss-skel-col ss-skel-col--phone">${bone('ss-skel-phone')}</div>
          <div class="ss-skel-col">${bone('ss-skel-line', 'width:48%')}${bone('ss-skel-line', 'width:90%')}${bone('ss-skel-line', 'width:72%')}${bone('ss-skel-line', 'width:80%')}</div>
          <div class="ss-skel-col">${bone('ss-skel-line', 'width:40%')}${bone('ss-skel-line', 'width:88%')}${bone('ss-skel-line', 'width:76%')}${bone('ss-skel-line', 'width:64%')}</div>
          <div class="ss-skel-col">${bone('ss-skel-line', 'width:44%')}${bone('ss-skel-line', 'width:86%')}${bone('ss-skel-line', 'width:70%')}${bone('ss-skel-line', 'width:78%')}</div>
        </div>`;

  return (
    `<div class="ss-skel-stage">` +
    `<article class="ss-skel-page" data-orientation="${orientation}" data-ss-skel="${face}">` +
    `<header class="ss-skel-header">${bone('ss-skel-logo')}${bone('ss-skel-qr')}</header>` +
    cols +
    `<footer class="ss-skel-footer">${bone('ss-skel-line', 'width:70%')}</footer>` +
    `</article></div>`
  );
}

/** Letter-page shimmer shown while Places / Playwright finish. */
export function renderSalesSheetSkeletonHtml(
  orientation: SalesSheetOrientation = 'landscape',
  label = 'Loading sales sheet…',
): string {
  return (
    `<div class="ss-skel" role="status" aria-live="polite" aria-busy="true">` +
    `<span class="sk-sr">${escapeHtml(label)}</span>` +
    letterPageSkeleton(orientation, 'front') +
    letterPageSkeleton(orientation, 'back') +
    `</div>`
  );
}
