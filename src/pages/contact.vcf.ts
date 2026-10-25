/**
 * Public company vCard — /contact.vcf
 *
 * Built from Admin → Profile (owner name, address) and Admin → Company
 * (org, phone, email, website, icon). Used on client portals and sales deck.
 */
import type { APIRoute } from 'astro';
import { buildCompanyContactVCard } from '../lib/carddav/vcard';
import { companyStaffAvatarUrl, getCompanyConfig } from '../lib/companyConfig';
import {
  cardContactDisplayName,
  parseCardNameParams,
  parseCardUserParam,
  resolveCardSubject,
} from '../lib/cardSubject';
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
  const org = await getCompanyConfig(request);
  const cardUserParam = parseCardUserParam(context.url.searchParams.get('user'));
  const cardNameParams = parseCardNameParams(context.url.searchParams);
  const cardSubject = await resolveCardSubject(context, {
    userIdParam: cardUserParam,
    firstNameParam: cardNameParams?.first ?? null,
    lastNameParam: cardNameParams?.last ?? null,
  });
  const person = cardSubject.profile;

  const orgName = org.legalName?.trim() || org.name?.trim() || 'Contact';
  const displayName = org.name?.trim() || orgName;
  const contactName = cardContactDisplayName(person, displayName);
  const phone =
    person?.cardIncludePhone === false
      ? ''
      : person?.phone?.trim() ||
        org.supportPhone?.trim() ||
        '';
  const email =
    person?.email?.trim() ||
    org.supportEmail?.trim() ||
    '';
  const website = org.domain
    ? `https://${org.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : '';

  const photoUrl = absoluteAssetUrl(request, companyStaffAvatarUrl(org));

  const body = buildCompanyContactVCard({
    firstName: person?.firstName || '',
    lastName: person?.lastName || '',
    fullName: person?.fullName || contactName,
    orgName: orgName,
    phone,
    email,
    website,
    address: person?.address?.trim() || org.address?.trim() || '',
    photoUrl,
  });

  const filenameBase =
    person?.fullName?.replace(/[^\w.-]+/g, '_') ||
    contactName.replace(/[^\w.-]+/g, '_') ||
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
