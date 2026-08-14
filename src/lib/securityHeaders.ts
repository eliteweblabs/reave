/**
 * Browser security baseline applied to every HTML/API response.
 * CSP is enforced in production; report-only in dev so Clerk / Vapi integrations
 * can be tested without blocking.
 */
import { serverEnv } from './serverEnv';

/**
 * A production Clerk instance serves its Frontend API from a CNAME on the app's
 * own domain (e.g. `clerk.example.com`), which `'self'` does not cover. The host
 * is base64-encoded inside the publishable key, so derive it instead of pinning
 * another literal domain per install.
 */
function clerkInstanceOrigins(): string[] {
  const encoded = (serverEnv('PUBLIC_CLERK_PUBLISHABLE_KEY') ?? '').replace(/^pk_(test|live)_/, '');
  if (!encoded) return [];

  let host: string;
  try {
    host = atob(encoded).replace(/\$$/, '');
  } catch {
    return [];
  }
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) return [];

  // Clerk pairs the `clerk.` FAPI host with an `accounts.` hosted portal.
  const portal = host.startsWith('clerk.') ? `accounts.${host.slice(6)}` : '';
  return [`https://${host}`, ...(portal ? [`https://${portal}`] : [])];
}

const CLERK_SRC = ['https://*.clerk.accounts.dev', 'https://*.clerk.com', ...clerkInstanceOrigins()].join(' ');
/** Clerk bot protection (Turnstile) — without these the sign-up CAPTCHA never mounts. */
const CLERK_CAPTCHA_SRC = 'https://challenges.cloudflare.com https://*.protect.clerk.com';

const CSP_VALUE = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${CLERK_SRC} ${CLERK_CAPTCHA_SRC} https://cdn.jsdelivr.net https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com https://cdn.jsdelivr.net",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${CLERK_SRC} ${CLERK_CAPTCHA_SRC} https://clerk-telemetry.com https://*.clerk-telemetry.com https://cdn.jsdelivr.net https://api.vapi.ai https://*.vapi.ai wss://*.vapi.ai https://*.daily.co wss://*.daily.co https://cloudflareinsights.com https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://*.openstreetmap.org https://nominatim.openstreetmap.org`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  `frame-src 'self' ${CLERK_SRC} ${CLERK_CAPTCHA_SRC}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspEnforced(): boolean {
  return import.meta.env.PROD || serverEnv('CSP_ENFORCE') === '1';
}

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
  ...(cspEnforced()
    ? { 'Content-Security-Policy': CSP_VALUE }
    : { 'Content-Security-Policy-Report-Only': CSP_VALUE }),
};

/** Mutates `response` headers in place; skips if a header is already set upstream. */
export function applySecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) {
      response.headers.set(name, value);
    }
  }
  return response;
}
