import type { APIRoute } from 'astro';
import { lookupWhois } from '../../../lib/dnsCheckClient';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { jsonResponse } from '../../../lib/apiResponse';
import { normalizeDomain } from '../../../lib/publicUrl';

export const prerender = false;

/** Lightweight WHOIS registrar lookup for public lead forms. */
export const GET: APIRoute = async ({ request, url }) => {
  const rate = checkInMemoryRateLimit(`domain-registrar:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 30,
  });
  if (!rate.ok) {
    return jsonResponse(
      { ok: false, error: 'Too many lookups. Please try again shortly.' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const domain = normalizeDomain(url.searchParams.get('domain') || '');
  if (!domain) {
    return jsonResponse({ ok: false, error: 'Enter a valid domain (e.g. example.com)' }, 400);
  }

  const whois = await lookupWhois(domain);
  if (whois.raw_error && !whois.registrar) {
    return jsonResponse({
      ok: true,
      domain,
      registrar: null,
      expires: null,
      lookup_note: 'Registrar lookup unavailable — we will confirm manually.',
    });
  }

  return jsonResponse({
    ok: true,
    domain,
    registrar: whois.registrar ?? null,
    expires: whois.expires ?? null,
  });
};
