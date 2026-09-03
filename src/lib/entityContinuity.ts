/**
 * Entity continuity — SEO-aligned brand graph scoring.
 *
 * Measures what search engines corroborate: consistent NAP, schema sameAs,
 * GBP ↔ website agreement, and hub-and-spoke profile links.
 */
import * as cheerio from 'cheerio';
import { isBusinessNameMatch } from './googlePlacesAutocomplete';
import { resolvePlaceDetails, type PlaceDetails } from './googlePlaceDetails';
import {
  slugFromProfileUrl,
  slugsLinkedFromHtml,
  type DirectoryCheck,
  type DirectorySlug,
} from './salesSheetDirectories';

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type NapField = 'name' | 'address' | 'phone';

export type NapSource = {
  id: 'contact' | 'schema' | 'site' | 'gbp';
  label: string;
  name?: string;
  address?: string;
  phone?: string;
};

export type NapMismatch = {
  field: NapField;
  a: { source: string; value: string };
  b: { source: string; value: string };
};

export type EntityContinuityPillar = {
  score: number;
  grade: LetterGrade;
  summary: string;
  details: string[];
};

export type EntityContinuityResult = {
  overall: { score: number; grade: LetterGrade };
  nap: EntityContinuityPillar & { sources: NapSource[]; mismatches: NapMismatch[] };
  sameAs: EntityContinuityPillar & {
    declared: string[];
    linkedFromSite: string[];
    aligned: string[];
    missingFromSite: string[];
    hasLocalBusinessSchema: boolean;
  };
  gbpSite: EntityContinuityPillar & {
    available: boolean;
    websiteMatch: boolean | null;
    nameMatch: boolean | null;
    addressMatch: boolean | null;
    phoneMatch: boolean | null;
  };
  crossLinks: EntityContinuityPillar & { checks: DirectoryCheck[] };
};

const ENTITY_JSON_LD_TYPES = new Set([
  'localbusiness',
  'organization',
  'veterinarycare',
  'medicalbusiness',
  'professionalservice',
  'store',
  'restaurant',
  'legalservice',
  'financialservice',
  'healthandbeautybusiness',
  'homeandconstructionbusiness',
  'dentist',
  'physician',
]);

const KEY_PROFILE_SLUGS: DirectorySlug[] = [
  'google',
  'apple',
  'facebook',
  'instagram',
  'linkedin',
  'yelp',
];

export function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('1') && digits.length >= 11) return digits.slice(-10);
  return digits.slice(-10);
}

export function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  return da.length >= 10 && db.length >= 10 && da === db;
}

export function normalizeAddress(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/,/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bplace\b/g, 'pl')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function addressesMatch(a: string, b: string): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const zipA = na.match(/\b\d{5}\b/)?.[0];
  const zipB = nb.match(/\b\d{5}\b/)?.[0];
  if (zipA && zipB && zipA === zipB) {
    const numA = na.match(/\b(\d{1,6})\b/)?.[1];
    const numB = nb.match(/\b(\d{1,6})\b/)?.[1];
    if (numA && numB && numA === numB) return true;
  }
  return false;
}

export function normalizeWebsiteHost(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function websitesMatch(a: string, b: string): boolean {
  const ha = normalizeWebsiteHost(a);
  const hb = normalizeWebsiteHost(b);
  return Boolean(ha && hb && ha === hb);
}

export function scoreToGrade(score: number): LetterGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export type JsonLdEntity = {
  types: string[];
  name?: string;
  address?: string;
  phone?: string;
  sameAs: string[];
};

function isEntityType(type: string): boolean {
  return ENTITY_JSON_LD_TYPES.has(type.toLowerCase().replace(/\s+/g, ''));
}

function readAddress(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const obj = value as Record<string, unknown>;
  const parts = [
    obj.streetAddress,
    obj.addressLocality,
    obj.addressRegion,
    obj.postalCode,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  return parts.join(', ');
}

function readSameAs(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim()).map((v) => v.trim());
}

function readTypes(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === 'string');
  return [];
}

