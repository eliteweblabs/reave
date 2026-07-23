/**
 * Client portal logo/icon uploads — stored in contact portal metadata,
 * served from /api/clients/:uid/logo and /api/clients/:uid/icon.
 */
import {
  contactStringField,
  extractPortal,
  getContact,
  setContactPortal,
  type ClientPortal,
} from './contactApi';

export function clientLogoServePath(uid: string): string {
  return `/api/clients/${encodeURIComponent(uid.trim())}/logo`;
}

export function clientIconServePath(uid: string): string {
  return `/api/clients/${encodeURIComponent(uid.trim())}/icon`;
}

export function resolveClientLogoUrl(portal: ClientPortal | null | undefined, uid: string): string {
  if (!portal) return '';
  if (portal.logoSource === 'upload') {
    const v = portal.updatedAt ? `?v=${encodeURIComponent(portal.updatedAt)}` : '';
    return `${clientLogoServePath(uid)}${v}`;
  }
  return contactStringField(portal.logoUrl) || '';
}

export function resolveClientIconUrl(portal: ClientPortal | null | undefined, uid: string): string {
  if (!portal) return '';
  if (portal.iconSource === 'upload') {
    const v = portal.updatedAt ? `?v=${encodeURIComponent(portal.updatedAt)}` : '';
    return `${clientIconServePath(uid)}${v}`;
  }
  const iconUrl = contactStringField(portal.iconUrl);
  if (iconUrl) return iconUrl;
  return resolveClientLogoUrl(portal, uid);
}

export type ClientBrandingBlob = {
  dataBase64: string;
  mediaType: string;
};

export async function getClientPortalLogoBlob(
  uid: string,
): Promise<(ClientBrandingBlob & { updatedAt?: string }) | null> {
  const res = await getContact(uid);
  if (!res.ok) return null;
  const portal = extractPortal(res.data);
  if (portal?.logoSource !== 'upload' || !portal.logoData || !portal.logoMediaType) return null;
  return {
    dataBase64: portal.logoData,
    mediaType: portal.logoMediaType,
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

  return { ok: true, logoUrl: `${clientLogoServePath(uid)}?v=${encodeURIComponent(updatedAt)}` };
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
  if (next.iconUrl === clientIconServePath(uid) || next.iconUrl?.startsWith(`${clientIconServePath(uid)}?`)) {
    delete next.iconUrl;
  }

  const saved = await setContactPortal(uid, next);
  if (!saved.ok) return { ok: false, error: saved.error };

  const refreshed = await getContact(uid);
  const refreshedPortal = refreshed.ok ? extractPortal(refreshed.data) : null;
  return { ok: true, iconUrl: resolveClientIconUrl(refreshedPortal, uid) };
}
