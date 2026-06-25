/**
 * CardDAV service discovery — RFC 6764
 * iOS probes /.well-known/carddav before account setup.
 */
import type { APIRoute } from 'astro';
import { wellKnownCardDavLocation } from '../../lib/carddav/server';

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  const origin = new URL(request.url).origin;
  return new Response(null, {
    status: 301,
    headers: {
      Location: wellKnownCardDavLocation(origin),
      'Cache-Control': 'no-store',
    },
  });
};

export const PROPFIND: APIRoute = ({ request }) => {
  const origin = new URL(request.url).origin;
  return new Response(null, {
    status: 301,
    headers: {
      Location: wellKnownCardDavLocation(origin),
      'Cache-Control': 'no-store',
    },
  });
};