function pushEntity(node: Record<string, unknown>, out: JsonLdEntity[]): void {
  const types = readTypes(node);
  if (!types.some((t) => isEntityType(t))) return;
  const name = typeof node.name === 'string' ? node.name.trim() : '';
  const address = readAddress(node.address);
  const phone =
    (typeof node.telephone === 'string' ? node.telephone.trim() : '') ||
    (typeof node.phone === 'string' ? node.phone.trim() : '');
  const sameAs = readSameAs(node.sameAs);
  out.push({ types, name, address, phone, sameAs });
}

function walkJsonLd(node: unknown, out: JsonLdEntity[], depth = 0): void {
  if (node == null || depth > 10) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  pushEntity(obj, out);
  if (obj['@graph']) walkJsonLd(obj['@graph'], out, depth + 1);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') walkJsonLd(value, out, depth + 1);
  }
}

/** Parse LocalBusiness / Organization entities from JSON-LD blocks. */
export function parseJsonLdEntities(html: string): JsonLdEntity[] {
  const $ = cheerio.load(html);
  const out: JsonLdEntity[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()?.trim();
    if (!raw) return;
    try {
      walkJsonLd(JSON.parse(raw) as unknown, out);
    } catch {
      try {
        walkJsonLd(JSON.parse(`[${raw.replace(/}\s*{/g, '},{')}]`) as unknown, out);
      } catch {
        /* invalid JSON-LD */
      }
    }
  });
  return out;
}

function extractTelFromHtml(html: string): string {
  const $ = cheerio.load(html);
  for (const sel of ['a[href^="tel:"]', '[itemprop="telephone"]']) {
    const node = $(sel).first();
    const href = node.attr('href') || '';
    const tel = href.replace(/^tel:/i, '').trim() || node.text().trim();
    if (normalizePhoneDigits(tel).length >= 10) return tel;
  }
  const textMatch = html.match(
    /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/,
  );
  return textMatch?.[0]?.trim() || '';
}

function extractVisibleAddressFromHtml(html: string): string {
  const m = html.match(
    /\d{2,5}\s+[A-Za-z0-9][\w\s.'-]{2,40}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Blvd|Way|Court|Ct|Place|Pl)[.,\s]+[A-Za-z\s.'-]+,\s*[A-Z]{2}\s+\d{5}/,
  );
  return m?.[0]?.trim() || '';
}

function mergeSchemaEntities(entities: JsonLdEntity[]): JsonLdEntity {
  const merged: JsonLdEntity = { types: [], sameAs: [] };
  for (const entity of entities) {
    merged.types.push(...entity.types);
    merged.name ||= entity.name;
    merged.address ||= entity.address;
    merged.phone ||= entity.phone;
    for (const url of entity.sameAs) {
      if (!merged.sameAs.includes(url)) merged.sameAs.push(url);
    }
  }
  return merged;
}

function fieldValues(sources: NapSource[], field: NapField): { source: string; value: string }[] {
  return sources
    .map((s) => ({ source: s.label, value: (field === 'name' ? s.name : field === 'address' ? s.address : s.phone) || '' }))
    .filter((row) => row.value.trim());
}

function fieldsMatch(field: NapField, a: string, b: string): boolean {
  if (field === 'name') return isBusinessNameMatch(a, b) || isBusinessNameMatch(b, a);
  if (field === 'address') return addressesMatch(a, b);
  return phonesMatch(a, b);
}

export function compareNapSources(sources: NapSource[]): NapMismatch[] {
  const mismatches: NapMismatch[] = [];
  for (const field of ['name', 'address', 'phone'] as const) {
    const rows = fieldValues(sources, field);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const left = rows[i]!;
        const right = rows[j]!;
        if (!fieldsMatch(field, left.value, right.value)) {
          mismatches.push({
            field,
            a: left,
            b: right,
          });
        }
      }
    }
  }
  return mismatches;
}

