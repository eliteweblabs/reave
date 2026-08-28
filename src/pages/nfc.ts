/**
 * Short NFC alias — program chips to /nfc or /card.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(null, {
    status: 301,
    headers: { Location: '/card', 'Cache-Control': 'public, max-age=86400' },
  });
