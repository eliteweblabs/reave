import type { APIRoute } from 'astro';
import { getCompanyConfig, companyFaviconUrls } from '../../../lib/companyConfig';
import { getContact, extractPortal, contactStringField } from '../../../lib/contactApi';
import { resolveClientIconUrl, resolveClientLogoUrl } from '../../../lib/clientBranding';

export const prerender = false;

function companyDefaultIcons(company: Awaited<ReturnType<typeof getCompanyConfig>>) {
  const favicons = companyFaviconUrls(company);
  return [
    { src: favicons.appleTouchIcon, sizes: '180x180', type: 'image/png', purpose: 'any' },
    { src: favicons.png192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: favicons.png512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: favicons.png192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: favicons.png512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
}

export const GET: APIRoute = async ({ params, request }) => {
  const uid = (params.slug ?? '').trim();
  let name = 'Contact';
  const company = await getCompanyConfig(request);
  const defaultIcons = companyDefaultIcons(company);
  const tileBg = company.iconBackground || '#0a0a0a';

  if (uid) {
    const res = await getContact(uid);
    if (res.ok && !res.data.archived) {
      const portal = extractPortal(res.data);
      if (!portal || portal.enabled !== false) {
        name = contactStringField(res.data.name) || name;
        const logoUrl = resolveClientLogoUrl(portal, uid);
        const iconUrl = resolveClientIconUrl(portal, uid);
        const contactCompany = contactStringField(res.data.company);
        if (contactCompany) name = contactCompany;

        const pwaIcon = iconUrl || logoUrl;
        const icons = pwaIcon
          ? [
              { src: pwaIcon, sizes: '192x192', type: 'image/png', purpose: 'any' },
              ...defaultIcons,
            ]
          : defaultIcons;

        const startUrl = `/c/${encodeURIComponent(uid)}`;
        const manifest = {
          id: startUrl,
          name,
          short_name: name.length > 12 ? `${name.slice(0, 12)}…` : name,
          start_url: startUrl,
          scope: startUrl,
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          background_color: tileBg,
          theme_color: tileBg,
          icons,
        };

        return new Response(JSON.stringify(manifest), {
          headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        });
      }
    }
  }

  const startUrl = `/c/${encodeURIComponent(uid)}`;
  const manifest = {
    id: startUrl,
    name,
    short_name: name.length > 12 ? `${name.slice(0, 12)}…` : name,
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: tileBg,
    theme_color: tileBg,
    icons: defaultIcons,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
