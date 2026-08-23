/**
 * Front-of-sheet exhibits — one iPhone screen per cascade hit.
 * Identify and display. No next-step copy.
 */
import { escapeHtml } from './htmlEscape';
import { IPHONE_FRAME_SRC, isPlacesMissFinding } from './salesSheetPlacesView';
import type { LetterGrade } from './auditReportCard';
import type { SalesSheetFinding, SalesSheetHeroStat } from './auditSalesSheet';

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
  | 'share-cards'
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
  if (id === 'no-og-image' || id === 'dummy-seo' || id === 'share-cards' || /og-image|share-card/.test(id)) {
    return 'share-cards';
  }
  if (id === 'directories') return 'directories';
  if (isPlacesMissFinding(finding) || id === 'places-not-listed' || id === 'gbp-unclaimed') return 'places';
  const label = finding.categoryLabel.toLowerCase();
  if (label === 'ssl' || label.includes('certificate')) return 'ssl';
  if (label.includes('site down') || label === 'down') return 'site-down';
  if (label.includes('director')) return 'directories';
  if (label.includes('offer')) return 'no-offer';
  if (label.includes('speed')) return 'speed';
  if (label.includes('share card') || label.includes('open graph')) return 'share-cards';
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
  position: relative;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--dir-bg);
  overflow: hidden;
}
.ss-phone-dir-icon {
  display: block;
  width: 50%;
  height: 50%;
}
.ss-phone-dir-icon svg {
  display: block;
  width: 100%;
  height: 100%;
  fill: #fff;
}
.ss-phone-dir-x {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  pointer-events: none;
}
.ss-phone-dir-x svg {
  width: 46%;
  height: 46%;
  filter: drop-shadow(0 0 1.2px #000);
}
.ss-og {
  display: flex;
  flex-direction: column;
  height: calc(100% - var(--ss-island-pad));
  min-height: 0;
  background: #fff;
}
.ss-og-app {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ss-og-sms { background: #fff; }
.ss-og-sms-bar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px 3px;
  border-bottom: 0.5px solid #d8d8de;
}
.ss-og-chev {
  flex: 0 0 auto;
  color: #007aff;
  font-size: 8px;
  font-weight: 500;
  line-height: 1;
  margin-right: 1px;
}
.ss-og-sms-av {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #c7c7cc;
}
.ss-og-sms-bar strong {
  display: block;
  font-size: 6.5px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: #1d1d1f;
}
.ss-og-sms-bar em {
  display: block;
  font-size: 4.5px;
  font-style: normal;
  font-weight: 500;
  color: #8e8e93;
}
.ss-og-sms-thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px 5px 4px;
  min-height: 0;
}
.ss-og-time {
  align-self: center;
  margin: 0 0 3px;
  font-size: 4.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #8e8e93;
}
.ss-og-sms-bubble {
  max-width: 92%;
  padding: 4px 7px;
  background: #007aff;
  color: #fff;
  border-radius: 14px 14px 4px 14px;
  font-size: 6px;
  font-weight: 400;
  line-height: 1.25;
  word-break: break-all;
}
.ss-og-sms-meta {
  margin: 1px 1px 0 0;
  font-size: 4.5px;
  font-weight: 600;
  color: #8e8e93;
}
.ss-og-fb { background: #fff; border-top: 0.5px solid #ccd0d5; }
.ss-og-fb-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px 2px;
  background: #fff;
}
.ss-og-fb-word {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1;
  color: #0866ff;
  font-family: Helvetica, Arial, 'Segoe UI', sans-serif;
}
.ss-og-fb-tools { display: flex; gap: 3px; }
.ss-og-fb-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #e4e6eb;
}
.ss-og-fb-post {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 3px 6px 3px;
  background: #fff;
  min-height: 0;
}
.ss-og-fb-who {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
}
.ss-og-fb-av {
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #1877f2;
  color: #fff;
  font-size: 5.5px;
  font-weight: 700;
  display: grid;
  place-items: center;
  line-height: 1;
}
.ss-og-fb-who strong {
  display: block;
  font-size: 6px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #050505;
  line-height: 1.15;
}
.ss-og-fb-who em {
  display: block;
  font-size: 4.5px;
  font-style: normal;
  font-weight: 500;
  color: #65676b;
}
.ss-og-fb-link {
  margin: 0;
  font-size: 6px;
  font-weight: 400;
  line-height: 1.3;
  color: #0866ff;
  word-break: break-all;
}
.ss-og-fb-actions {
  margin-top: auto;
  padding-top: 3px;
  border-top: 0.5px solid #e4e6eb;
  display: flex;
  justify-content: space-between;
  font-size: 5px;
  font-weight: 600;
  color: #65676b;
}
.ss-og-ig { background: #fff; border-top: 0.5px solid #dbdbdb; }
.ss-og-ig-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px;
  border-bottom: 0.5px solid #dbdbdb;
}
.ss-og-ig-icon {
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
}
.ss-og-ig-icon svg { width: 11px; height: 11px; display: block; }
.ss-og-ig-bar strong {
  display: block;
  font-size: 6.5px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #000;
  line-height: 1.1;
}
.ss-og-ig-bar em {
  display: block;
  font-size: 4.5px;
  font-style: normal;
  font-weight: 500;
  color: #8e8e8e;
}
.ss-og-ig-thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px 6px 4px;
  min-height: 0;
  background: #fff;
}
.ss-og-ig-bubble {
  max-width: 92%;
  padding: 4px 8px;
  background: #3797f0;
  color: #fff;
  border-radius: 18px;
  font-size: 6px;
  font-weight: 400;
  line-height: 1.25;
  word-break: break-all;
}
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

