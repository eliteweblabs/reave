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

/** e.g. CLERK_PRIMARY_DOMAIN=admin.pdx-paws.com or admin.{PLANNED_SITE_DOMAIN}. */
export function publicSignInHref(_request?: Request): string {
  const clerkPrimary = normalizeHost(serverEnv('CLERK_PRIMARY_DOMAIN'));
  if (clerkPrimary) {
    return `https://${clerkPrimary}/admin/login`;
  }
  const planned = normalizeHost(serverEnv('PLANNED_SITE_DOMAIN'));
  if (planned) {
    return `https://admin.${planned}/admin/login`;
  }
  return '/admin/login';
}
