/**
 * CardDAV subpaths — /carddav/*
 */
import type { APIRoute } from 'astro';
import { dispatchCardDav } from '../../lib/carddav/route';

export const prerender = false;

export const OPTIONS: APIRoute = dispatchCardDav;
export const GET: APIRoute = dispatchCardDav;
export const PUT: APIRoute = dispatchCardDav;
export const DELETE: APIRoute = dispatchCardDav;
export const PROPFIND: APIRoute = dispatchCardDav;
export const REPORT: APIRoute = dispatchCardDav;

export const ALL: APIRoute = async (context) => {
  const method = context.request.method.toUpperCase();
  if (['OPTIONS', 'GET', 'PUT', 'DELETE', 'PROPFIND', 'REPORT', 'HEAD'].includes(method)) {
    return dispatchCardDav(context);
  }
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT' },
  });
};