const DIR_X_ICON =
  '<!-- IOS_ICONS.x — keep in sync with public/admin/admin-ui.js -->' +
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/** Simple Icons marks — fill is forced white on the brand tile. */
const DIR_TILES = [
  {
    slug: 'yelp',
    name: 'Yelp',
    bg: '#FF1A1A',
    missing: true,
    path: 'm7.6885 15.1415-3.6715.8483c-.3769.0871-.755.183-1.1452.155-.2611-.0188-.5122-.0414-.7606-.213a1.179 1.179 0 0 1-.331-.3594c-.3486-.5519-.3656-1.3661-.3697-2.0004a6.2874 6.2874 0 0 1 .3314-2.0642 1.857 1.857 0 0 1 .1073-.2474 2.3426 2.3426 0 0 1 .1255-.2165 2.4572 2.4572 0 0 1 .1563-.1975 1.1736 1.1736 0 0 1 .399-.2831 1.082 1.082 0 0 1 .4592-.0837c.2355.0016.5139.052.91.1734.0555.0191.1237.0382.1856.0572.3277.1013.7048.2404 1.1499.3987.6863.2404 1.3663.487 2.0463.7397l1.2117.4423c.2217.0807.4363.18.6412.297.174.0984.3273.2298.4512.387a1.217 1.217 0 0 1 .192.4309 1.2205 1.2205 0 0 1-.872 1.4522c-.0468.0151-.0852.0239-.1085.0293l-1.105.2553zM18.8208 7.565a1.8506 1.8506 0 0 0-.2042-.1754 2.4082 2.4082 0 0 0-.2077-.1394 2.3607 2.3607 0 0 0-.2269-.109 1.1705 1.1705 0 0 0-.482-.0796 1.0862 1.0862 0 0 0-.4498.1263c-.2107.1048-.4388.2732-.742.5551-.042.0417-.0947.0886-.142.133-.2502.2351-.5286.5252-.8599.863a114.6363 114.6363 0 0 0-1.5166 1.5629l-.8962.9293a4.1897 4.1897 0 0 0-.4466.5483 1.541 1.541 0 0 0-.2364.5459 1.2199 1.2199 0 0 0 .0107.4518 1.218 1.218 0 0 0 1.4184.923 1.162 1.162 0 0 0 .1105-.0213l4.7781-1.104c.3766-.087.7587-.1667 1.097-.3631.2269-.1316.4428-.262.5909-.5252a1.1793 1.1793 0 0 0 .1405-.4683c.0733-.6512-.2668-1.3908-.5403-1.963a6.2792 6.2792 0 0 0-1.2001-1.7103zM8.9703.0754a8.6724 8.6724 0 0 0-.83.1564c-.2754.066-.548.1383-.8146.2236-.868.2844-2.0884.8063-2.295 1.8065-.1165.5655.1595 1.1439.3737 1.66.2595.6254.614 1.1889.9373 1.7777.8543 1.5545 1.7245 3.0993 2.5922 4.6457.259.4617.5416 1.0464 1.043 1.2856a1.058 1.058 0 0 0 .1013.0383c.2248.0851.4699.1016.7041.0471a1.2136 1.2136 0 0 0 .5658-.3397 1.1033 1.1033 0 0 0 .079-.0822c.3463-.435.3454-1.0833.3764-1.6134.1042-1.771.2139-3.5423.3009-5.3142.0332-.6712.1055-1.3333.0655-2.0096-.0328-.5579-.0368-1.1984-.3891-1.6563-.6218-.8073-1.9476-.741-2.8523-.6158zm2.084 15.9505a1.1053 1.1053 0 0 0-1.2306-.4145 1.1398 1.1398 0 0 0-.1526.0633 1.4806 1.4806 0 0 0-.2171.1354c-.1992.1475-.3668.3392-.5196.5315-.0386.049-.074.1143-.12.1562l-.7686 1.0573a113.9168 113.9168 0 0 0-1.2913 1.789c-.278.3895-.5184.7184-.7083 1.0094-.036.0547-.0734.116-.1075.1647-.2277.3522-.3566.6092-.4228.8381a1.0945 1.0945 0 0 0-.046.4721c.0211.1655.0768.3246.1635.467.046.0715.0957.1406.1487.207a2.334 2.334 0 0 0 .1754.1825 1.843 1.843 0 0 0 .2108.1732c.5304.369 1.1112.6342 1.722.8391a6.0958 6.0958 0 0 0 1.5716.3004c.091.0046.1821.0025.2728-.006a2.3878 2.3878 0 0 0 .2506-.0351 2.3862 2.3862 0 0 0 .2447-.071 1.1927 1.1927 0 0 0 .4175-.2658c.1127-.113.1994-.249.2541-.3989.0889-.2214.1473-.5026.1857-.92.0034-.0593.0118-.1305.0177-.1958.0304-.3463.0443-.7531.0666-1.2315.0375-.7357.067-1.4681.0903-2.2026.0495-1.3053.0494-1.306.0113-.3008.002-.6342-.0814-.9336a1.396 1.396 0 0 0-.1756-.4054zm8.6754 2.0439c-.1605-.176-.3878-.3514-.7462-.5682-.0518-.0288-.1124-.0674-.1684-.1009-.2985-.1795-.658-.3684-1.078-.5965a120.7615 120.7615 0 0 0-1.9427-1.042l-1.1515-.6107c-.0597-.0175-.1203-.0607-.1766-.0878-.2212-.1058-.4558-.2045-.6992-.2498a1.4915 1.4915 0 0 0-.2545-.0265 1.1527 1.1527 0 0 0-.1648.01 1.1077 1.1077 0 0 0-.9227.9133 1.4186 1.4186 0 0 0 .0159.439c.0563.3065.1932.6096.3346.875l.615 1.1526c.3422.65.6884 1.2963 1.0435 1.9406.229.4202.4196.7799.5982 1.078.0338.056.0721.1163.1011.1682.2173.3584.392.584.569.7458.1146.1107.252.195.4026.247.1583.0525.326.071.4919.0546a2.368 2.368 0 0 0 .251-.0435c.0817-.022.1622-.048.241-.0784a1.863 1.863 0 0 0 .2475-.1143 6.1018 6.1018 0 0 0 1.2818-.9597c.4596-.4522.8659-.9454 1.182-1.51.044-.08.0819-.163.1138-.2483a2.49 2.49 0 0 0 .0773-.2411c.0186-.083.033-.1669.0429-.2513a1.188 1.188 0 0 0-.0565-.491 1.0933 1.0933 0 0 0-.248-.4041z',
  },
  {
    slug: 'bing',
    name: 'Bing',
    bg: '#00809D',
    missing: true,
    path: 'M5.71 3.277 15.114 0v7.663l-3.299 2.4L5.71 3.277zm.213 16.276 6.096-5.347 2.882 2.266v7.55L5.923 19.553zm.427-10.093 6.284 2.757-6.284 5.409V9.46z',
  },
  {
    slug: 'apple',
    name: 'Apple',
    bg: '#111111',
    missing: true,
    path: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
  },
  {
    slug: 'googlemaps',
    name: 'Maps',
    bg: '#4285F4',
    missing: false,
    path: 'M19.527 4.799c1.212 2.608.937 5.678-.405 8.173-1.101 2.047-2.744 3.74-4.098 5.614-.619.858-1.244 1.75-1.669 2.727-.141.325-.263.658-.383.992-.121.333-.224.673-.34 1.008-.109.314-.236.684-.627.687h-.007c-.466-.001-.579-.53-.695-.887-.284-.874-.581-1.713-1.019-2.525-.51-.944-1.145-1.817-1.79-2.671L19.527 4.799zM8.545 7.705l-3.959 4.707c.724 1.54 1.821 2.863 2.871 4.18.247.31.494.622.737.936l4.984-5.925-.029.01c-1.741.601-3.691-.291-4.392-1.987a3.377 3.377 0 0 1-.209-.716c-.063-.437-.077-.761-.004-1.198l.001-.007zM5.492 3.149l-.003.004c-1.947 2.466-2.281 5.88-1.117 8.77l4.785-5.689-.058-.05-3.607-3.035zM14.661.436l-3.838 4.563a.295.295 0 0 1 .027-.01c1.6-.551 3.403.15 4.22 1.626.176.319.323.683.377 1.045.068.446.085.773.012 1.22l-.003.016 3.836-4.561A8.382 8.382 0 0 0 14.67.439l-.009-.003zM9.466 5.868 14.162.285l-.047-.012A8.31 8.31 0 0 0 11.986 0a8.439 8.439 0 0 0-6.169 2.766l-.016.018 3.665 3.084z',
  },
] as const;

