/**
 * Public company vCard — /contact.vcf
 *
 * Built from Admin → Profile (owner name, address) and Admin → Company
 * (org, phone, email, website, icon). Used on client portals and sales deck.
 */
import type { APIRoute } from 'astro';
import { buildCompanyContactVCard } from '../lib/carddav/vcard';
import { companyLogoUrl, getCompanyConfig } from '../lib/companyConfig';
import { getDeploymentOwnerProfile } from '../lib/deploymentOwner';
import { siteBaseUrl } from '../lib/requestOrigin';

export const prerender = false;

function absoluteAssetUrl(request: Request, path: string): string {
  const p = path.trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const base = siteBaseUrl(request).replace(/\/+$/, '');
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

export const GET: APIRoute = async (context) => {
  const { request } = context;
  const [org, owner] = await Promise.all([
    getCompanyConfig(request),
    getDeploymentOwnerProfile(context),
  ]);

  const orgName = org.legalName?.trim() || org.name?.trim() || 'Contact';
  const displayName = org.name?.trim() || orgName;
  const phone = org.supportPhone?.trim() || owner?.phone || '';
  const email = org.supportEmail?.trim() || owner?.email || '';
  const website = org.domain
    ? `https://${org.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : '';

  const iconPath = companyLogoUrl(org.iconPath, org.iconVersion);
  const photoUrl = iconPath ? absoluteAssetUrl(request, iconPath) : '';

  const body = buildCompanyContactVCard({
    firstName: owner?.firstName || '',
    lastName: owner?.lastName || '',
    fullName: owner?.fullName || displayName,
    orgName: orgName,
    phone,
    email,
    website,
    address: owner?.address?.trim() || org.address?.trim() || '',
    photoUrl,
  });

  const filenameBase =
    owner?.fullName?.replace(/[^\w.-]+/g, '_') ||
    displayName.replace(/[^\w.-]+/g, '_') ||
    'contact';

  return new Response(body, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.vcf"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
};
