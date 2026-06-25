/**
 * CardDAV catch-all — /carddav/*
 *
 * Native iOS Contacts sync (Settings → Contacts → Add Account → CardDAV).
 * Backed by contact-api; auth via HTTP Basic or X-CardDAV-Token / X-API-Key.
 */
import type { APIRoute } from 'astro';
import { requireCardDavAuth } from '../../lib/carddav/auth';
import { handleCardDav } from '../../lib/carddav/server';

export const prerender = false;

async function dispatch(context: Parameters<APIRoute>[0]): Promise<Response> {
  const auth = requireCardDavAuth(context.request);
  if (auth instanceof Response) return auth;
  return handleCardDav(context.request, context.params.path?.split('/').filter(Boolean), auth);
}

export const OPTIONS: APIRoute = dispatch;
export const GET: APIRoute = dispatch;
export const PUT: APIRoute = dispatch;
export const DELETE: APIRoute = dispatch;
export const PROPFIND: APIRoute = dispatch;
export const REPORT: APIRoute = dispatch;

export const ALL: APIRoute = async (context) => {
  const method = context.request.method.toUpperCase();
  if (['OPTIONS', 'GET', 'PUT', 'DELETE', 'PROPFIND', 'REPORT', 'HEAD'].includes(method)) {
    return dispatch(context);
  }
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT' },
  });
};
