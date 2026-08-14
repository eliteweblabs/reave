import type { APIRoute } from 'astro';
import { davDiscoveryHeaders, requireMediaWebdavAuth } from './auth';
import { handleMediaWebdav } from './server';

const HANDLED = new Set(['OPTIONS', 'GET', 'HEAD', 'PUT', 'DELETE', 'PROPFIND', 'LOCK', 'UNLOCK', 'MKCOL']);

export const dispatchMediaWebdav: APIRoute = async (context) => {
  const method = context.request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return handleMediaWebdav(context.request, [], {
      username: 'anonymous',
      method: 'basic',
      source: 'media',
    });
  }
  if (!HANDLED.has(method)) {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: davDiscoveryHeaders(),
    });
  }

  const auth = requireMediaWebdavAuth(context.request);
  if (auth instanceof Response) return auth;

  const raw = context.params.path;
  const segments =
    typeof raw === 'string' ? raw.split('/').filter(Boolean) : [];

  return handleMediaWebdav(context.request, segments, auth);
};
