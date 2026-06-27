/**
 * DNS health, email authentication (SPF/DKIM/DMARC), and WHOIS basics.
 */
import { Resolver } from 'node:dns/promises';
import whois from 'whois-json';
import { normalizeDomain } from './publicUrl';

const PUBLIC_RESOLVERS = [
  { name: 'system', servers: undefined as string[] | undefined },
  { name: 'google', servers: ['8.8.8.8', '8.8.4.4'] },
  { name: 'cloudflare', servers: ['1.1.1.1', '1.0.0.1'] },
];

const DKIM_SELECTORS = ['default', 'google', 'k1', 'selector1', 's1', 'dkim', 'mail'];

export type DnsRecordSet = {
  A: string[];
  AAAA: string[];
  CNAME: string[];
  MX: { priority: number; exchange: string }[];
  NS: string[];
  TXT: string[];
};

export type EmailAuthResult = {
  spf: { present: boolean; valid: boolean; record?: string };
  dkim: { selectors_checked: string[]; found: { selector: string; record: string }[] };
  dmarc: { present: boolean; policy?: string; record?: string };
};

export type WhoisBasics = {
  registrar?: string;
  created?: string;
  expires?: string;
  days_until_expiry?: number;
  raw_error?: string;
};

export type DnsCheckResponse =
  | {
      ok: true;
      domain: string;
      records: DnsRecordSet;
      nameservers: string[];
      email_auth: EmailAuthResult;
      whois: WhoisBasics;
      propagation: {
        consistent: boolean;
        A_records_by_resolver: Record<string, string[]>;
      };
    }
  | { ok: false; error: string };

function resolverFor(servers?: string[]): Resolver {
  const r = new Resolver();
  if (servers?.length) r.setServers(servers);
  return r;
}

async function safeResolve<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function lookupRecords(domain: string): Promise<DnsRecordSet> {
  const r = resolverFor();
  const [a, aaaa, cname, mx, ns, txt] = await Promise.all([
    safeResolve(() => r.resolve4(domain), [] as string[]),
    safeResolve(() => r.resolve6(domain), [] as string[]),
    safeResolve(() => r.resolveCname(domain), [] as string[]),
    safeResolve(() => r.resolveMx(domain), [] as { priority: number; exchange: string }[]),
    safeResolve(() => r.resolveNs(domain), [] as string[]),
    safeResolve(() => r.resolveTxt(domain), [] as string[][]),
  ]);

  return {
    A: a,
    AAAA: aaaa,
    CNAME: cname,
    MX: mx.map((row) => ({ priority: row.priority, exchange: row.exchange })),
    NS: ns,
    TXT: txt.map((parts) => parts.join('')),
  };
}

function parseSpf(txtRecords: string[]): EmailAuthResult['spf'] {
  const spf = txtRecords.find((t) => /^v=spf1/i.test(t.trim()));
  if (!spf) return { present: false, valid: false };
  const valid = /\s-all|\s~all|\s\?all|-all|~all|\?all/i.test(spf);
  return { present: true, valid, record: spf.slice(0, 500) };
}

function parseDmarc(txtRecords: string[]): EmailAuthResult['dmarc'] {
  const dmarc = txtRecords.find((t) => /^v=DMARC1/i.test(t.trim()));
  if (!dmarc) return { present: false };
  const policyMatch = dmarc.match(/;\s*p\s*=\s*(\w+)/i);
  return {
    present: true,
    policy: policyMatch?.[1]?.toLowerCase(),
    record: dmarc.slice(0, 500),
  };
}

async function checkDkim(domain: string): Promise<EmailAuthResult['dkim']> {
  const r = resolverFor();
  const found: { selector: string; record: string }[] = [];
  for (const selector of DKIM_SELECTORS) {
    const host = `${selector}._domainkey.${domain}`;
    try {
      const rows = await r.resolveTxt(host);
      const flat = rows.map((p) => p.join('')).join('');
      if (flat && /v=DKIM1/i.test(flat)) {
        found.push({ selector, record: flat.slice(0, 400) });
      }
    } catch {
      // selector not published
    }
  }
  return { selectors_checked: DKIM_SELECTORS, found };
}

