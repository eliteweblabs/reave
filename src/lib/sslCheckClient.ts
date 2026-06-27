/**
 * SSL certificate, TLS, security headers, and mixed-content audit.
 */
import * as tls from 'node:tls';
import * as cheerio from 'cheerio';
import { normalizePublicUrl } from './publicUrl';

const USER_AGENT =
  'Mozilla/5.0 (compatible; SiteAuditBot/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CONNECT_TIMEOUT_MS = 12_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 1_500_000;

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
] as const;

export type SecurityHeaderKey = (typeof SECURITY_HEADERS)[number];

export type SslCheckResponse =
  | {
      ok: true;
      url: string;
      certificate: {
        subject: string;
        issuer: string;
        valid_from: string;
        valid_to: string;
        days_until_expiry: number;
        subject_alt_names: string[];
      };
      tls: { protocol: string; authorized: boolean; error?: string };
      security_headers: Record<
        SecurityHeaderKey,
        { present: boolean; value?: string }
      >;
      mixed_content: { count: number; samples: string[] };
      grade: 'A' | 'B' | 'C' | 'D' | 'F';
      issues: string[];
    }
  | { ok: false; error: string };

function daysUntil(iso: string): number {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return -9999;
  return Math.floor((end - Date.now()) / (24 * 60 * 60 * 1000));
}

function certSubject(cert: tls.PeerCertificate): string {
  const sub = cert.subject as unknown as Record<string, string | undefined> | undefined;
  return sub?.CN ?? sub?.O ?? '';
}

function certIssuer(cert: tls.PeerCertificate): string {
  const iss = cert.issuer as unknown as Record<string, string | undefined> | undefined;
  return iss?.O ?? iss?.CN ?? 'unknown';
}

