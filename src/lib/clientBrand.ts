/**
 * Client portal branding — fetch logo and site metadata from a client's website
 * when a project is created (best-effort; never blocks work creation).
 */
import * as cheerio from 'cheerio';
import {
  contactStringField,
  extractPortal,
  getContact,
  setContactPortal,
  type ClientPortal,
  type ContactRecord,
} from './contactApi';
import { normalizePublicUrl } from './publicUrl';
import { portalSiteUrl } from './siteMonitoring';

/** Browser-like UA — avoids bot-detection redirect loops on some sites (incl. self-fetch). */
const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 8;

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'msn.com',
  'ymail.com',
]);

export type ClientBrandInfo = {
  logoUrl?: string;
  iconUrl?: string;
  website?: string;
  tagline?: string;
};

function resolveAbsoluteUrl(raw: string, base: URL): string | null {
  const t = raw.trim();
  if (!t || t.startsWith('data:')) return null;
  try {
    return new URL(t, base).toString();
  } catch {
    return null;
  }
}

function extractMeta($: cheerio.CheerioAPI, name: string): string {
  const byName = $(`meta[name="${name}"]`).attr('content');
  if (byName?.trim()) return byName.trim();
  const byProp = $(`meta[property="${name}"]`).attr('content');
  return byProp?.trim() ?? '';
}

function isFaviconIco(url: string): boolean {
  return /favicon\.ico(?:\?|$)/i.test(url);
}

function isAppleTouchIcon(url: string): boolean {
  return /apple-touch-icon/i.test(url);
}

function isLikelySocialBanner(url: string): boolean {
  return /(?:^|[/])(?:og[-_]image|social[-_]?(?:share|banner|card)|share[-_]?image)(?:[/?.]|$)/i.test(url);
}

/** Parse HTML for logo, icon, and short site description. */
export function extractBrandFromHtml(html: string, pageUrl: string): ClientBrandInfo {
  const base = normalizePublicUrl(pageUrl, true);
  if (!base) return {};

  const $ = cheerio.load(html);
  const iconCandidates: string[] = [];
  const logoCandidates: string[] = [];

  const pushUnique = (list: string[], raw: string | undefined) => {
    if (!raw?.trim()) return;
    const abs = resolveAbsoluteUrl(raw, base);
    if (abs && !list.includes(abs)) list.push(abs);
  };

  pushUnique(iconCandidates, $('link[rel="apple-touch-icon"]').attr('href'));
  pushUnique(iconCandidates, $('link[rel="apple-touch-icon-precomposed"]').attr('href'));
  $('link[rel~="icon"]').each((_, el) => {
    pushUnique(iconCandidates, $(el).attr('href'));
  });
  pushUnique(iconCandidates, $('link[rel="mask-icon"]').attr('href'));

  pushUnique(logoCandidates, extractMeta($, 'og:logo'));
  $('[data-logo-src]').each((_, el) => {
    pushUnique(logoCandidates, $(el).attr('data-logo-src'));
  });
  $('[data-hero-mask]').each((_, el) => {
    const raw = $(el).attr('data-hero-mask');
    if (raw && !/\.gif(?:\?|$)/i.test(raw)) pushUnique(logoCandidates, raw);
  });
  $('img[class*="logo" i], img[id*="logo" i], img[alt*="logo" i]').each((_, el) => {
    pushUnique(logoCandidates, $(el).attr('src'));
  });
  $('header img, .logo img, #logo img, [class*="brand" i] img').each((_, el) => {
    pushUnique(logoCandidates, $(el).attr('src'));
  });
  // og:image is usually a social banner — keep it last so logos/icons win.
  const ogImage = extractMeta($, 'og:image');
  if (ogImage && !isLikelySocialBanner(ogImage)) {
    pushUnique(logoCandidates, ogImage);
  } else if (ogImage) {
    pushUnique(logoCandidates, ogImage);
  }

  const iconUrl =
    iconCandidates.find((u) => isAppleTouchIcon(u)) ||
    iconCandidates.find((u) => !isFaviconIco(u)) ||
    iconCandidates[0];

  const logoUrl =
    logoCandidates.find((u) => !isFaviconIco(u) && !isAppleTouchIcon(u) && !isLikelySocialBanner(u)) ||
    logoCandidates.find((u) => !isFaviconIco(u) && !isAppleTouchIcon(u)) ||
    logoCandidates.find((u) => !isFaviconIco(u)) ||
    logoCandidates[0] ||
    iconUrl;

  const tagline =
    extractMeta($, 'description') ||
    extractMeta($, 'og:description') ||
    '';

  return {
    logoUrl: logoUrl || undefined,
    iconUrl: iconUrl || logoUrl || undefined,
    website: base.origin,
    tagline: tagline.slice(0, 280) || undefined,
  };
}

