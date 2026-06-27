/**
 * Admin PWA manifest — install /admin to home screen.
 */
import type { APIRoute } from 'astro';
import { SITE } from '../../config/site';

export const prerender = false;

export const GET: APIRoute = async () => {
  const manifest = {
    name: 'Reave Business OS',
    short_name: 'Reave',
    description: 'Business OS — inbox, jobs, contacts',
    start_url: '/admin?tab=chats',
    scope: '/admin',
    display: 'standalone',
    background_color: '#0a0d14',
    theme_color: '#0a0d14',
    icons: [
      { src: SITE.favicons.png192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: SITE.favicons.png512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
