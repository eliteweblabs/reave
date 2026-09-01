import type { APIRoute } from 'astro';
import { brandingLogoAltPngGet } from '../../lib/brandingLogoRoute';

export const prerender = false;

export const GET: APIRoute = brandingLogoAltPngGet;
