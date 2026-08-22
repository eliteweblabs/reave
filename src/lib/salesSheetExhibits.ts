/**
 * Front-of-sheet exhibits — one iPhone screen per cascade hit.
 * Identify and display. No next-step copy.
 */
import { escapeHtml } from './htmlEscape';
import { IPHONE_FRAME_SRC, isPlacesMissFinding } from './salesSheetPlacesView';
import type { LetterGrade } from './auditReportCard';
import type { SalesSheetFinding } from './auditSalesSheet';

export type SalesSheetExhibitKind =
  | 'ssl'
  | 'site-down'
  | 'domain'
  | 'malware'
  | 'places'
  | 'parked'
  | 'speed'
  | 'no-offer'
  | 'directories'
  | 'generic';

export type SalesSheetExhibitOpts = {
  website?: string;
  businessName?: string;
  frameSrc?: string;
  /** Live screenshot (data URL) for this screen when we captured one. */
  screenSrc?: string;
};

export type SalesSheetSnapshot = {
  overall: LetterGrade | null;
  overallScore: number | null;
  performance: LetterGrade | null;
  security: LetterGrade | null;
  visibility: LetterGrade | null;
};

export function auditHost(website: string): string {
  const raw = (website || '').trim();
  if (!raw) return 'this site';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0] || raw;
  }
}

export function auditHttpUrl(website: string): string {
  const host = auditHost(website);
  return host === 'this site' ? 'http://example.com' : `http://${host}`;
}

