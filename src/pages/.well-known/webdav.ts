/**
 * WebDAV service discovery — some clients probe /.well-known/webdav.
 */
import type { APIRoute } from 'astro';
import { wellKnownWebdavLocation } from '../../lib/mediaWebdav/server';

export const prerender = false;

function redirect(): Response {
  return new Response(null, {
    status: 301,
    headers: {
      Location: wellKnownWebdavLocation(),
      'Cache-Control': 'no-store',
    },
  });
}

export const GET: APIRoute = () => redirect();
export const PROPFIND: APIRoute = () => redirect();