function scoreNapPillar(sources: NapSource[], mismatches: NapMismatch[]): EntityContinuityPillar & {
  sources: NapSource[];
  mismatches: NapMismatch[];
} {
  const populated = sources.filter((s) => s.name || s.address || s.phone);
  let score = 100;
  const details: string[] = [];

  if (populated.length < 2) {
    score = populated.length ? 55 : 20;
    details.push(
      populated.length
        ? 'Only one NAP source available — engines cannot corroborate identity yet.'
        : 'No name, address, or phone found to compare.',
    );
  } else {
    const penalty = Math.min(60, mismatches.length * 18);
    score = Math.max(0, 100 - penalty);
    if (!mismatches.length) {
      details.push(`${populated.length} sources agree on name, address, and phone.`);
    } else {
      for (const mm of mismatches.slice(0, 3)) {
        details.push(
          `${mm.field} mismatch: ${mm.a.source} (“${mm.a.value}”) vs ${mm.b.source} (“${mm.b.value}”).`,
        );
      }
    }
  }

  const summary =
    score >= 85
      ? 'NAP is consistent across sources.'
      : score >= 60
        ? 'NAP mostly aligns — fix the mismatches below.'
        : 'NAP disagrees across the website, GBP, and records — entity fragmentation risk.';

  return {
    score,
    grade: scoreToGrade(score),
    summary,
    details,
    sources: populated,
    mismatches,
  };
}

