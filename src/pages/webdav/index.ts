/**
 * Media library WebDAV root — /webdav and /webdav/
 */
import type { APIRoute } from 'astro';
import { dispatchMediaWebdav } from '../../lib/mediaWebdav/route';

export const prerender = false;

export const OPTIONS: APIRoute = dispatchMediaWebdav;
export const GET: APIRoute = dispatchMediaWebdav;
export const HEAD: APIRoute = dispatchMediaWebdav;
export const PUT: APIRoute = dispatchMediaWebdav;
export const DELETE: APIRoute = dispatchMediaWebdav;
export const PROPFIND: APIRoute = dispatchMediaWebdav;
export const LOCK: APIRoute = dispatchMediaWebdav;
export const UNLOCK: APIRoute = dispatchMediaWebdav;
export const MKCOL: APIRoute = dispatchMediaWebdav;

export const ALL: APIRoute = dispatchMediaWebdav;
