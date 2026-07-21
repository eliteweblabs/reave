/**
 * Admin PWA manifest — install /admin to home screen.
 */
import type { APIRoute } from 'astro';
import { getCompanyConfig, companyFaviconUrls } from '../../lib/companyConfig';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const company = await getCompanyConfig(request);
  const shortName = company.name || 'Business OS';
  const favicons = companyFaviconUrls(company);
  const manifest = {
    id: '/admin',
    name: company.name ? `${company.name} Business OS` : 'Business OS',
    short_name: shortName.length > 12 ? `${shortName.slice(0, 12)}…` : shortName,
    description: 'Business OS — inbox, jobs, contacts',
    start_url: '/admin?tab=chats',
    scope: '/admin',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['business', 'productivity'],
    icons: [
      { src: favicons.png192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: favicons.png512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: favicons.png192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: favicons.png512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
