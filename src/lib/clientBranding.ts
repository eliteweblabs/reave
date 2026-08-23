/**
 * Client portal logo/icon uploads — stored in contact portal metadata,
 * served from /api/clients/:uid/logo and /api/clients/:uid/icon.
 *
 * Website-scraped logos also resolve through the serve path so contrast
 * adaptation (mostly-black → white on dark portal) can run centrally.
 */
import { isFaviconLikeUrl } from './clientBrand';
import {
  contactStringField,
  extractPortal,
  getContact,
  setContactPortal,
  type ClientPortal,
} from './contactApi';
import { refreshPortalBrandColors } from './portalBrandColors';

/** Below this on both edges, a scraped mark is a favicon — not a logo. */
const MIN_HERO_LOGO_EDGE_PX = 48;

const LOGO_FETCH_TIMEOUT_MS = 8_000;

/** Only allow remote http(s) image URLs when hydrating scraped logos. */
function safeRemoteLogoUrl(raw: string): string | null {
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

export function clientLogoServePath(uid: string): string {
  return `/api/clients/${encodeURIComponent(uid.trim())}/logo`;
}

export function clientIconServePath(uid: string): string {
  return `/api/clients/${encodeURIComponent(uid.trim())}/icon`;
}

export type ClientLogoServeOpts = {
  /**
   * Contrast adaptation for the surface the logo will sit on.
   * Portal / admin chrome is dark — default `dark` flips mostly-black ink to white.
   * Pass `raw` for light contexts (email signatures) that need the original bytes.
   */
  bg?: 'dark' | 'light' | 'raw';
};

function brandingServeQuery(updatedAt?: string, bg: ClientLogoServeOpts['bg'] = 'dark'): string {
  const q = new URLSearchParams();
  if (updatedAt) q.set('v', updatedAt);
  // API defaults to raw; portal/admin callers opt into adaptation explicitly.
  if (bg && bg !== 'raw') q.set('bg', bg);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function resolveClientLogoUrl(
  portal: ClientPortal | null | undefined,
  uid: string,
  opts?: ClientLogoServeOpts,
): string {
  if (!portal) return '';
  const bg = opts?.bg ?? 'dark';
  if (portal.logoSource === 'upload') {
    return `${clientLogoServePath(uid)}${brandingServeQuery(portal.updatedAt, bg)}`;
  }
  // Route remote/scraped logos through our API so dark-bg contrast adapt can run.
  if (contactStringField(portal.logoUrl)) {
    return `${clientLogoServePath(uid)}${brandingServeQuery(portal.updatedAt, bg)}`;
  }
  return '';
}

/**
 * Logo for the portal hero. Uploads always count. Scraped favicons and
 * sub-48px icons do not — those should show the missing-logo finding.
 */
export async function resolveClientHeroLogoUrl(
  portal: ClientPortal | null | undefined,
  uid: string,
  opts?: ClientLogoServeOpts,
): Promise<string> {
  if (!portal) return '';
  if (portal.logoSource === 'upload' && portal.logoData) {
    return resolveClientLogoUrl(portal, uid, opts);
  }
  const remote = contactStringField(portal.logoUrl);
  if (!remote || isFaviconLikeUrl(remote)) return '';

  const blob = await getClientPortalLogoBlob(uid);
  if (!blob) return '';
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(Buffer.from(blob.dataBase64, 'base64')).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width > 0 && height > 0 && width < MIN_HERO_LOGO_EDGE_PX && height < MIN_HERO_LOGO_EDGE_PX) {
      return '';
    }
  } catch {
    return '';
  }
  return resolveClientLogoUrl(portal, uid, opts);
}

/** Data URL of a crawler-identifiable client logo, or empty when there isn't one. */
export async function inlineClientHeroLogoDataUrl(uid: string): Promise<string> {
  const id = uid.trim();
  if (!id || id === 'preview') return '';
  const res = await getContact(id);
  if (!res.ok) return '';
  const portal = extractPortal(res.data);
  const url = await resolveClientHeroLogoUrl(portal, id, { bg: 'light' });
  if (!url) return '';
  const blob = await getClientPortalLogoBlob(id);
  if (!blob?.dataBase64 || !blob.mediaType) return '';
  return `data:${blob.mediaType};base64,${blob.dataBase64}`;
}

export function resolveClientIconUrl(
  portal: ClientPortal | null | undefined,
  uid: string,
  opts?: ClientLogoServeOpts,
): string {
  if (!portal) return '';
  const bg = opts?.bg ?? 'dark';
  if (portal.iconSource === 'upload') {
    return `${clientIconServePath(uid)}${brandingServeQuery(portal.updatedAt, bg)}`;
  }
  const iconUrl = contactStringField(portal.iconUrl);
  if (iconUrl) return iconUrl;
  return resolveClientLogoUrl(portal, uid, { bg });
}

export type ClientBrandingBlob = {
  dataBase64: string;
  mediaType: string;
};

