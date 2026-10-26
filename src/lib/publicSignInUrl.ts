/**
 * Public marketing "Login" links — client installs use /admin/login (Clerk),
 * not /sign-in (PWA sheet on official hosts only).
 */
import { isDeployWizardRailwayPublicHost } from './deployWizardCatalog';
import { isOfficialReavePublicHost } from './installConfig';
import { isReaveMarketingHost, resolvePublicHost } from './requestHost';
import { serverEnv } from './serverEnv';

export function publicSignInHref(request: Request): string {
  const host = resolvePublicHost(request);
  if (isReaveMarketingHost(host) || isOfficialReavePublicHost()) {
    return '/sign-in';
  }
  const clerkPrimary =
    serverEnv('CLERK_PRIMARY_DOMAIN')
      ?.trim()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.toLowerCase() || '';
  if (clerkPrimary && isDeployWizardRailwayPublicHost(host)) {
    return `https://${clerkPrimary}/admin/login`;
  }
  return '/admin/login';
}
