/**
 * Front-of-sheet exhibits — one iPhone screen per cascade hit.
 * Identify and display. No next-step copy.
 */
import { NO_LOGO_FOUND_HTML } from './clientLogoCopy';
import { escapeHtml } from './htmlEscape';
import {
  directoryIconSrc,
  directoryShortLabel,
  directorySlugsForGroup,
  isDirectoryCoverageFinding,
  listedDirectorySlugs,
  verdictsFromListed,
  type DirectoryCheck,
  type DirectoryVerdict,
} from './salesSheetDirectories';
import { IPHONE_FRAME_SRC, isPlacesMissFinding } from './salesSheetPlacesView';
import { dummyPsiMobile, renderPsiMobileHtml, type PsiMobileCard } from './salesSheetPsi';
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
  | 'private-relay'
  | 'generic';

export type SalesSheetExhibitOpts = {
  website?: string;
  businessName?: string;
  frameSrc?: string;
  /** Live screenshot (data URL) for this screen when we captured one. */
  screenSrc?: string;
  /** Live Google Places / Maps match — drives the Maps tile. */
  googlePlacesListed?: boolean | null;
  /** Extra audit notes used to mark Yelp / Bing / Apple / etc. */
  directoryNotes?: string;
  /** Explicit listed directory slugs (fixture / query override). */
  listedDirectories?: readonly string[];
  /** Live site-link + name-search verdicts for the industry icon group. */
  directoryChecks?: DirectoryCheck[];
  /** Which 24-icon pack to draw. Only `general` ships today. */
  directoryIconGroup?: string | null;
  /** Live PageSpeed Insights mobile card for the Site Speed exhibit. */
  psi?: PsiMobileCard;
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
  if (id === 'directories' || id === 'listings-thin') return 'directories';
  if (isPlacesMissFinding(finding) || id === 'places-not-listed' || id === 'gbp-unclaimed') return 'places';
  if (id === 'security-headers' || id === 'security-harden' || /mixed-content|private-relay/.test(id)) {
    return 'private-relay';
  }
  const label = finding.categoryLabel.toLowerCase();
  if (label === 'ssl' || label.includes('certificate')) return 'ssl';
  if (label.includes('site down') || label === 'down') return 'site-down';
  if (label.includes('director')) return 'directories';
  if (label.includes('offer')) return 'no-offer';
  if (label.includes('speed')) return 'speed';
  if (label.includes('share card') || label.includes('open graph')) return 'share-cards';
  if (label === 'security' || label.includes('security header') || label.includes('mixed content')) {
    return 'private-relay';
  }
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
.ss-phone-screen:not(:has(.ss-phone-serp)) {
  display: flex;
  flex-direction: column;
}
.ss-phone-screen:not(:has(.ss-phone-serp))::before {
  content: '';
  display: block;
  flex: 0 0 var(--ss-island-pad);
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
  flex: 0 0 auto;
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
.ss-phone-body:has(.ss-phone-dirs) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
  padding: 0 5px 8%;
}
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
.ss-relay {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f2f2f7;
}
.ss-relay-main {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18% 11px 8px;
  text-align: center;
}
.ss-relay-shield {
  width: 36px;
  height: 36px;
  margin: 0 0 10px;
  color: #8e8e93;
}
.ss-relay-shield svg { display: block; width: 100%; height: 100%; }
.ss-relay-h {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: #3a3a3c;
}
.ss-relay-p {
  margin: 0 0 14px;
  font-size: 7px;
  font-weight: 400;
  line-height: 1.4;
  color: #6e6e73;
}
.ss-relay-links {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin: 0;
  font-size: 7.5px;
  font-weight: 500;
  color: #007aff;
}
.ss-relay-safari {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 8px 11%;
  background: linear-gradient(#ececf1, #d8d8de);
}
.ss-relay-round {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  color: #3a3a3c;
  display: grid;
  place-items: center;
}
.ss-relay-round svg { width: 8px; height: 8px; display: block; }
.ss-relay-url {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 6px;
  background: #d1d1d6;
  border-radius: 999px;
  color: #1d1d1f;
  font-size: 7px;
  font-weight: 600;
}
.ss-relay-url em {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
  text-align: center;
}
.ss-relay-url svg { flex: 0 0 auto; width: 7px; height: 7px; color: #6e6e73; }
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
.ss-phone-body.ss-psi {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 7px 6%;
  background: #fff;
  font-family: Roboto, Inter, 'Helvetica Neue', sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-psi-brand {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 2px;
  font-size: 7px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: #202124;
}
.ss-psi-mark {
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
  display: block;
}
.ss-psi-url {
  margin: 0 0 3px;
  font-size: 6px;
  font-weight: 500;
  color: #5f6368;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-psi-tabs {
  display: flex;
  gap: 10px;
  margin: 0 0 6px;
  border-bottom: 0.5px solid #e8eaed;
}
.ss-psi-tabs span {
  padding: 0 0 3px;
  font-size: 6.5px;
  font-weight: 500;
  color: #5f6368;
}
.ss-psi-tabs .is-on {
  color: #1a73e8;
  font-weight: 600;
  box-shadow: inset 0 -1.5px 0 #1a73e8;
}
.ss-psi-perf {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 0 4px;
}
.ss-psi-perf span,
.ss-psi-cat span {
  margin-top: 1px;
  font-size: 5.5px;
  font-weight: 500;
  color: #3c4043;
  text-align: center;
  line-height: 1.15;
}
.ss-psi-gauge { display: block; }
.ss-psi-gauge--lg { width: 52px; height: 52px; }
.ss-psi-gauge--sm { width: 28px; height: 28px; }
.ss-psi-gauge text { font-family: Roboto, Inter, sans-serif; }
.ss-psi-cats {
  display: flex;
  justify-content: space-between;
  gap: 2px;
  margin: 0 0 6px;
}
.ss-psi-cat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.ss-psi-block { margin: 0 0 4px; }
.ss-psi-h {
  margin: 0 0 3px;
  font-size: 6.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: #202124;
  line-height: 1.2;
}
.ss-psi-cwv {
  margin: 0 0 3px;
  font-size: 5.5px;
  font-weight: 400;
  color: #5f6368;
}
.ss-psi-cwv strong { color: #202124; font-weight: 500; }
.ss-psi-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 3px;
  padding: 2px 0;
  border-top: 0.4px solid #f1f3f4;
}
.ss-psi-row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 5.4px;
  font-weight: 400;
  color: #3c4043;
}
.ss-psi-row-val {
  font-size: 5.5px;
  font-weight: 500;
  white-space: nowrap;
}
.ss-psi-pill {
  padding: 0.5px 3px;
  border-radius: 99px;
  color: #fff;
  font-size: 4.4px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.3;
  white-space: nowrap;
}
.ss-phone-dirs {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(7, minmax(0, 1fr));
  gap: 3px 4px;
  margin: 0;
  padding: 1px 0 0;
  overflow: visible;
}
.ss-phone-dir {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  background: transparent;
  overflow: visible;
}
.ss-phone-dir-mark {
  position: relative;
  width: 84%;
  aspect-ratio: 1;
  flex: 0 0 auto;
}
.ss-phone-dir-icon {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 22.37%;
  overflow: hidden;
  background: #d8d8de;
}
.ss-phone-dir-icon img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ss-phone-dir-name {
  display: block;
  width: 100%;
  margin-top: 1.5px;
  font-size: 4.6px;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: #1d1d1f;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-phone-dir-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  z-index: 2;
  width: 11px;
  height: 11px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  box-shadow: 0 0 0 1.15px #fff;
}
.ss-phone-dir-badge svg {
  display: block;
  width: 6.5px;
  height: 6.5px;
}
.ss-phone-dir-badge--ok { background: #34c759; }
.ss-phone-dir-badge--half { background: #ff9f0a; }
.ss-phone-dir-badge--miss { background: #ff3b30; }
.ss-exhibit-legend {
  display: flex;
  flex-direction: column;
  gap: 0.28em;
  margin: 0;
}
.ss-exhibit-legend-row {
  display: flex;
  align-items: center;
  gap: 0.4em;
  margin: 0;
  font-size: clamp(8px, 1.2cqi, 11px);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: #1d1d1f;
}
.ss-exhibit-legend-dot {
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
}
.ss-exhibit-legend-dot svg {
  display: block;
  width: 7px;
  height: 7px;
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

function speedScreen(host: string, opts: SalesSheetExhibitOpts): string {
  const card = opts.psi || dummyPsiMobile(host);
  return `${chromeBar(host, false)}
    ${renderPsiMobileHtml(card)}`;
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

const DIR_BADGE: Record<DirectoryVerdict, string> = {
  pass: '<!-- IOS_ICONS.check — keep in sync with public/admin/admin-ui.js --><span class="ss-phone-dir-badge ss-phone-dir-badge--ok" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>',
  half: '<span class="ss-phone-dir-badge ss-phone-dir-badge--half" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg></span>',
  fail: '<!-- IOS_ICONS.x — keep in sync with public/admin/admin-ui.js --><span class="ss-phone-dir-badge ss-phone-dir-badge--miss" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>',
};

function directoryTileHtml(check: DirectoryCheck): string {
  const label = escapeHtml(directoryShortLabel(check.slug));
  const mark = `<span class="ss-phone-dir-mark"><span class="ss-phone-dir-icon"><img src="${escapeHtml(directoryIconSrc(check.slug))}" alt="${label}" width="72" height="72" /></span>${DIR_BADGE[check.verdict]}</span>`;
  return `<div class="ss-phone-dir ss-phone-dir--${check.verdict}" data-dir="${check.slug}" data-verdict="${check.verdict}" title="${escapeHtml(check.title)}">${mark}<span class="ss-phone-dir-name">${label}</span></div>`;
}

const DIR_LEGEND = [
  { verdict: 'pass' as const, text: 'Linked from the website' },
  { verdict: 'half' as const, text: 'Found, not linked' },
  { verdict: 'fail' as const, text: 'No matching profile' },
];

function directoryLegendHtml(): string {
  const dots: Record<DirectoryVerdict, string> = {
    pass: '<!-- IOS_ICONS.check — keep in sync with public/admin/admin-ui.js --><span class="ss-exhibit-legend-dot ss-phone-dir-badge--ok" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>',
    half: '<span class="ss-exhibit-legend-dot ss-phone-dir-badge--half" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg></span>',
    fail: '<!-- IOS_ICONS.x — keep in sync with public/admin/admin-ui.js --><span class="ss-exhibit-legend-dot ss-phone-dir-badge--miss" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>',
  };
  return `<div class="ss-exhibit-legend">${DIR_LEGEND.map(
    (row) =>
      `<p class="ss-exhibit-legend-row">${dots[row.verdict]}<span>${escapeHtml(row.text)}</span></p>`,
  ).join('')}</div>`;
}

function directoriesScreen(_host: string, finding: SalesSheetFinding, opts: SalesSheetExhibitOpts): string {
  const slugs = directorySlugsForGroup(opts.directoryIconGroup);
  const checks =
    opts.directoryChecks?.length === slugs.length
      ? opts.directoryChecks
      : verdictsFromListed(
          listedDirectorySlugs({
            text: [finding.problem, finding.solution, opts.directoryNotes].filter(Boolean).join('\n'),
            googlePlacesListed: opts.googlePlacesListed,
            listed: opts.listedDirectories,
          }),
          slugs,
        );
  return `<div class="ss-phone-body">
      <div class="ss-phone-dirs" data-icon-group="${escapeHtml(opts.directoryIconGroup || 'general')}">${checks.map(directoryTileHtml).join('')}</div>
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

const RELAY_SHIELD =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6c10 6 18 7 24 7v18c0 16-10 26-24 31C18 57 8 47 8 31V13c6 0 14-1 24-7z" fill="#c7c7cc"/><path d="M32 16 46 42H18L32 16z" fill="#ff9f0a"/><path d="M32 16 46 42H18L32 16z" fill="none" stroke="#ff9f0a" stroke-width="1"/><rect x="30.4" y="26" width="3.2" height="10" rx="1.2" fill="#1d1d1f"/><circle cx="32" cy="40" r="1.7" fill="#1d1d1f"/></svg>';

function privateRelayScreen(host: string): string {
  return `<div class="ss-relay">
  <div class="ss-relay-main">
    <div class="ss-relay-shield">${RELAY_SHIELD}</div>
    <p class="ss-relay-h">This Connection Is Not Private</p>
    <p class="ss-relay-p">iCloud Private Relay is unable to hide your IP address from this site. By continuing to ‘${escapeHtml(host)}’ your IP address will be revealed.</p>
    <p class="ss-relay-links"><span>Show IP Address</span><span>Go Back</span></p>
  </div>
  <div class="ss-relay-safari">
    <span class="ss-relay-round" aria-hidden="true"><!-- IOS_ICONS.chevron-left — keep in sync with public/admin/admin-ui.js --><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></span>
    <div class="ss-relay-url">
      <em>${escapeHtml(host)}</em>
      <!-- IOS_ICONS.refresh — keep in sync with public/admin/admin-ui.js -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
    </div>
    <span class="ss-relay-round" aria-hidden="true"><!-- IOS_ICONS.more — keep in sync with public/admin/admin-ui.js --><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></span>
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

function screenFor(
  kind: SalesSheetExhibitKind,
  finding: SalesSheetFinding,
  host: string,
  name: string,
  opts: SalesSheetExhibitOpts,
): string {
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
      return speedScreen(host, opts);
    case 'no-offer':
      return noOfferScreen(host, name);
    case 'directories':
      return directoriesScreen(host, finding, opts);
    case 'share-cards':
      return shareCardsScreen(host, name);
    case 'private-relay':
      return privateRelayScreen(host);
    default:
      return genericScreen(host, finding);
  }
}

export function renderFindingPhoneHtml(finding: SalesSheetFinding, opts: SalesSheetExhibitOpts = {}): string {
  const kind = salesSheetExhibitKind(finding);
  const host = auditHost(opts.website || '');
  const name = (opts.businessName || '').trim() || host;
  const frameSrc = (opts.frameSrc || IPHONE_FRAME_SRC).trim() || IPHONE_FRAME_SRC;
  const screen = screenFor(kind, finding, host, name, opts);
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
  grid-column: 1 / -1;
  grid-row: 1;
  justify-self: center;
  width: max-content;
  max-width: 58%;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  z-index: 1;
  color: #141414;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.doc-onepager-header:has(.ss-hero) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: flex-start;
  gap: 2.2%;
}
.doc-onepager-header:has(.ss-hero) .doc-onepager-logo {
  grid-column: 1;
  grid-row: 1;
  max-width: 22%;
  justify-self: start;
  align-self: flex-start;
  margin-top: -2px;
  z-index: 2;
}
.doc-onepager-header:has(.ss-hero) .doc-onepager-mast {
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  z-index: 2;
}
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
.ss-hero-copy {
  flex: 0 0 auto;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  text-align: left;
}
.ss-hero-h {
  margin: 0 0 0.28em;
  font-size: clamp(10px, 1.45cqi, 13px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
  color: #141414;
  text-align: left;
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

/** IOS_ICONS.image — keep in sync with public/admin/admin-ui.js */
const MISSING_IMAGE_ICON =
  '<!-- IOS_ICONS.image — keep in sync with public/admin/admin-ui.js --><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';

export function salesSheetClientLogoHtml(opts: { src?: string; name?: string } = {}): string {
  const src = (opts.src || '').trim();
  const name = (opts.name || 'Client').trim() || 'Client';
  if (src) {
    return `<img class="doc-onepager-logo-img" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" />`;
  }
  return `<style>
.ss-missing-logo {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  color: #3a3a3c;
}
.ss-missing-logo-icon {
  flex: 0 0 auto;
  display: flex;
  color: #8e8e93;
  margin-top: 1px;
}
.ss-missing-logo-icon svg {
  display: block;
  width: 22px;
  height: 22px;
}
.ss-missing-logo-copy {
  margin: 0;
  min-width: 0;
  font-size: clamp(7px, 1.05cqi, 9px);
  font-weight: 400;
  line-height: 1.35;
  color: #6b6b6b;
}
.ss-missing-logo-copy strong {
  display: block;
  margin-bottom: 2px;
  font-size: clamp(8px, 1.15cqi, 10px);
  font-weight: 700;
  color: #3a3a3c;
}
</style><div class="ss-missing-logo"><span class="ss-missing-logo-icon">${MISSING_IMAGE_ICON}</span><p class="ss-missing-logo-copy">${NO_LOGO_FOUND_HTML}</p></div>`;
}

export function replaceOnePagerLogo(sheetHtml: string, logoHtml: string): string {
  if (!logoHtml.trim()) return sheetHtml;
  return sheetHtml.replace(
    /(<div class="doc-onepager-logo">)[\s\S]*?(<\/div>)/,
    `$1${logoHtml}$2`,
  );
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
      const caption = isDirectoryCoverageFinding(finding)
        ? directoryLegendHtml()
        : `<p class="ss-exhibit-copy">${escapeHtml(finding.problem)}</p>`;
      return `<article class="ss-exhibit" data-ss-finding="${escapeHtml(finding.id)}">
  ${phone}
  <p class="ss-exhibit-kicker">${escapeHtml(finding.categoryLabel)}</p>
  ${caption}
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
  padding: 0.16em 0.4em 0.16em 0.28em;
  width: fit-content;
  max-width: 100%;
  font-size: clamp(8px, 1.15cqi, 10px);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b6b6b;
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 4px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
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