async function fetchHtmlOnce(
  urlInput: string,
  signal: AbortSignal,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false }> {
  const start = normalizePublicUrl(urlInput, true);
  if (!start) return { ok: false };

  const headers = {
    'User-Agent': SCRAPE_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  };

  let current = start.toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      signal,
      redirect: 'manual',
      headers,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location || hop >= MAX_REDIRECTS) return { ok: false };
      current = new URL(location, current).toString();
      continue;
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES || !res.ok) return { ok: false };

    return {
      ok: true,
      html: new TextDecoder('utf-8', { fatal: false }).decode(buf),
      finalUrl: current,
    };
  }

  return { ok: false };
}

async function fetchHtml(urlInput: string): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const first = await fetchHtmlOnce(urlInput, controller.signal);
    if (first.ok) return first;
    return fetchHtmlOnce(urlInput, controller.signal);
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function websiteFromEmail(email: string): string | null {
  const m = email.match(/@([^@\s]+)/);
  if (!m) return null;
  const domain = m[1].toLowerCase();
  if (GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  return `https://${domain}`;
}

/** Best-effort website URL for a contact (portal website, Site URL field, else email domain). */
export function guessClientWebsite(contact: ContactRecord, portal: ClientPortal | null): string | null {
  const direct = contactStringField(portal?.website);
  if (direct) return direct;

  const fromField = portalSiteUrl(portal);
  if (fromField) return fromField;

  const email = contactStringField(contact.email);
  if (email) {
    const fromEmail = websiteFromEmail(email);
    if (fromEmail) return fromEmail;
  }

  return null;
}

/** Fetch logo + tagline from a public website URL. */
export async function fetchClientBrandFromWebsite(urlInput: string): Promise<ClientBrandInfo | null> {
  const fetched = await fetchHtml(urlInput);
  if (!fetched.ok) return null;
  const brand = extractBrandFromHtml(fetched.html, fetched.finalUrl);
  if (!brand.logoUrl && !brand.iconUrl && !brand.tagline) return null;
  return brand;
}

/**
 * When a project is linked to a client, try to populate portal branding (logo, tagline, website).
 * Skips if logo is already set unless force is true. Never throws.
 */
export async function enrichClientPortalBrand(
  contactUid: string,
  opts?: { force?: boolean },
): Promise<void> {
  if (!contactUid?.trim()) return;

  try {
    const res = await getContact(contactUid.trim());
    if (!res.ok || res.data.archived) return;

    const portal = extractPortal(res.data) ?? {};
    if (!opts?.force && (portal.logoSource === 'upload' || contactStringField(portal.logoUrl))) return;

    const website = guessClientWebsite(res.data, portal);
    if (!website) return;

    const brand = await fetchClientBrandFromWebsite(website);
    if (!brand?.logoUrl && !brand?.iconUrl && !brand?.tagline) return;

    const next: ClientPortal = {
      ...portal,
      website: portal.website || brand.website || website.replace(/\/$/, ''),
      logoUrl: brand.logoUrl || portal.logoUrl,
      logoSource: brand.logoUrl ? 'website' : portal.logoSource,
      iconUrl: brand.iconUrl || portal.iconUrl,
      iconSource: brand.iconUrl ? 'website' : portal.iconSource,
      tagline: portal.tagline || brand.tagline,
      updatedAt: new Date().toISOString(),
    };

    await setContactPortal(contactUid.trim(), next);
  } catch (e) {
    console.warn('[client-brand] enrich failed', e);
  }
}

/** Normalize a user-entered website string to https URL form for storage/display. */
export function normalizeClientWebsiteInput(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t.replace(/\/$/, '');
  return `https://${t.replace(/^\/\//, '').replace(/\/$/, '')}`;
}

/** Pull a website URL from internal notes (e.g. "Website: www.example.com"). */
export function websiteFromNotes(notes: string): string {
  const text = notes.trim();
  if (!text) return '';
  const m = text.match(/(?:^|\s)(?:website|site|url)\s*:\s*(\S+)/i);
  const candidate = (m?.[1] ?? text.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]*\.[a-z]{2,}\/?\b/i)?.[0] ?? '').trim();
  if (!candidate) return '';
  return normalizeClientWebsiteInput(candidate);
}

