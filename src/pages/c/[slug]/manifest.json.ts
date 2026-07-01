/**
 * Per-client web app manifest for the portal page (/c/<uid>).
 * Enables "Add to Home Screen" with the client's name as the app title.
 */
import type { APIRoute } from 'astro';
import { getContact, extractPortal, contactStringField } from '../../../lib/contactApi';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const uid = (params.slug ?? '').trim();
  let name = 'Client';

  if (uid) {
    const res = await getContact(uid);
    if (res.ok && !res.data.archived) {
      const portal = extractPortal(res.data);
      if (!portal || portal.enabled !== false) {
        name = contactStringField(res.data.name) || name;
        const logoUrl = contactStringField(portal?.logoUrl);
        const company = contactStringField(res.data.company);
        if (company) name = company;

        const icons = logoUrl
          ? [{ src: logoUrl, sizes: '192x192', type: 'image/png', purpose: 'any' }]
          : [
              { src: '/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            ];

        const startUrl = `/c/${encodeURIComponent(uid)}`;
        const manifest = {
          name,
          short_name: name.length > 12 ? `${name.slice(0, 12)}…` : name,
          start_url: startUrl,
          scope: startUrl,
          display: 'standalone',
          background_color: '#0a0a0a',
          theme_color: '#0a0a0a',
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
    name,
    short_name: name.length > 12 ? `${name.slice(0, 12)}…` : name,
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