/** https://host plus the www / apex twin — live checks should not miss a working www cert. */
export function httpsAuditCandidates(website: string): string[] {
  const raw = (website || '').trim();
  if (!raw) return [];
  let host = '';
  let path = '/';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    host = u.hostname.replace(/\.$/, '');
    path = `${u.pathname || '/'}${u.search || ''}`;
  } catch {
    host = raw.replace(/^https?:\/\//i, '').split('/')[0] || '';
  }
  if (!host) return [];
  const hosts = host.startsWith('www.') ? [host, host.slice(4)] : [host, `www.${host}`];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hosts) {
    const url = `https://${h}${path.startsWith('/') ? path : `/${path}`}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function salesSheetExhibitKind(finding: Pick<SalesSheetFinding, 'id' | 'categoryLabel'>): SalesSheetExhibitKind {
  const id = (finding.id || '').toLowerCase();
  if (id === 'ssl-missing' || id === 'ssl-expired' || id === 'ssl-untrusted' || id.startsWith('ssl')) return 'ssl';
  if (id === 'site-down') return 'site-down';
  if (id === 'domain-expired' || id === 'domain') return 'domain';
  if (id === 'malware') return 'malware';
  if (id === 'site-parked' || id === 'parked') return 'parked';
  if (id === 'dummy-speed' || id === 'site-speed' || /speed/.test(id)) return 'speed';
  if (id === 'no-offer' || id === 'dummy-offer') return 'no-offer';
  if (id === 'directories' || id === 'dummy-seo' && /director/.test(finding.categoryLabel.toLowerCase())) {
    return 'directories';
  }
  if (isPlacesMissFinding(finding) || id === 'places-not-listed' || id === 'gbp-unclaimed') return 'places';
  const label = finding.categoryLabel.toLowerCase();
  if (label === 'ssl' || label.includes('certificate')) return 'ssl';
  if (label.includes('site down') || label === 'down') return 'site-down';
  if (label.includes('director')) return 'directories';
  if (label.includes('offer')) return 'no-offer';
  if (label.includes('speed')) return 'speed';
  return 'generic';
}

export function salesSheetWantsPlacesExhibit(findings: SalesSheetFinding[]): boolean {
  return findings.some((f) => salesSheetExhibitKind(f) === 'places');
}

export function salesSheetWantsSiteShot(findings: SalesSheetFinding[]): boolean {
  return findings.some((f) => {
    const kind = salesSheetExhibitKind(f);
    return kind === 'site-down' || kind === 'ssl' || kind === 'domain';
  });
}

/** A live homepage means the cascade’s Site Down / NXDOMAIN row is stale. */
export function dropWorkingSiteDownFindings(findings: SalesSheetFinding[]): SalesSheetFinding[] {
  return findings.filter((f) => {
    const kind = salesSheetExhibitKind(f);
    return kind !== 'site-down' && kind !== 'domain';
  });
}

/** A live HTTPS homepage means the drawn Not Secure graphic is wrong. */
export function dropWorkingSslFindings(findings: SalesSheetFinding[]): SalesSheetFinding[] {
  return findings.filter((f) => salesSheetExhibitKind(f) !== 'ssl');
}

export type LiveUrlProbe = {
  cleanUrls: string[];
  insecureUrls: string[];
  downUrls: string[];
};

/**
 * Keep the Not Secure graphic only when a host actually fails HTTPS.
 * A clean padlock (www or apex) drops the drawing. A broken twin host keeps it.
 */
export function applyLiveUrlToFindings(
  findings: SalesSheetFinding[],
  probe: LiveUrlProbe,
): { findings: SalesSheetFinding[]; website?: string; note: string } {
  const hasClean = probe.cleanUrls.length > 0;
  const hasInsecure = probe.insecureUrls.length > 0;
  let next = findings;
  let website: string | undefined;
  const notes: string[] = [];

  if (hasClean && !hasInsecure) {
    next = dropWorkingSslFindings(next);
    notes.push('Live HTTPS is clean — dropped the Not Secure graphic.');
  } else if (hasInsecure) {
    try {
      website = new URL(probe.insecureUrls[0] || '').hostname;
    } catch {
      website = undefined;
    }
    notes.push(
      website
        ? `HTTPS fails at ${website} — keeping the Not Secure graphic.`
        : 'HTTPS fails — keeping the Not Secure graphic.',
    );
  }

  if (hasClean || hasInsecure) {
    const before = next.length;
    next = dropWorkingSiteDownFindings(next);
    if (next.length < before) notes.push('Homepage responded — dropped Site Down.');
  }

  return { findings: next, website, note: notes.join(' ') };
}

function iphoneCss(): string {
  return `
.ss-phone {
  --ss-phone-screen: #f2f2f7;
  --ss-island-pad: 8.5%;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  aspect-ratio: 736 / 1428;
  margin: 0 auto 0.45em;
  background: transparent;
  color: #141414;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-phone-screen {
  position: absolute;
  top: 3.15%;
  right: 8.15%;
  bottom: 3.55%;
  left: 8.15%;
  z-index: 1;
  overflow: hidden;
  background: var(--ss-phone-screen);
  border-radius: 12% / 6%;
}
.ss-phone-screen:not(:has(.ss-phone-serp))::before {
  content: '';
  display: block;
  height: var(--ss-island-pad);
}
.ss-phone-screen:has(.ss-phone-serp) { background: #000; }
.ss-phone-serp {
  position: absolute;
  top: var(--ss-island-pad);
  right: 0; bottom: 0; left: 0;
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
  object-position: top center;
}
.ss-phone-frame {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}
.ss-phone-chrome {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 6px 6px;
  padding: 5px 7px;
  background: #e8e8ed;
  border-radius: 999px;
  font-size: 7px;
  font-weight: 600;
  color: #3a3a3c;
  white-space: nowrap;
  overflow: hidden;
}
.ss-phone-lock {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border: 1.2px solid #c62828;
  border-radius: 1px;
  position: relative;
}
.ss-phone-lock::after {
  content: '';
  position: absolute;
  left: 50%;
  top: -3px;
  width: 5px;
  height: 4px;
  margin-left: -2.5px;
  border: 1.15px solid #c62828;
  border-bottom: none;
  border-radius: 3px 3px 0 0;
  transform: rotate(-18deg);
}
.ss-phone-warn {
  color: #b42318;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.ss-phone-host {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #1d1d1f;
}
.ss-phone-body { padding: 0 8px 8px; }
.ss-phone-h {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  color: #1d1d1f;
}
.ss-phone-p {
  margin: 0 0 5px;
  font-size: 7.5px;
  line-height: 1.35;
  color: #3a3a3c;
}
.ss-phone-err {
  margin: 6px 0 0;
  font-size: 7px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #6e6e73;
}
.ss-phone-btn {
  display: inline-block;
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: #007aff;
  color: #fff;
  font-size: 7.5px;
  font-weight: 600;
}
.ss-phone-btn--ghost {
  background: #e8e8ed;
  color: #1d1d1f;
  margin-left: 4px;
}
.ss-phone-icon {
  width: 22px;
  height: 22px;
  margin: 2px 0 8px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}
.ss-phone-icon--danger { background: #ffe5e3; color: #c62828; }
.ss-phone-icon--alert { background: #fff3cd; color: #8a6d1b; }
.ss-phone-park {
  margin-top: 8px;
  padding: 8px;
  background: #fff;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
}
.ss-phone-park strong { display: block; font-size: 9px; margin-bottom: 3px; }
.ss-phone-hero {
  height: 42px;
  margin: 0 0 8px;
  background: linear-gradient(180deg, #d8d8de, #ececf0);
  border-radius: 4px;
}
.ss-phone-line {
  height: 5px;
  margin: 0 0 4px;
  background: #d8d8de;
  border-radius: 99px;
}
.ss-phone-line.w-70 { width: 70%; }
.ss-phone-line.w-40 { width: 40%; }
.ss-phone-spin {
  width: 16px;
  height: 16px;
  margin: 14px auto 8px;
  border: 2px solid #d8d8de;
  border-top-color: #8e8e93;
  border-radius: 50%;
}
.ss-phone-dirs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 6px;
}
.ss-phone-dir {
  padding: 5px 4px;
  background: #fff;
  border: 1px solid #e5e5ea;
  border-radius: 6px;
  font-size: 6.5px;
  font-weight: 700;
  text-align: center;
}
.ss-phone-dir span { display: block; font-weight: 600; color: #c62828; margin-top: 2px; }
`.trim();
}

function iphone(screenHtml: string, opts: { frameSrc: string; screenSrc?: string; alt: string; kind: string }): string {
  const frameSrc = escapeHtml(opts.frameSrc);
  const screenSrc = (opts.screenSrc || '').trim();
  return `<figure class="ss-phone" data-ss-exhibit="${escapeHtml(opts.kind)}">
  <div class="ss-phone-screen">${
    screenSrc
      ? `<img class="ss-phone-serp" src="${escapeHtml(screenSrc)}" alt="${escapeHtml(opts.alt)}" />`
      : screenHtml
  }</div>
  <img class="ss-phone-frame" src="${frameSrc}" alt="" width="736" height="1428" />
</figure>`;
}

function chromeBar(host: string, insecure = true): string {
  return `<div class="ss-phone-chrome">${
    insecure ? `<span class="ss-phone-lock" aria-hidden="true"></span><span class="ss-phone-warn">Not Secure</span>` : ''
  }<span class="ss-phone-host">${escapeHtml(host)}</span></div>`;
}

function sslScreen(host: string, finding: SalesSheetFinding): string {
  const expired = finding.id === 'ssl-expired' || /expir/i.test(finding.categoryLabel);
  const title = expired ? 'Your connection is not private' : 'Your connection is not private';
  const err = expired ? 'NET::ERR_CERT_DATE_INVALID' : 'NET::ERR_CERT_AUTHORITY_INVALID';
  return `${chromeBar(host)}
    <div class="ss-phone-body">
      <div class="ss-phone-icon ss-phone-icon--danger">!</div>
      <p class="ss-phone-h">${title}</p>
      <p class="ss-phone-p">Attackers might be trying to steal your information from <strong>${escapeHtml(host)}</strong> (for example, passwords, messages, or credit cards).</p>
      <p class="ss-phone-err">${err}</p>
      <span class="ss-phone-btn">Back to safety</span>
    </div>`;
}

function downScreen(host: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <p class="ss-phone-h">Safari cannot open the page</p>
      <p class="ss-phone-p">because it could not connect to the server.</p>
      <p class="ss-phone-err">ERR_CONNECTION_REFUSED</p>
    </div>`;
}

function domainScreen(host: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <p class="ss-phone-h">This site can’t be reached</p>
      <p class="ss-phone-p"><strong>${escapeHtml(host)}</strong>’s server IP address could not be found.</p>
      <p class="ss-phone-err">DNS_PROBE_FINISHED_NXDOMAIN</p>
    </div>`;
}

function malwareScreen(host: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <div class="ss-phone-icon ss-phone-icon--danger">!</div>
      <p class="ss-phone-h">Deceptive site ahead</p>
      <p class="ss-phone-p">Attackers on <strong>${escapeHtml(host)}</strong> may trick you into doing something dangerous like installing software or revealing personal information.</p>
      <span class="ss-phone-btn">Back to safety</span>
    </div>`;
}

function parkedScreen(host: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <div class="ss-phone-park">
        <strong>This domain is for sale</strong>
        <p class="ss-phone-p">${escapeHtml(host)} is parked. The business site is not here.</p>
      </div>
    </div>`;
}

function speedScreen(host: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <div class="ss-phone-spin" aria-hidden="true"></div>
      <p class="ss-phone-h">Still loading…</p>
      <p class="ss-phone-p">This homepage is taking more than five seconds on a phone. Most people leave.</p>
      <p class="ss-phone-err">LCP &gt; 5s</p>
    </div>`;
}

function noOfferScreen(host: string, name: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <div class="ss-phone-hero"></div>
      <p class="ss-phone-h">Welcome</p>
      <div class="ss-phone-line"></div>
      <div class="ss-phone-line w-70"></div>
      <div class="ss-phone-line w-40"></div>
      <p class="ss-phone-p">${escapeHtml(name)}’s homepage does not say what to do next. No offer. No button.</p>
    </div>`;
}

function directoriesScreen(host: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <p class="ss-phone-h">Directory coverage</p>
      <div class="ss-phone-dirs">
        <div class="ss-phone-dir">Yelp<span>Missing</span></div>
        <div class="ss-phone-dir">Bing<span>Missing</span></div>
        <div class="ss-phone-dir">Apple<span>Missing</span></div>
        <div class="ss-phone-dir">Maps<span>Thin</span></div>
      </div>
    </div>`;
}

function genericScreen(host: string, finding: SalesSheetFinding): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <div class="ss-phone-icon ss-phone-icon--alert">!</div>
      <p class="ss-phone-h">${escapeHtml(finding.categoryLabel)}</p>
      <p class="ss-phone-p">${escapeHtml(finding.problem)}</p>
    </div>`;
}

function screenFor(kind: SalesSheetExhibitKind, finding: SalesSheetFinding, host: string, name: string): string {
  switch (kind) {
    case 'ssl':
      return sslScreen(host, finding);
    case 'site-down':
      return downScreen(host);
    case 'domain':
      return domainScreen(host);
    case 'malware':
      return malwareScreen(host);
    case 'parked':
      return parkedScreen(host);
    case 'speed':
      return speedScreen(host);
    case 'no-offer':
      return noOfferScreen(host, name);
    case 'directories':
      return directoriesScreen(host);
    default:
      return genericScreen(host, finding);
  }
}

export function renderFindingPhoneHtml(finding: SalesSheetFinding, opts: SalesSheetExhibitOpts = {}): string {
  const kind = salesSheetExhibitKind(finding);
  const host = auditHost(opts.website || '');
  const name = (opts.businessName || '').trim() || host;
  const frameSrc = (opts.frameSrc || IPHONE_FRAME_SRC).trim() || IPHONE_FRAME_SRC;
  const screen = screenFor(kind, finding, host, name);
  return iphone(screen, {
    frameSrc,
    screenSrc: kind === 'ssl' ? '' : opts.screenSrc,
    alt: `${finding.categoryLabel} on ${host}`,
    kind,
  });
}

function formatGrade(grade: LetterGrade | null, score?: number | null): string {
  if (!grade) return '—';
  if (score != null && Number.isFinite(score)) return `${grade} (${score})`;
  return grade;
}

export function renderSalesSheetFrontExhibitsHtml(opts: {
  findings: SalesSheetFinding[];
  phones: string[];
  snapshot: SalesSheetSnapshot;
}): string {
  const items = opts.findings.slice(0, 4);
  const cells = items
    .map((finding, i) => {
      const phone = opts.phones[i] || '';
      return `<article class="ss-exhibit" data-ss-finding="${escapeHtml(finding.id)}">
  ${phone}
  <p class="ss-exhibit-kicker">${i + 1} · ${escapeHtml(finding.categoryLabel)}</p>
  <p class="ss-exhibit-copy">${escapeHtml(finding.problem)}</p>
</article>`;
    })
    .join('');
  const snap = opts.snapshot;
  return `
<style>
${iphoneCss()}
.ss-front {
  display: flex;
  flex-direction: column;
  gap: 0.55em;
  min-height: 0;
  height: 100%;
}
.ss-exhibits {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(${Math.max(1, items.length)}, minmax(0, 1fr));
  gap: 0 1.6%;
  align-items: start;
}
.ss-exhibit {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ss-exhibit-kicker {
  margin: 0 0 0.2em;
  font-size: clamp(8px, 1.15cqi, 10px);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b6b6b;
}
.ss-exhibit-copy {
  margin: 0;
  font-size: clamp(8px, 1.2cqi, 11px);
  line-height: 1.35;
  color: #1d1d1f;
}
.ss-front-snap {
  margin: 0;
  padding-top: 0.35em;
  font-size: clamp(8px, 1.1cqi, 10px);
  color: #6b6b6b;
}
.ss-front-snap strong { color: #141414; font-weight: 700; }
.doc-onepager-cols:has(.ss-front) {
  grid-template-columns: 1fr;
  gap: 0;
  overflow: visible;
}
.doc-onepager-col:has(.ss-front) {
  overflow: visible;
  padding-left: 0;
  border-left: none;
}
.doc-onepager:has(.ss-front) .doc-onepager-cols {
  flex: 1 1 auto;
}
</style>
<div class="ss-front">
  <div class="ss-exhibits">${cells}</div>
  <p class="ss-front-snap">
    <strong>Snapshot</strong>
    · Overall ${escapeHtml(formatGrade(snap.overall, snap.overallScore))}
    · Performance ${escapeHtml(formatGrade(snap.performance))}
    · Security ${escapeHtml(formatGrade(snap.security))}
    · Visibility ${escapeHtml(formatGrade(snap.visibility))}
  </p>
</div>`.trim();
}

export function replaceOnePagerColsInner(sheetHtml: string, innerHtml: string): string {
  const open = '<div class="doc-onepager-cols">';
  const at = sheetHtml.indexOf(open);
  if (at < 0) return sheetHtml;
  let i = at + open.length;
  let depth = 1;
  while (i < sheetHtml.length && depth > 0) {
    const nextOpen = sheetHtml.indexOf('<div', i);
    const nextClose = sheetHtml.indexOf('</div>', i);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      if (depth === 0) {
        return `${sheetHtml.slice(0, at + open.length)}${innerHtml}${sheetHtml.slice(nextClose)}`;
      }
      i = nextClose + 6;
    }
  }
  return sheetHtml;
}