async function lookupWhois(domain: string): Promise<WhoisBasics> {
  try {
    const data = (await whois(domain)) as Record<string, unknown>;
    const registrar =
      pickString(data, ['registrar', 'Registrar', 'registrarName', 'registrar_name']) ??
      pickString(data, ['registrantOrganization']);
    const created = pickString(data, ['creationDate', 'createdDate', 'created', 'Creation Date']);
    const expires = pickString(data, [
      'registryExpiryDate',
      'expirationDate',
      'expires',
      'Expiry Date',
      'Registrar Registration Expiration Date',
    ]);
    let days_until_expiry: number | undefined;
    if (expires) {
      const t = new Date(expires).getTime();
      if (!Number.isNaN(t)) {
        days_until_expiry = Math.floor((t - Date.now()) / (24 * 60 * 60 * 1000));
      }
    }
    return { registrar, created, expires, days_until_expiry };
  } catch (e) {
    return { raw_error: e instanceof Error ? e.message : String(e) };
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  }
  return undefined;
}

async function checkPropagation(domain: string): Promise<DnsCheckResponse extends { ok: true } ? DnsCheckResponse['propagation'] : never> {
  const byResolver: Record<string, string[]> = {};
  for (const { name, servers } of PUBLIC_RESOLVERS) {
    const r = resolverFor(servers);
    byResolver[name] = await safeResolve(() => r.resolve4(domain), []);
  }
  const signatures = Object.values(byResolver).map((a) => [...a].sort().join(','));
  const consistent = signatures.every((s) => s === signatures[0]);
  return { consistent, A_records_by_resolver: byResolver } as never;
}

export async function dnsCheck(domainInput: string): Promise<DnsCheckResponse> {
  const domain = normalizeDomain(domainInput);
  if (!domain) {
    return { ok: false, error: 'Invalid domain (hostname only, no protocol or path)' };
  }

  const records = await lookupRecords(domain);
  const dmarcHost = `_dmarc.${domain}`;
  const dmarcTxt = await safeResolve(async () => {
    const r = resolverFor();
    const rows = await r.resolveTxt(dmarcHost);
    return rows.map((p) => p.join(''));
  }, [] as string[]);

  const email_auth: EmailAuthResult = {
    spf: parseSpf(records.TXT),
    dkim: await checkDkim(domain),
    dmarc: parseDmarc(dmarcTxt),
  };

  const [whoisResult, propagation] = await Promise.all([
    lookupWhois(domain),
    checkPropagation(domain),
  ]);

  return {
    ok: true,
    domain,
    records,
    nameservers: records.NS,
    email_auth,
    whois: whoisResult,
    propagation,
  };
}

export function formatDnsCheckResults(result: Extract<DnsCheckResponse, { ok: true }>): string {
  const lines = [`DNS check — ${result.domain}`, ''];

  if (result.records.A.length) lines.push(`A: ${result.records.A.join(', ')}`);
  if (result.records.AAAA.length) lines.push(`AAAA: ${result.records.AAAA.slice(0, 4).join(', ')}`);
  if (result.records.CNAME.length) lines.push(`CNAME: ${result.records.CNAME.join(', ')}`);
  if (result.records.MX.length) {
    lines.push(`MX: ${result.records.MX.map((m) => `${m.priority} ${m.exchange}`).join('; ')}`);
  }
  if (result.nameservers.length) lines.push(`NS: ${result.nameservers.join(', ')}`);

  lines.push('');
  lines.push(`SPF: ${result.email_auth.spf.present ? (result.email_auth.spf.valid ? 'present (valid)' : 'present (weak/missing -all)') : 'missing'}`);
  lines.push(`DKIM: ${result.email_auth.dkim.found.length ? `found (${result.email_auth.dkim.found.map((d) => d.selector).join(', ')})` : 'not found (common selectors checked)'}`);
  lines.push(`DMARC: ${result.email_auth.dmarc.present ? `present (p=${result.email_auth.dmarc.policy ?? '?'})` : 'missing'}`);

  if (result.whois.registrar || result.whois.expires) {
    lines.push('');
    if (result.whois.registrar) lines.push(`Registrar: ${result.whois.registrar}`);
    if (result.whois.expires) {
      lines.push(`Domain expires: ${result.whois.expires}${result.whois.days_until_expiry != null ? ` (${result.whois.days_until_expiry}d)` : ''}`);
    }
  } else if (result.whois.raw_error) {
    lines.push('', `WHOIS: unavailable (${result.whois.raw_error.slice(0, 120)})`);
  }

  lines.push('');
  lines.push(`A-record propagation: ${result.propagation.consistent ? 'consistent across resolvers' : 'inconsistent — check DNS propagation'}`);

  return lines.join('\n');
}
