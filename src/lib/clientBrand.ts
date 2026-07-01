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

const USER_AGENT =
  'Mozilla/5.0 (compatible; ReaveBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_500_000;

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

/** Parse HTML for logo + short site description. */
export function extractBrandFromHtml(html: string, pageUrl: string): ClientBrandInfo {
  const base = normalizePublicUrl(pageUrl, true);
  if (!base) return {};

  const $ = cheerio.load(html);
  const candidates: string[] = [];

  const push = (raw: string | undefined) => {
    if (!raw?.trim()) return;
    const abs = resolveAbsoluteUrl(raw, base);
    if (abs) candidates.push(abs);
  };

  push($('link[rel="apple-touch-icon"]').attr('href'));
  push($('link[rel="apple-touch-icon-precomposed"]').attr('href'));
  $('link[rel~="icon"]').each((_, el) => {
    push($(el).attr('href'));
  });
  push(extractMeta($, 'og:logo'));
  $('img[class*="logo" i], img[id*="logo" i], img[alt*="logo" i]').each((_, el) => {
    push($(el).attr('src'));
  });
  push(extractMeta($, 'og:image'));

  const logoUrl = candidates.find((u) => !/favicon\.ico(?:\?|$)/i.test(u)) ?? candidates[0];

  const tagline =
    extractMeta($, 'description') ||
    extractMeta($, 'og:description') ||
    '';

  return {
    logoUrl: logoUrl || undefined,
    website: base.origin,
    tagline: tagline.slice(0, 280) || undefined,
  };
}

async function fetchHtml(urlInput: string): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false }> {
  const url = normalizePublicUrl(urlInput, true);
  if (!url) return { ok: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES || !res.ok) return { ok: false };

    return {
      ok: true,
      html: new TextDecoder('utf-8', { fatal: false }).decode(buf),
      finalUrl: res.url || url.toString(),
    };
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

/** Best-effort website URL for a contact (portal Site URL field, else email domain). */
export function guessClientWebsite(contact: ContactRecord, portal: ClientPortal | null): string | null {
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
  if (!brand.logoUrl && !brand.tagline) return null;
  return brand;
}

/**
 * When a project is linked to a client, try to populate portal branding (logo, tagline, website).
 * Skips if logo is already set. Never throws.
 */
export async function enrichClientPortalBrand(contactUid: string): Promise<void> {
  if (!contactUid?.trim()) return;

  try {
    const res = await getContact(contactUid.trim());
    if (!res.ok || res.data.archived) return;

    const portal = extractPortal(res.data) ?? {};
    if (contactStringField(portal.logoUrl)) return;

    const website = guessClientWebsite(res.data, portal);
    if (!website) return;

    const brand = await fetchClientBrandFromWebsite(website);
    if (!brand?.logoUrl && !brand?.tagline) return;

    const next: ClientPortal = {
      ...portal,
      website: portal.website || brand.website || website.replace(/\/$/, ''),
      logoUrl: brand.logoUrl,
      tagline: portal.tagline || brand.tagline,
      updatedAt: new Date().toISOString(),
    };

    await setContactPortal(contactUid.trim(), next);
  } catch (e) {
    console.warn('[client-brand] enrich failed', e);
  }
}
