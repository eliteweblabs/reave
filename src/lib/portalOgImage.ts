import sharp from 'sharp';
import {
  contactStringField,
  extractPortal,
  getContact,
  type ClientPortal,
  type ContactRecord,
} from './contactApi';

export const PORTAL_OG_WIDTH = 1200;
export const PORTAL_OG_HEIGHT = 630;

const LOGO_BOX_W = 760;
const LOGO_BOX_H = 300;
const LOGO_BOX_TOP = 110;
const LOGO_FETCH_TIMEOUT_MS = 8_000;

export type PortalShareMeta = {
  uid: string;
  pageTitle: string;
  brandTitle: string;
  description: string;
  logoUrl: string;
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
    logoUrl: contactStringField(portal.logoUrl),
  };
}

export async function loadPortalShareMeta(uid: string): Promise<PortalShareMeta | null> {
  const id = uid.trim();
  if (!id) return null;

  const res = await getContact(id);
  if (!res.ok || res.data.archived) return null;

  const portal = extractPortal(res.data);
  if (portal?.enabled === false) return null;

  return portalShareMetaFromContact(id, res.data, portal ?? {});
}

function buildPortalOgTextSvg(title: string): string {
  const safeTitle = escapeXml(title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" viewBox="0 0 ${PORTAL_OG_WIDTH} ${PORTAL_OG_HEIGHT}">
  <rect width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" fill="#0a0a0a" />
  <text x="600" y="330" text-anchor="middle" fill="#ffffff" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="72" font-weight="700">${safeTitle}</text>
</svg>`;
}

async function fetchLogoBuffer(url: string): Promise<Buffer | null> {
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

/** Render a 1200×630 PNG with the client logo contained (not cropped). */
export async function buildPortalOgPng(meta: PortalShareMeta): Promise<Buffer> {
  const logoUrl = safeRemoteImageUrl(meta.logoUrl);
  const logoBuf = logoUrl ? await fetchLogoBuffer(logoUrl) : null;

  if (logoBuf) {
    try {
      const logoPng = await sharp(logoBuf)
        .resize(LOGO_BOX_W, LOGO_BOX_H, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      const logoMeta = await sharp(logoPng).metadata();
      const logoW = logoMeta.width ?? LOGO_BOX_W;
      const logoH = logoMeta.height ?? LOGO_BOX_H;
      const left = Math.round((PORTAL_OG_WIDTH - logoW) / 2);
      const top = LOGO_BOX_TOP + Math.round((LOGO_BOX_H - logoH) / 2);

      return sharp({
        create: {
          width: PORTAL_OG_WIDTH,
          height: PORTAL_OG_HEIGHT,
          channels: 4,
          background: { r: 10, g: 10, b: 10, alpha: 1 },
        },
      })
        .composite([{ input: logoPng, top, left }])
        .png()
        .toBuffer();
    } catch {
      // Fall through to text-only card.
    }
  }

  return sharp(Buffer.from(buildPortalOgTextSvg(meta.brandTitle)))
    .resize(PORTAL_OG_WIDTH, PORTAL_OG_HEIGHT)
    .png()
    .toBuffer();
}
