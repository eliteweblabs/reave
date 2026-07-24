import sharp from 'sharp';
import {
  contactStringField,
  extractPortal,
  getContact,
  type ClientPortal,
  type ContactRecord,
} from './contactApi';
import {
  getClientPortalIconBlob,
  getClientPortalLogoBlob,
  resolveClientIconUrl,
  resolveClientLogoUrl,
} from './clientBranding';
import { enrichClientPortalBrand } from './clientBrand';

export const PORTAL_OG_WIDTH = 1200;
export const PORTAL_OG_HEIGHT = 630;

const LOGO_FETCH_TIMEOUT_MS = 8_000;
const OG_BG = { r: 10, g: 10, b: 10 };

export type PortalShareMeta = {
  uid: string;
  pageTitle: string;
  brandTitle: string;
  description: string;
  logoUrl: string;
  iconUrl: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Only allow remote http(s) image URLs for OG composition. */
export function safeRemoteImageUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const url = new URL(t);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function portalShareMetaFromContact(uid: string, contact: ContactRecord, portal: ClientPortal): PortalShareMeta {
  const displayName = contactStringField(contact.name) || 'Client';
  const company = contactStringField(contact.company);
  const brandTitle = company || displayName;
  const pageTitle = company ? `${displayName} · ${company}` : displayName;
  const tagline = contactStringField(portal.tagline);
  const description = tagline || `${brandTitle} client portal`;

  return {
    uid,
    pageTitle,
    brandTitle,
    description,
    logoUrl: resolveClientLogoUrl(portal, uid),
    iconUrl: resolveClientIconUrl(portal, uid),
  };
}

export async function loadPortalShareMeta(uid: string): Promise<PortalShareMeta | null> {
  const id = uid.trim();
  if (!id) return null;

  const res = await getContact(id);
  if (!res.ok || res.data.archived) return null;

  let contact = res.data;
  let portal = extractPortal(contact) ?? {};
  if (portal?.enabled === false) return null;

  let logoUrl = resolveClientLogoUrl(portal, id);
  if (!logoUrl && portal.logoSource !== 'upload') {
    await enrichClientPortalBrand(id);
    const refreshed = await getContact(id);
    if (refreshed.ok) {
      contact = refreshed.data;
      portal = extractPortal(contact) ?? portal;
      logoUrl = resolveClientLogoUrl(portal, id);
    }
  }

  return portalShareMetaFromContact(id, contact, portal);
}

function buildPortalOgTextSvg(title: string): string {
  const safeTitle = escapeXml(title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" viewBox="0 0 ${PORTAL_OG_WIDTH} ${PORTAL_OG_HEIGHT}">
  <rect width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" fill="#0a0a0a" />
  <text x="600" y="330" text-anchor="middle" fill="#ffffff" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="72" font-weight="700">${safeTitle}</text>
</svg>`;
}

function normalizePublicLogoPath(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('/')) return t;
  return `/${t.replace(/^\/+/, '')}`;
}

async function fetchRemoteLogoBuffer(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseClientBrandingApiPath(source: string): { uid: string; kind: 'logo' | 'icon' } | null {
  const path = source.trim().split('?')[0] ?? '';
  const m = path.match(/^\/api\/clients\/([^/]+)\/(logo|icon)$/);
  if (!m) return null;
  return { uid: decodeURIComponent(m[1]), kind: m[2] as 'logo' | 'icon' };
}

export async function loadLogoBuffer(source: string): Promise<Buffer | null> {
  const brandingPath = parseClientBrandingApiPath(source);
  if (brandingPath) {
    const blob =
      brandingPath.kind === 'icon'
        ? await getClientPortalIconBlob(brandingPath.uid)
        : await getClientPortalLogoBlob(brandingPath.uid);
    if (blob?.dataBase64) return Buffer.from(blob.dataBase64, 'base64');
    return null;
  }

  if (source.startsWith('/')) {
    try {
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      return await readFile(join(process.cwd(), 'public', source.split('?')[0] ?? source));
    } catch {
      return null;
    }
  }

  const remote = safeRemoteImageUrl(source);
  return remote ? fetchRemoteLogoBuffer(remote) : null;
}

async function composeLogoPng(logoBuf: Buffer): Promise<Buffer | null> {
  try {
    return sharp(logoBuf)
      .resize(PORTAL_OG_WIDTH, PORTAL_OG_HEIGHT, {
        fit: 'cover',
        position: 'centre',
      })
      .flatten({ background: OG_BG })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** Render a 1200×630 PNG — client logo/icon first, then the project default logo. */
export async function buildPortalOgPng(
  meta: PortalShareMeta,
  opts?: { fallbackLogoPath?: string },
): Promise<Buffer> {
  const sources: string[] = [];
  const logo = meta.logoUrl.trim();
  const icon = meta.iconUrl.trim();
  if (logo) sources.push(logo);
  if (icon && icon !== logo) sources.push(icon);

  const fallbackLogo = normalizePublicLogoPath(opts?.fallbackLogoPath ?? '');
  if (fallbackLogo && !sources.includes(fallbackLogo)) sources.push(fallbackLogo);

  for (const source of sources) {
    const logoBuf = await loadLogoBuffer(source);
    if (!logoBuf) continue;
    const png = await composeLogoPng(logoBuf);
    if (png) return png;
  }

  return sharp(Buffer.from(buildPortalOgTextSvg(meta.brandTitle)))
    .resize(PORTAL_OG_WIDTH, PORTAL_OG_HEIGHT)
    .png()
    .toBuffer();
}