/** Persist website on the client portal and refresh logo/tagline. */
export async function setClientPortalWebsite(
  uid: string,
  websiteInput: string,
): Promise<{ ok: true; website: string } | { ok: false; error: string }> {
  const res = await getContact(uid);
  if (!res.ok) return { ok: false, error: res.error };

  const portal = extractPortal(res.data) ?? {};
  const website = normalizeClientWebsiteInput(websiteInput);
  const fields = [...(portal.fields ?? [])];
  const idx = fields.findIndex((f) => f.label.trim().toLowerCase() === 'site url');

  if (website) {
    const row = { label: 'Site URL', value: website };
    if (idx >= 0) fields[idx] = row;
    else fields.push(row);
  } else if (idx >= 0) {
    fields.splice(idx, 1);
  }

  const saved = await setContactPortal(uid, {
    ...portal,
    website: website || undefined,
    fields: fields.length ? fields : undefined,
    updatedAt: new Date().toISOString(),
  });
  if (!saved.ok) return { ok: false, error: saved.error };

  if (website) await enrichClientPortalBrand(uid, { force: true });

  return { ok: true, website };
}

function parseClientGeoInput(raw: unknown): ClientPortal['geo'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const lat = Number((raw as { lat?: unknown }).lat);
  const lng = Number((raw as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const placeId =
    typeof (raw as { placeId?: unknown }).placeId === 'string'
      ? (raw as { placeId: string }).placeId.trim()
      : undefined;
  return {
    lat,
    lng,
    placeId: placeId || undefined,
    geocodedAt: new Date().toISOString(),
  };
}

/** Persist address + geocoded coordinates on the client portal. */
export async function setClientPortalAddress(
  uid: string,
  addressInput: string,
  geoInput?: ClientPortal['geo'] | null,
): Promise<
  | { ok: true; address: string; geo?: ClientPortal['geo'] }
  | { ok: false; error: string }
> {
  const res = await getContact(uid);
  if (!res.ok) return { ok: false, error: res.error };

  const portal = extractPortal(res.data) ?? {};
  const address = addressInput.trim();
  let geo = geoInput ?? undefined;

  if (address) {
    const coordsMissing = !geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng);
    const addressChanged = address !== (portal.address ?? '').trim();
    if (coordsMissing || addressChanged) {
      const { geocodeAddress } = await import('./mapbox');
      const geocoded = await geocodeAddress(address);
      if (geocoded) {
        geo = {
          lat: geocoded.lat,
          lng: geocoded.lng,
          placeId: geocoded.placeId,
          geocodedAt: geocoded.geocodedAt,
        };
      }
    }
  } else {
    geo = undefined;
  }

  const saved = await setContactPortal(uid, {
    ...portal,
    address: address || undefined,
    geo: address && geo ? geo : undefined,
    updatedAt: new Date().toISOString(),
  });
  if (!saved.ok) return { ok: false, error: saved.error };

  return { ok: true, address, geo: address ? geo : undefined };
}

export { parseClientGeoInput };