async function fetchRemoteBrandingBuffer(url: string): Promise<Buffer | null> {
  const remote = safeRemoteLogoUrl(url);
  if (!remote) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(remote, {
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

function guessImageMediaType(buf: Buffer, fallback = 'image/png'): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '<?xml') return 'image/svg+xml';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '<svg') return 'image/svg+xml';
  return fallback;
}

export async function getClientPortalLogoBlob(
  uid: string,
): Promise<(ClientBrandingBlob & { updatedAt?: string }) | null> {
  const res = await getContact(uid);
  if (!res.ok) return null;
  const portal = extractPortal(res.data);
  if (!portal) return null;

  if (portal.logoSource === 'upload' && portal.logoData && portal.logoMediaType) {
    return {
      dataBase64: portal.logoData,
      mediaType: portal.logoMediaType,
      updatedAt: portal.updatedAt,
    };
  }

  const remoteUrl = contactStringField(portal.logoUrl);
  if (!remoteUrl || remoteUrl.startsWith('/api/clients/')) return null;
  const buf = await fetchRemoteBrandingBuffer(remoteUrl);
  if (!buf) return null;
  return {
    dataBase64: buf.toString('base64'),
    mediaType: guessImageMediaType(buf),
    updatedAt: portal.updatedAt,
  };
}

export async function getClientPortalIconBlob(
  uid: string,
): Promise<(ClientBrandingBlob & { updatedAt?: string }) | null> {
  const res = await getContact(uid);
  if (!res.ok) return null;
  const portal = extractPortal(res.data);
  if (portal?.iconSource !== 'upload' || !portal.iconData || !portal.iconMediaType) return null;
  return {
    dataBase64: portal.iconData,
    mediaType: portal.iconMediaType,
    updatedAt: portal.updatedAt,
  };
}

export async function setClientPortalLogo(
  uid: string,
  logo: ClientBrandingBlob,
): Promise<{ ok: true; logoUrl: string } | { ok: false; error: string }> {
  const res = await getContact(uid);
  if (!res.ok) return { ok: false, error: res.error };

  const portal = extractPortal(res.data) ?? {};
  const updatedAt = new Date().toISOString();
  const saved = await setContactPortal(uid, {
    ...portal,
    logoData: logo.dataBase64,
    logoMediaType: logo.mediaType,
    logoSource: 'upload',
    logoUrl: clientLogoServePath(uid),
    updatedAt,
  });
  if (!saved.ok) return { ok: false, error: saved.error };

  void refreshPortalBrandColors(uid);

  return {
    ok: true,
    logoUrl: resolveClientLogoUrl(
      { logoSource: 'upload', updatedAt },
      uid,
    ),
  };
}

export async function clearClientPortalLogo(
  uid: string,
): Promise<{ ok: true; logoUrl: string } | { ok: false; error: string }> {
  const res = await getContact(uid);
  if (!res.ok) return { ok: false, error: res.error };

  const portal = extractPortal(res.data) ?? {};
  const next: ClientPortal = { ...portal, updatedAt: new Date().toISOString() };
  delete next.logoData;
  delete next.logoMediaType;
  delete next.logoSource;
  delete next.logoUrl;

  const saved = await setContactPortal(uid, next);
  if (!saved.ok) return { ok: false, error: saved.error };

  void refreshPortalBrandColors(uid);

  const refreshed = await getContact(uid);
  const refreshedPortal = refreshed.ok ? extractPortal(refreshed.data) : null;
  return { ok: true, logoUrl: resolveClientLogoUrl(refreshedPortal, uid) };
}

export async function setClientPortalIcon(
  uid: string,
  icon: ClientBrandingBlob,
): Promise<{ ok: true; iconUrl: string } | { ok: false; error: string }> {
  const res = await getContact(uid);
  if (!res.ok) return { ok: false, error: res.error };

  const portal = extractPortal(res.data) ?? {};
  const updatedAt = new Date().toISOString();
  const saved = await setContactPortal(uid, {
    ...portal,
    iconData: icon.dataBase64,
    iconMediaType: icon.mediaType,
    iconSource: 'upload',
    iconUrl: clientIconServePath(uid),
    updatedAt,
  });
  if (!saved.ok) return { ok: false, error: saved.error };

  return { ok: true, iconUrl: `${clientIconServePath(uid)}?v=${encodeURIComponent(updatedAt)}` };
}

export async function clearClientPortalIcon(
  uid: string,
): Promise<{ ok: true; iconUrl: string } | { ok: false; error: string }> {
  const res = await getContact(uid);
  if (!res.ok) return { ok: false, error: res.error };

  const portal = extractPortal(res.data) ?? {};
  const next: ClientPortal = { ...portal, updatedAt: new Date().toISOString() };
  delete next.iconData;
  delete next.iconMediaType;
  delete next.iconSource;
  delete next.iconUrl;

  const saved = await setContactPortal(uid, next);
  if (!saved.ok) return { ok: false, error: saved.error };

  const refreshed = await getContact(uid);
  const refreshedPortal = refreshed.ok ? extractPortal(refreshed.data) : null;
  return { ok: true, iconUrl: resolveClientIconUrl(refreshedPortal, uid) };
}
