/**
 * Public pack/marketing "Login" → staff admin sign-in (Clerk), not /sign-in.
 */
import { serverEnv } from './serverEnv';

function normalizeHost(raw: string | undefined): string {
  return (
    raw
      ?.trim()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.replace(/^www\./, '')
      .toLowerCase() || ''
  );
}

/** Hostname staff auth runs on (admin.{client}), when set. */
export function clerkPrimaryAdminHost(): string {
  return normalizeHost(serverEnv('CLERK_PRIMARY_DOMAIN'));
}

export function isClerkPrimaryAdminHost(host: string): boolean {
  const primary = clerkPrimaryAdminHost();
  return Boolean(primary && normalizeHost(host) === primary);
}

/** e.g. CLERK_PRIMARY_DOMAIN=admin.pdx-paws.com or admin.{PLANNED_SITE_DOMAIN}. */
export function publicSignInHref(_request?: Request): string {
  const clerkPrimary = clerkPrimaryAdminHost();
  if (clerkPrimary) {
    return `https://${clerkPrimary}/admin/login`;
  }
  const planned = normalizeHost(serverEnv('PLANNED_SITE_DOMAIN'));
  if (planned) {
    return `https://admin.${planned}/admin/login`;
  }
  return '/admin/login';
}
