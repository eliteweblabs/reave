import type { APIRoute } from 'astro';
import { brandingLogoPngGet } from '../../lib/brandingLogoRoute';

export const prerender = false;

export const GET: APIRoute = brandingLogoPngGet;