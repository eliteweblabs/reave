/**
 * Public demo entry points — demo loader and optional live sandbox install.
 */
import { normalizePublicUrl } from './publicUrl';
import { serverEnv } from './serverEnv';

function resolvePublicDemoUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const url = normalizePublicUrl(trimmed);
  if (!url) return null;
  return url.href.replace(/\/$/, '');
}

/** Base URL of the live demo install (e.g. https://demo.reave.app). */
export function getPublicDemoSiteUrl(): string | null {
  return resolvePublicDemoUrl(serverEnv('PUBLIC_DEMO_URL'));
}

/** Admin dashboard on the demo install — opens sign-in if needed. */
export function getPublicDemoAdminUrl(): string | null {
  const base = getPublicDemoSiteUrl();
  return base ? `${base}/admin/` : null;
}

/** Client portal on the demo install (contact slug path). */
export function getPublicDemoPortalUrl(): string | null {
  const direct = resolvePublicDemoUrl(serverEnv('PUBLIC_DEMO_PORTAL_URL'));
  if (direct) return direct;

  const slug = serverEnv('PUBLIC_DEMO_PORTAL_SLUG')?.trim();
  const base = getPublicDemoSiteUrl();
  if (!slug || !base) return null;
  return `${base}/c/${encodeURIComponent(slug)}`;
}

export type PublicDemoOptions = {
  walkthroughHref: string;
  adminUrl: string | null;
  portalUrl: string | null;
  scheduleHref: string;
};

/** Resolved demo paths for marketing pages. */
export function getPublicDemoOptions(): PublicDemoOptions {
  return {
    walkthroughHref: '/demo-loader',
    adminUrl: getPublicDemoAdminUrl(),
    portalUrl: getPublicDemoPortalUrl(),
    scheduleHref: '/schedule',
  };
}