function urlsFromHtmlLinks(html: string, pageUrl: string): string[] {
  const linked = slugsLinkedFromHtml(html, pageUrl);
  const urls: string[] = [];
  const hrefs = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
  const base = pageUrl || 'https://example.invalid/';
  for (const match of hrefs) {
    const raw = (match[1] || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue;
    try {
      const url = new URL(raw, base).toString();
      if (slugFromProfileUrl(url)) urls.push(url);
    } catch {
      /* ignore */
    }
  }
  return [...new Set(urls)];
}

function scoreSameAsPillar(
  schema: JsonLdEntity,
  siteProfileUrls: string[],
): EntityContinuityPillar & {
  declared: string[];
  linkedFromSite: string[];
  aligned: string[];
  missingFromSite: string[];
  hasLocalBusinessSchema: boolean;
} {
  const declared = [...schema.sameAs];
  const linkedFromSite = [...siteProfileUrls];
  const aligned = declared.filter((url) =>
    linkedFromSite.some((link) => link.replace(/\/+$/, '') === url.replace(/\/+$/, '')),
  );
  const missingFromSite = declared.filter(
    (url) => !linkedFromSite.some((link) => link.replace(/\/+$/, '') === url.replace(/\/+$/, '')),
  );
  const hasLocalBusinessSchema = schema.types.some((t) => isEntityType(t));

  let score = 0;
  const details: string[] = [];

  if (!hasLocalBusinessSchema) {
    score = declared.length ? 35 : 15;
    details.push(
      declared.length
        ? 'sameAs URLs exist but no LocalBusiness / Organization schema declares the entity.'
        : 'No LocalBusiness schema with sameAs — search engines must guess which profiles are official.',
    );
  } else if (!declared.length) {
    score = 40;
    details.push('LocalBusiness schema is present but sameAs is empty — add official profile URLs.');
  } else if (!linkedFromSite.length) {
    score = 45;
    details.push(`Schema declares ${declared.length} profile(s) but the site links to none of them.`);
  } else if (aligned.length === declared.length) {
    score = 100;
    details.push('Schema sameAs matches the profiles linked from the website.');
  } else {
    score = Math.round(50 + (aligned.length / Math.max(declared.length, 1)) * 40);
    details.push(
      `${aligned.length} of ${declared.length} schema sameAs URLs are also linked on the site.`,
    );
    if (missingFromSite.length) {
      details.push(`${missingFromSite.length} declared profile(s) are not linked from the homepage.`);
    }
  }

  const summary =
    score >= 85
      ? 'Schema sameAs and site links agree.'
      : score >= 55
        ? 'Partial entity declaration — tighten schema and footer links.'
        : 'Weak structured-data graph — declare sameAs and link those profiles.';

  return {
    score,
    grade: scoreToGrade(score),
    summary,
    details,
    declared,
    linkedFromSite,
    aligned,
    missingFromSite,
    hasLocalBusinessSchema,
  };
}

function scoreGbpSitePillar(
  gbp: PlaceDetails | null,
  website: string,
  contactName: string,
  contactAddress: string,
  contactPhone: string,
  googlePlacesListed: boolean | null,
): EntityContinuityPillar & {
  available: boolean;
  websiteMatch: boolean | null;
  nameMatch: boolean | null;
  addressMatch: boolean | null;
  phoneMatch: boolean | null;
} {
  const available = Boolean(gbp);
  let score = googlePlacesListed === false ? 15 : 50;
  const details: string[] = [];
  let websiteMatch: boolean | null = null;
  let nameMatch: boolean | null = null;
  let addressMatch: boolean | null = null;
  let phoneMatch: boolean | null = null;

  if (googlePlacesListed === false) {
    details.push('No Google Business Profile match — local brand file is missing.');
  } else if (!gbp) {
    details.push('GBP details unavailable — could not compare website ↔ Google.');
  } else {
    if (website && gbp.website) {
      websiteMatch = websitesMatch(website, gbp.website);
      details.push(
        websiteMatch
          ? 'GBP website matches the audited domain.'
          : `GBP website (${gbp.website}) does not match ${website}.`,
      );
      score += websiteMatch ? 25 : -10;
    } else {
      details.push('Website URL missing on GBP or the audited site.');
      score -= 5;
    }

    if (contactName && gbp.name) {
      nameMatch = isBusinessNameMatch(contactName, gbp.name);
      details.push(
        nameMatch
          ? 'GBP name matches the business record.'
          : `GBP name (“${gbp.name}”) differs from “${contactName}”.`,
      );
      score += nameMatch ? 20 : -10;
    }

    if (contactAddress && gbp.formattedAddress) {
      addressMatch = addressesMatch(contactAddress, gbp.formattedAddress);
      details.push(
        addressMatch
          ? 'GBP address matches the contact record.'
          : 'GBP address differs from the contact / site address.',
      );
      score += addressMatch ? 15 : -8;
    }

    if (contactPhone && gbp.phone) {
      phoneMatch = phonesMatch(contactPhone, gbp.phone);
      details.push(
        phoneMatch
          ? 'GBP phone matches the contact record.'
          : 'GBP phone differs from the contact / site phone.',
      );
      score += phoneMatch ? 15 : -8;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const summary =
    score >= 85
      ? 'Google Business Profile agrees with the website and records.'
      : score >= 55
        ? 'GBP exists but disagrees on at least one core field.'
        : googlePlacesListed === false
          ? 'No GBP — local search has no canonical brand file.'
          : 'GBP and website/records are out of sync.';

  return {
    score,
    grade: scoreToGrade(score),
    summary,
    details,
    available,
    websiteMatch,
    nameMatch,
    addressMatch,
    phoneMatch,
  };
}

function scoreCrossLinksPillar(checks: DirectoryCheck[]): EntityContinuityPillar & { checks: DirectoryCheck[] } {
  const key = checks.filter((c) => KEY_PROFILE_SLUGS.includes(c.slug));
  const total = key.length || 1;
  let points = 0;
  for (const check of key) {
    if (check.verdict === 'pass') points += 100;
    else if (check.verdict === 'half') points += 55;
  }
  const score = Math.round(points / total);
  const linked = key.filter((c) => c.verdict === 'pass').map((c) => c.title);
  const orphan = key.filter((c) => c.verdict === 'half').map((c) => c.title);
  const missing = key.filter((c) => c.verdict === 'fail').map((c) => c.title);
  const details: string[] = [];
  if (linked.length) details.push(`Linked from site: ${linked.join(', ')}.`);
  if (orphan.length) details.push(`Found but not linked: ${orphan.join(', ')}.`);
  if (missing.length) details.push(`Not found: ${missing.join(', ')}.`);

  const summary =
    score >= 85
      ? 'Key profiles are linked from the website.'
      : score >= 55
        ? 'Some official profiles exist but are not hub-linked from the site.'
        : 'Profile graph is disconnected — link GBP, social, and directories from the homepage.';

  return { score, grade: scoreToGrade(score), summary, details, checks };
}

export function summarizeEntityContinuity(result: EntityContinuityResult): string {
  const bits = [
    `Entity continuity ${result.overall.grade} (${result.overall.score}/100).`,
    result.nap.summary,
    result.gbpSite.summary,
    result.crossLinks.summary,
  ];
  if (result.sameAs.score < 70) bits.push(result.sameAs.summary);
  return bits.join(' ');
}

export async function scoreEntityContinuity(opts: {
  website?: string;
  businessName?: string;
  ownerName?: string;
  contactPhone?: string;
  contactAddress?: string;
  googlePlacesListed?: boolean | null;
  placeId?: string | null;
  html?: string;
  pageUrl?: string;
  iconGroup?: string | null;
}): Promise<EntityContinuityResult> {
  const website = (opts.website || '').trim();
  const businessName = (opts.businessName || '').trim();
  const ownerName = (opts.ownerName || '').trim();
  let html = opts.html || '';
  let pageUrl = opts.pageUrl || '';

  if (!html && website) {
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const { fetchHtml } = await import('./clientBrand');
    const fetched = await fetchHtml(url);
    if (fetched.ok) {
      html = fetched.html;
      pageUrl = fetched.finalUrl;
    }
  }

  const schemaEntities = html ? parseJsonLdEntities(html) : [];
  const schema = mergeSchemaEntities(schemaEntities);
  const sitePhone = html ? extractTelFromHtml(html) : '';
  const siteAddress = schema.address || (html ? extractVisibleAddressFromHtml(html) : '');

  const gbp =
    opts.googlePlacesListed !== false
      ? await resolvePlaceDetails({
          placeId: opts.placeId,
          name: businessName,
          address: opts.contactAddress,
        })
      : null;

  const napSources: NapSource[] = [];
  if (businessName || opts.contactAddress || opts.contactPhone) {
    napSources.push({
      id: 'contact',
      label: 'Contact record',
      name: businessName,
      address: opts.contactAddress,
      phone: opts.contactPhone,
    });
  }
  if (schema.name || schema.address || schema.phone) {
    napSources.push({
      id: 'schema',
      label: 'Schema.org',
      name: schema.name,
      address: schema.address,
      phone: schema.phone,
    });
  }
  if (sitePhone || siteAddress) {
    napSources.push({
      id: 'site',
      label: 'Website',
      address: siteAddress,
      phone: sitePhone,
    });
  }
  if (gbp) {
    napSources.push({
      id: 'gbp',
      label: 'Google Business Profile',
      name: gbp.name,
      address: gbp.formattedAddress,
      phone: gbp.phone,
    });
  }

  const napMismatches = compareNapSources(napSources);
  const nap = scoreNapPillar(napSources, napMismatches);

  const siteProfileUrls = html ? urlsFromHtmlLinks(html, pageUrl || website) : [];
  const sameAs = scoreSameAsPillar(schema, siteProfileUrls);

  const gbpSite = scoreGbpSitePillar(
    gbp,
    website,
    businessName,
    opts.contactAddress || siteAddress,
    opts.contactPhone || sitePhone,
    opts.googlePlacesListed ?? null,
  );

  const { checkDirectoryCoverage } = await import('./salesSheetDirectoryCheck');
  const checks = await checkDirectoryCoverage({
    website,
    businessName,
    ownerName,
    googlePlacesListed: opts.googlePlacesListed,
    html,
    pageUrl,
    iconGroup: opts.iconGroup,
  });
  const crossLinks = scoreCrossLinksPillar(checks);

  const overallScore = Math.round(
    nap.score * 0.35 +
      gbpSite.score * 0.25 +
      crossLinks.score * 0.25 +
      sameAs.score * 0.15,
  );

  return {
    overall: { score: overallScore, grade: scoreToGrade(overallScore) },
    nap,
    sameAs,
    gbpSite,
    crossLinks,
  };
}
