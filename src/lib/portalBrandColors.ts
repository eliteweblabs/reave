/**
 * Client portal theming — derive primary/secondary accents from the client logo.
 */
import sharp from 'sharp';
import {
  contactStringField,
  extractPortal,
  getContact,
  setContactPortal,
  type ClientPortal,
} from './contactApi';
import { getClientPortalLogoBlob, resolveClientLogoUrl } from './clientBranding';
import { loadLogoBuffer } from './portalOgImage';

export type PortalBrandColors = {
  primary: string;
  secondary: string;
  accent: string;
  primaryRgb: string;
  secondaryRgb: string;
};

export const DEFAULT_PORTAL_BRAND: PortalBrandColors = {
  primary: '#a855f7',
  secondary: '#ec4899',
  accent: '#d8b4fe',
  primaryRgb: '168, 85, 247',
  secondaryRgb: '236, 72, 153',
};

type Rgb = { r: number; g: number; b: number };

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToString({ r, g, b }: Rgb): string {
  return `${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}`;
}

function parseHexColor(raw: string): Rgb | null {
  const t = raw.trim();
  const m = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1];
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hue < 60) [rn, gn, bn] = [c, x, 0];
  else if (hue < 120) [rn, gn, bn] = [x, c, 0];
  else if (hue < 180) [rn, gn, bn] = [0, c, x];
  else if (hue < 240) [rn, gn, bn] = [0, x, c];
  else if (hue < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return {
    r: clampByte((rn + m) * 255),
    g: clampByte((gn + m) * 255),
    b: clampByte((bn + m) * 255),
  };
}

function isNeutral({ r, g, b }: Rgb): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (max + min) / (2 * 255);
  return lum < 0.08 || lum > 0.92 || sat < 0.14;
}

export function buildPortalBrandColors(primaryRaw: string, secondaryRaw?: string, accentRaw?: string): PortalBrandColors | null {
  const primaryRgb = parseHexColor(primaryRaw);
  if (!primaryRgb) return null;

  const secondaryParsed = secondaryRaw ? parseHexColor(secondaryRaw) : null;
  const { h, s, l } = rgbToHsl(primaryRgb);
  const secondaryRgb =
    secondaryParsed ??
    hslToRgb((h + 22) % 360, Math.min(1, Math.max(0.35, s * 0.92)), Math.max(0.28, Math.min(0.62, l * 0.78)));

  const accentParsed = accentRaw ? parseHexColor(accentRaw) : null;
  const accentRgb =
    accentParsed ?? hslToRgb(h, Math.min(0.72, Math.max(0.35, s * 0.55)), Math.min(0.78, l + 0.22));

  return {
    primary: rgbToHex(primaryRgb),
    secondary: rgbToHex(secondaryRgb),
    accent: rgbToHex(accentRgb),
    primaryRgb: rgbToString(primaryRgb),
    secondaryRgb: rgbToString(secondaryRgb),
  };
}

export function portalBrandFromMetadata(portal: ClientPortal | null | undefined): PortalBrandColors | null {
  if (!portal) return null;
  const primary = contactStringField(portal.brandPrimary);
  const secondary = contactStringField(portal.brandSecondary);
  if (!primary) return null;
  return buildPortalBrandColors(primary, secondary || undefined, contactStringField(portal.brandAccent) || undefined);
}

/** Sample saturated logo pixels to find a primary brand color. */
export async function extractBrandColorsFromBuffer(buf: Buffer): Promise<PortalBrandColors | null> {
  try {
    const { data, info } = await sharp(buf)
      .resize(96, 96, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();

    for (let i = 0; i < data.length; i += info.channels) {
      const alpha = info.channels === 4 ? data[i + 3] : 255;
      if (alpha < 120) continue;
      const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
      if (isNeutral(rgb)) continue;

      const { h, s, l } = rgbToHsl(rgb);
      const bucket = Math.round(h / 12) * 12;
      const weight = s * (alpha / 255) * (0.55 + (1 - Math.abs(l - 0.5)));
      const existing = buckets.get(bucket);
      if (existing) {
        existing.weight += weight;
        existing.r += rgb.r * weight;
        existing.g += rgb.g * weight;
        existing.b += rgb.b * weight;
      } else {
        buckets.set(bucket, {
          weight,
          r: rgb.r * weight,
          g: rgb.g * weight,
          b: rgb.b * weight,
        });
      }
    }

    if (buckets.size === 0) return null;

    const top = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
    const primaryRgb = {
      r: top.r / top.weight,
      g: top.g / top.weight,
      b: top.b / top.weight,
    };
    return buildPortalBrandColors(rgbToHex(primaryRgb));
  } catch {
    return null;
  }
}

export async function extractBrandColorsFromLogoSource(source: string): Promise<PortalBrandColors | null> {
  const buf = await loadLogoBuffer(source);
  if (!buf) return null;
  return extractBrandColorsFromBuffer(buf);
}

export async function persistPortalBrandColors(
  uid: string,
  portal: ClientPortal,
  colors: PortalBrandColors,
): Promise<void> {
  if (!uid.trim()) return;
  try {
    await setContactPortal(uid.trim(), {
      ...portal,
      brandPrimary: colors.primary,
      brandSecondary: colors.secondary,
      brandAccent: colors.accent,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[portal-brand] persist failed', e);
  }
}

export async function resolvePortalBrandColors(uid: string, portal: ClientPortal): Promise<PortalBrandColors | null> {
  const cached = portalBrandFromMetadata(portal);
  if (cached) return cached;

  const logoUrl = resolveClientLogoUrl(portal, uid);
  if (!logoUrl) return null;

  const uploaded = await getClientPortalLogoBlob(uid);
  const extracted = uploaded?.dataBase64
    ? await extractBrandColorsFromBuffer(Buffer.from(uploaded.dataBase64, 'base64'))
    : await extractBrandColorsFromLogoSource(logoUrl);
  if (!extracted) return null;

  void persistPortalBrandColors(uid, portal, extracted);
  return extracted;
}

export function portalBrandCssVars(colors: PortalBrandColors): Record<string, string> {
  return {
    '--portal-primary': colors.primary,
    '--portal-secondary': colors.secondary,
    '--portal-accent': colors.accent,
    '--portal-primary-rgb': colors.primaryRgb,
    '--portal-secondary-rgb': colors.secondaryRgb,
    '--portal-brand-gradient': `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
    '--brand-pink': colors.primary,
    '--brand-magenta': colors.secondary,
    '--brand-indigo': colors.secondary,
    '--brand-gradient': `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
  };
}

/** Recompute and store portal brand colors after a logo upload or scrape. */
export async function refreshPortalBrandColors(uid: string): Promise<PortalBrandColors | null> {
  const id = uid.trim();
  if (!id) return null;

  const res = await getContact(id);
  if (!res.ok) return null;
  const portal = extractPortal(res.data) ?? {};
  const logoUrl = resolveClientLogoUrl(portal, id);
  if (!logoUrl) {
    const next: ClientPortal = { ...portal, updatedAt: new Date().toISOString() };
    delete next.brandPrimary;
    delete next.brandSecondary;
    delete next.brandAccent;
    await setContactPortal(id, next);
    return null;
  }

  const extracted = await extractBrandColorsFromLogoSource(logoUrl);
  if (!extracted) return null;
  await persistPortalBrandColors(id, portal, extracted);
  return extracted;
}
