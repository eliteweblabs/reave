import type { APIRoute } from 'astro';
import { brandingLogoPngGet } from '../../../lib/brandingLogoRoute';

export const prerender = false;

/** Legacy alias of /branding/logo.png */
export const GET: APIRoute = brandingLogoPngGet;