function directoryTileHtml(tile: (typeof DIR_TILES)[number]): string {
  const mark = `<span class="ss-phone-dir-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${tile.path}"/></svg></span>`;
  const x = tile.missing ? `<span class="ss-phone-dir-x">${DIR_X_ICON}</span>` : '';
  return `<div class="ss-phone-dir${tile.missing ? ' ss-phone-dir--missing' : ''}" data-dir="${tile.slug}" style="--dir-bg:${tile.bg}" title="${escapeHtml(tile.name)}">${mark}${x}</div>`;
}

function directoriesScreen(host: string): string {
  return `${chromeBar(host, false)}
    <div class="ss-phone-body">
      <p class="ss-phone-h">Directory coverage</p>
      <div class="ss-phone-dirs">${DIR_TILES.map(directoryTileHtml).join('')}</div>
    </div>`;
}

function shareUrl(host: string): string {
  return host === 'this site' ? 'https://example.com' : `https://${host}`;
}

const IG_CAMERA_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="ss-og-ig-grad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f58529"/><stop offset=".5" stop-color="#dd2a7b"/><stop offset="1" stop-color="#515bd4"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ss-og-ig-grad)"/><rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.6" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="12" cy="12" r="2.9" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="16.3" cy="7.8" r="1" fill="#fff"/></svg>';

