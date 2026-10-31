/**
 * Work Day PWA manifest — install /field to home screen.
 */
import type { APIRoute } from 'astro';
import { getCompanyConfig, companyFaviconUrls } from '../../lib/companyConfig';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const company = await getCompanyConfig(request);
  const shortName = 'Work Day';
  const favicons = companyFaviconUrls(company);
  const manifest = {
    id: '/field',
    name: `${company.name || 'Business'} — Work Day`,
    short_name: shortName,
    description: 'Field work toggle — time and GPS per client property',
    start_url: '/field/',
    scope: '/field',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['business', 'productivity'],
    icons: [
      { src: favicons.appleTouchIcon, sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: favicons.png192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: favicons.png512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: favicons.png192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: favicons.png512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    related_applications: [
      {
        platform: 'webapp',
        url: '/field/manifest.webmanifest',
        id: '/field',
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
