/**
 * CardDAV service discovery — RFC 6764
 * iOS probes /.well-known/carddav before account setup.
 */
import type { APIRoute } from 'astro';
import { wellKnownCardDavLocation } from '../../lib/carddav/server';

export const prerender = false;

function redirect(): Response {
  return new Response(null, {
    status: 301,
    headers: {
      Location: wellKnownCardDavLocation(),
      'Cache-Control': 'no-store',
    },
  });
}

export const GET: APIRoute = () => redirect();
export const PROPFIND: APIRoute = () => redirect();