function shareCardsScreen(host: string, name: string): string {
  const url = escapeHtml(shareUrl(host));
  const initial = escapeHtml((name.trim()[0] || host[0] || 'H').toUpperCase());
  const poster = escapeHtml(name);
  return `<div class="ss-og">
  <section class="ss-og-app ss-og-sms">
    <header class="ss-og-sms-bar">
      <span class="ss-og-chev" aria-hidden="true">‹</span>
      <span class="ss-og-sms-av" aria-hidden="true"></span>
      <div><strong>Alex</strong><em>iMessage</em></div>
    </header>
    <div class="ss-og-sms-thread">
      <p class="ss-og-time">Today 2:14 PM</p>
      <div class="ss-og-sms-bubble">${url}</div>
      <p class="ss-og-sms-meta">Delivered</p>
    </div>
  </section>
  <section class="ss-og-app ss-og-fb">
    <header class="ss-og-fb-bar">
      <span class="ss-og-fb-word">facebook</span>
      <span class="ss-og-fb-tools" aria-hidden="true"><span class="ss-og-fb-dot"></span><span class="ss-og-fb-dot"></span></span>
    </header>
    <article class="ss-og-fb-post">
      <div class="ss-og-fb-who">
        <span class="ss-og-fb-av">${initial}</span>
        <div><strong>${poster}</strong><em>Just now · Public</em></div>
      </div>
      <p class="ss-og-fb-link">${url}</p>
      <p class="ss-og-fb-actions"><span>Like</span><span>Comment</span><span>Share</span></p>
    </article>
  </section>
  <section class="ss-og-app ss-og-ig">
    <header class="ss-og-ig-bar">
      <span class="ss-og-ig-icon">${IG_CAMERA_ICON}</span>
      <div><strong>alex</strong><em>Direct</em></div>
    </header>
    <div class="ss-og-ig-thread">
      <div class="ss-og-ig-bubble">${url}</div>
    </div>
  </section>
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
    case 'share-cards':
      return shareCardsScreen(host, name);
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

function gradeClass(grade: LetterGrade | null | undefined): string {
  if (!grade) return 'na';
  return grade.toLowerCase();
}

function defaultHeroStats(opts: {
  findings: SalesSheetFinding[];
  performance: LetterGrade | null;
  security: LetterGrade | null;
  visibility: LetterGrade | null;
}): SalesSheetHeroStat[] {
  const weak = [opts.performance, opts.security, opts.visibility].filter(
    (g) => g === 'D' || g === 'F',
  ).length;
  const stats: SalesSheetHeroStat[] = [];
  if (weak > 0) {
    stats.push({ label: `${weak} of 3 core grades are D or F`, tone: 'crit' });
  } else if (opts.findings.length) {
    stats.push({ label: `${opts.findings.length} issues on this sheet`, tone: 'risk' });
  }
  stats.push({ label: 'Every finding sourced from independent platforms', tone: 'info' });
  return stats;
}

export function renderSalesSheetHeaderHeroHtml(opts: {
  overall: LetterGrade | null;
  overallScore: number | null;
  headline: string;
  heroStats?: SalesSheetHeroStat[];
  findings?: SalesSheetFinding[];
  performance?: LetterGrade | null;
  security?: LetterGrade | null;
  visibility?: LetterGrade | null;
}): string {
  const headline = (opts.headline || '').trim();
  const grade = opts.overall;
  const score = opts.overallScore;
  if (!headline && !grade && score == null) return '';
  const stats = (opts.heroStats?.length
    ? opts.heroStats
    : defaultHeroStats({
        findings: opts.findings || [],
        performance: opts.performance ?? null,
        security: opts.security ?? null,
        visibility: opts.visibility ?? null,
      })
  ).slice(0, 3);
  const pct = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const r = 25;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const g = gradeClass(grade);
  const scoreLine =
    score != null && Number.isFinite(score)
      ? `<span class="ss-hero-score">${escapeHtml(String(Math.round(score)))}<span>/100</span></span>`
      : '';
  const statRows = stats
    .map(
      (s) =>
        `<li class="ss-hero-stat ss-hero-stat--${escapeHtml(s.tone)}"><span aria-hidden="true"></span>${escapeHtml(s.label)}</li>`,
    )
    .join('');
  return `
<style>
.ss-hero {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 6.4rem 0 2.6rem;
  color: #141414;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-onepager-header:has(.ss-hero) {
  align-items: center;
  gap: 2.2%;
}
.doc-onepager-header:has(.ss-hero) .doc-onepager-logo { max-width: 22%; }
.ss-hero-ring {
  position: relative;
  flex: 0 0 auto;
  width: 64px;
  text-align: center;
}
.ss-hero-ring svg {
  display: block;
  width: 64px;
  height: 64px;
  overflow: visible;
  transform: rotate(-90deg);
}
.ss-hero-ring-track { fill: none; stroke: #e4e4de; stroke-width: 4.5; }
.ss-hero-ring-fill { fill: none; stroke-width: 4.5; stroke-linecap: round; }
.ss-hero-ring-fill.g-a, .ss-hero-ring-fill.g-b { stroke: #1b7f4a; }
.ss-hero-ring-fill.g-c { stroke: #b8860b; }
.ss-hero-ring-fill.g-d { stroke: #c05621; }
.ss-hero-ring-fill.g-f, .ss-hero-ring-fill.g-na { stroke: #b42318; }
.ss-hero-ring-center {
  position: absolute;
  top: 0;
  left: 0;
  width: 64px;
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  line-height: 1;
  pointer-events: none;
}
.ss-hero-score {
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  color: #3a3a3c;
}
.ss-hero-score span { font-weight: 500; color: #8e8e93; }
.ss-hero-grade {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  color: #141414;
}
.ss-hero-grade.g-a, .ss-hero-grade.g-b { color: #1b7f4a; }
.ss-hero-grade.g-c { color: #b8860b; }
.ss-hero-grade.g-d { color: #c05621; }
.ss-hero-grade.g-f, .ss-hero-grade.g-na { color: #b42318; }
.ss-hero-ring-cap {
  margin: 2px 0 0;
  font-size: 6px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b6b6b;
}
.ss-hero-copy { min-width: 0; }
.ss-hero-h {
  margin: 0 0 0.28em;
  font-size: clamp(11px, 1.7cqi, 15px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  color: #141414;
}
.ss-hero-stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ss-hero-stat {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: clamp(7px, 1.05cqi, 9px);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #3a3a3c;
  line-height: 1.25;
}
.ss-hero-stat span {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8e8e93;
}
.ss-hero-stat--crit span { background: #b42318; }
.ss-hero-stat--risk span { background: #c05621; }
.ss-hero-stat--info span { background: #1a3d6e; }
</style>
<div class="ss-hero">
  <div class="ss-hero-ring" aria-hidden="true">
    <svg viewBox="0 0 64 64">
      <circle class="ss-hero-ring-track" cx="32" cy="32" r="${r}" />
      <circle class="ss-hero-ring-fill g-${g}" cx="32" cy="32" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" />
    </svg>
    <div class="ss-hero-ring-center">
      ${scoreLine}
      <span class="ss-hero-grade g-${g}">${escapeHtml(grade || '—')}</span>
    </div>
    <div class="ss-hero-ring-cap">Overall grade</div>
  </div>
  <div class="ss-hero-copy">
    ${headline ? `<p class="ss-hero-h">${escapeHtml(headline)}</p>` : ''}
    ${statRows ? `<ul class="ss-hero-stats">${statRows}</ul>` : ''}
  </div>
</div>`.trim();
}

export function injectAuditHeroIntoHeader(sheetHtml: string, heroHtml: string): string {
  if (!heroHtml.trim()) return sheetHtml;
  const mark = '<div class="doc-onepager-mast">';
  const at = sheetHtml.indexOf(mark);
  if (at < 0) return sheetHtml;
  return `${sheetHtml.slice(0, at)}${heroHtml}${sheetHtml.slice(at)}`;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
