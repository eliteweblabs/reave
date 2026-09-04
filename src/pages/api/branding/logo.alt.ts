import type { APIRoute } from 'astro';
import { brandingLogoAltPngGet } from '../../../lib/brandingLogoRoute';

export const prerender = false;

/** Wordmark for dark backgrounds (Galene, dark nav). */
export const GET: APIRoute = brandingLogoAltPngGet;