function inspectTls(hostname: string, port = 443): Promise<{
  cert: tls.PeerCertificate;
  protocol: string;
  authorized: boolean;
  authorizationError?: string;
}> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TLS connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`));
    }, CONNECT_TIMEOUT_MS);

    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: true },
      () => {
        clearTimeout(timer);
        const cert = socket.getPeerCertificate();
        resolve({
          cert,
          protocol: socket.getProtocol?.() ?? 'unknown',
          authorized: socket.authorized,
          authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined,
        });
        socket.end();
      },
    );
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function fetchHeaders(url: URL): Promise<Record<string, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res = await fetch(url.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      });
    }
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  } finally {
    clearTimeout(timer);
  }
}

function findMixedContent(html: string, pageUrl: URL): string[] {
  const $ = cheerio.load(html);
  const samples = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw?.trim()) return;
    const val = raw.trim();
    if (/^http:\/\//i.test(val)) samples.add(val.slice(0, 200));
    if (/url\(\s*['"]?http:\/\//i.test(val)) {
      const m = val.match(/http:\/\/[^\s'")]+/i);
      if (m) samples.add(m[0].slice(0, 200));
    }
  };

  $('img[src], script[src], iframe[src], audio[src], video[src], source[src], link[href]').each((_, el) => {
    add($(el).attr('src') ?? $(el).attr('href'));
  });
  $('a[href]').each((_, el) => add($(el).attr('href')));
  $('[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset') ?? '';
    for (const part of srcset.split(',')) add(part.trim().split(/\s+/)[0]);
  });

  if (pageUrl.protocol === 'https:') {
    return [...samples].slice(0, 15);
  }
  return [];
}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
    });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_HTML_BYTES));
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  } finally {
    clearTimeout(timer);
  }
}

function auditHeaders(
  raw: Record<string, string>,
): Record<SecurityHeaderKey, { present: boolean; value?: string }> {
  const out = {} as Record<SecurityHeaderKey, { present: boolean; value?: string }>;
  for (const name of SECURITY_HEADERS) {
    let value = raw[name];
    if (!value && name === 'permissions-policy') {
      value = raw['feature-policy'];
    }
    out[name] = value?.trim()
      ? { present: true, value: value.trim().slice(0, 300) }
      : { present: false };
  }
  return out;
}

function computeGrade(input: {
  authorized: boolean;
  daysUntilExpiry: number;
  protocol: string;
  headers: Record<SecurityHeaderKey, { present: boolean }>;
  mixedCount: number;
  pageHttps: boolean;
}): { grade: 'A' | 'B' | 'C' | 'D' | 'F'; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  if (!input.authorized) {
    score -= 45;
    issues.push('Certificate is not trusted or validation failed');
  }
  if (input.daysUntilExpiry < 0) {
    score -= 40;
    issues.push('Certificate has expired');
  } else if (input.daysUntilExpiry < 7) {
    score -= 25;
    issues.push(`Certificate expires in ${input.daysUntilExpiry} days`);
  } else if (input.daysUntilExpiry < 30) {
    score -= 12;
    issues.push(`Certificate expires in ${input.daysUntilExpiry} days`);
  }

  const proto = input.protocol.toLowerCase();
  if (!proto.includes('tlsv1.2') && !proto.includes('tlsv1.3')) {
    score -= 20;
    issues.push(`Weak or unknown TLS protocol: ${input.protocol}`);
  } else if (!proto.includes('tlsv1.3')) {
    score -= 5;
    issues.push('TLS 1.3 not negotiated (TLS 1.2 in use)');
  }

  for (const h of SECURITY_HEADERS) {
    if (!input.headers[h].present) {
      score -= 7;
      issues.push(`Missing ${h} header`);
    }
  }

  if (input.pageHttps && input.mixedCount > 0) {
    const penalty = Math.min(input.mixedCount * 4, 24);
    score -= penalty;
    issues.push(`${input.mixedCount} mixed-content HTTP resource(s) on HTTPS page`);
  }

  if (!input.pageHttps) {
    score -= 15;
    issues.push('Page served over HTTP, not HTTPS');
  }

  const grade =
    score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  return { grade, issues };
}

export async function sslCheck(urlInput: string): Promise<SslCheckResponse> {
  const url = normalizePublicUrl(urlInput, true);
  if (!url) {
    return { ok: false, error: 'Invalid or blocked URL (http/https only; no localhost/private IPs)' };
  }

  const hostname = url.hostname;
  const port = url.port ? Number(url.port) : 443;

  let certInfo: tls.PeerCertificate;
  let protocol = 'unknown';
  let authorized = false;
  let authError: string | undefined;

  try {
    const tlsResult = await inspectTls(hostname, port);
    certInfo = tlsResult.cert;
    protocol = tlsResult.protocol;
    authorized = tlsResult.authorized;
    authError = tlsResult.authorizationError;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `TLS inspection failed: ${msg}` };
  }

  const validFrom = certInfo.valid_from ?? '';
  const validTo = certInfo.valid_to ?? '';
  const expiryDays = daysUntil(validTo);
  const altNames = Array.isArray(certInfo.subjectaltname)
    ? certInfo.subjectaltname.split(',').map((s) => s.replace(/^DNS:/i, '').trim()).filter(Boolean)
    : typeof certInfo.subjectaltname === 'string'
      ? certInfo.subjectaltname.split(',').map((s) => s.replace(/^DNS:/i, '').trim()).filter(Boolean)
      : [];

  let headerMap: Record<string, string> = {};
  try {
    headerMap = await fetchHeaders(url);
  } catch (e) {
    headerMap = {};
  }

  const security_headers = auditHeaders(headerMap);

  let mixedSamples: string[] = [];
  try {
    const html = await fetchHtml(url);
    mixedSamples = findMixedContent(html, url);
  } catch {
    mixedSamples = [];
  }

  const pageHttps = url.protocol === 'https:';
  const { grade, issues } = computeGrade({
    authorized,
    daysUntilExpiry: expiryDays,
    protocol,
    headers: security_headers,
    mixedCount: mixedSamples.length,
    pageHttps,
  });

  if (authError && authorized === false) {
    issues.unshift(`Authorization error: ${authError}`);
  }

  return {
    ok: true,
    url: url.toString(),
    certificate: {
      subject: certSubject(certInfo) || hostname,
      issuer: certIssuer(certInfo),
      valid_from: validFrom,
      valid_to: validTo,
      days_until_expiry: expiryDays,
      subject_alt_names: altNames.slice(0, 20),
    },
    tls: { protocol, authorized, ...(authError ? { error: authError } : {}) },
    security_headers,
    mixed_content: { count: mixedSamples.length, samples: mixedSamples },
    grade,
    issues,
  };
}

export function formatSslCheckResults(result: Extract<SslCheckResponse, { ok: true }>): string {
  const lines = [
    `SSL / security audit — ${result.url}`,
    `Grade: ${result.grade}`,
    `TLS: ${result.tls.protocol}${result.tls.authorized ? '' : ' (not trusted)'}`,
    `Cert: ${result.certificate.subject} — expires ${result.certificate.valid_to} (${result.certificate.days_until_expiry}d)`,
    `Issuer: ${result.certificate.issuer}`,
  ];
  const missing = SECURITY_HEADERS.filter((h) => !result.security_headers[h].present);
  if (missing.length) lines.push(`Missing headers: ${missing.join(', ')}`);
  if (result.mixed_content.count) {
    lines.push(`Mixed content: ${result.mixed_content.count} HTTP resource(s)`);
  }
  if (result.issues.length) {
    lines.push('', 'Issues:', ...result.issues.slice(0, 12).map((i) => `• ${i}`));
  }
  return lines.join('\n');
}
