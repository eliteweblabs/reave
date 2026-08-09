/**
 * Trace website A-record IPs to a hosting company and assign a rating hint.
 *
 * Combines reverse DNS (PTR), ipwho.is org/ISP/ASN, and NS/CNAME hostname
 * fingerprints. Used by dns_check so audits can distinguish managed WP
 * (Flywheel / Kinsta / WP Engine) from budget shared hosts (GoDaddy / Bluehost)
 * and call out server-resource bottlenecks when the front-end build looks clean
 * but Lighthouse speed is still poor.
 */

import { Resolver } from 'node:dns/promises';

const IPWHO_TIMEOUT_MS = 6_000;
const PTR_TIMEOUT_MS = 4_000;
const MAX_IPS = 3;

export type HostingTier =
  | 'managed_wordpress'
  | 'cloud_paas'
  | 'shared_budget'
  | 'vps_cloud'
  | 'cdn'
  | 'unknown';

export type HostingConfidence = 'high' | 'medium' | 'low';

export type HostingRatingHint = {
  /** Internal quality hint from IP/ASN (A≈managed WP healthy; used for Performance notes, not a client tile). */
  hosting_grade: 'A' | 'B' | 'C' | 'D';
  /** Short note for the audit writeup. */
  note: string;
  /**
   * When true, a slow Lighthouse score with a lean page weight should be
   * attributed to underpowered shared hosting — not front-end bloat.
   */
  attribute_slow_speed_to_resources: boolean;
};

export type HostingIpDetail = {
  ip: string;
  ptr: string[];
  org?: string;
  isp?: string;
  asn?: string;
  country?: string;
};

export type HostingLookupResult = {
  company: string;
  tier: HostingTier;
  confidence: HostingConfidence;
  signals: string[];
  rating: HostingRatingHint;
  ips: HostingIpDetail[];
};

type BrandRule = {
  company: string;
  tier: HostingTier;
  /** Matched against PTR, org, isp, ASN, NS, CNAME (lowercased haystack). */
  patterns: RegExp[];
};

const BRAND_RULES: BrandRule[] = [
  // Managed WordPress
  {
    company: 'Flywheel',
    tier: 'managed_wordpress',
    patterns: [/flywheel/i, /flywheelsites\.com/i, /getflywheel/i],
  },
  {
    company: 'WP Engine',
    tier: 'managed_wordpress',
    patterns: [/wp\s*engine/i, /wpengine/i, /wpenginepowered\.com/i],
  },
  {
    company: 'Kinsta',
    tier: 'managed_wordpress',
    patterns: [/kinsta/i],
  },
  {
    company: 'Pressable',
    tier: 'managed_wordpress',
    patterns: [/pressable/i],
  },
  {
    company: 'Pagely',
    tier: 'managed_wordpress',
    patterns: [/pagely/i],
  },

  // Budget / shared
  {
    company: 'GoDaddy',
    tier: 'shared_budget',
    patterns: [
      /godaddy/i,
      /secureserver\.net/i,
      /domaincontrol\.com/i,
      /hostedresource\.com/i,
      /websitewelcome\.com/i,
    ],
  },
  {
    company: 'Bluehost',
    tier: 'shared_budget',
    patterns: [/bluehost/i, /unifiedlayer\.com/i],
  },
  {
    company: 'HostGator',
    tier: 'shared_budget',
    patterns: [/hostgator/i],
  },
  {
    company: 'Hostinger',
    tier: 'shared_budget',
    patterns: [/hostinger/i],
  },
  {
    company: 'SiteGround',
    tier: 'shared_budget',
    patterns: [/siteground/i, /\bsgvps\.net\b/i],
  },
  {
    company: 'DreamHost',
    tier: 'shared_budget',
    patterns: [/dreamhost/i],
  },
  {
    company: 'iPage',
    tier: 'shared_budget',
    patterns: [/\bipage\b/i],
  },
  {
    company: 'A2 Hosting',
    tier: 'shared_budget',
    patterns: [/a2hosting/i, /a2webhosting/i],
  },
  {
    company: 'Namecheap',
    tier: 'shared_budget',
    patterns: [/namecheap/i, /registrar-servers\.com/i, /web-hosting\.com/i],
  },

  // Cloud / PaaS
  {
    company: 'Vercel',
    tier: 'cloud_paas',
    patterns: [/vercel/i],
  },
  {
    company: 'Netlify',
    tier: 'cloud_paas',
    patterns: [/netlify/i],
  },
  {
    company: 'Railway',
    tier: 'cloud_paas',
    patterns: [/railway\.app/i, /\brailway\b/i],
  },
  {
    company: 'Render',
    tier: 'cloud_paas',
    patterns: [/render\.com/i, /\bonrender\b/i],
  },
  {
    company: 'Heroku',
    tier: 'cloud_paas',
    patterns: [/heroku/i],
  },

  // CDN (origin often hidden)
  {
    company: 'Cloudflare',
    tier: 'cdn',
    patterns: [/cloudflare/i, /\.cdn\.cloudflare\.net\b/i],
  },
  {
    company: 'Akamai',
    tier: 'cdn',
    patterns: [/akamai/i],
  },
  {
    company: 'Fastly',
    tier: 'cdn',
    patterns: [/fastly/i],
  },

  // VPS / cloud IaaS
  {
    company: 'AWS',
    tier: 'vps_cloud',
    patterns: [/amazon\.com/i, /amazonaws/i, /\baws\b/i, /amazon web services/i],
  },
  {
    company: 'Google Cloud',
    tier: 'vps_cloud',
    patterns: [/google (?:llc|cloud)/i, /googleusercontent\.com/i, /\bgcp\b/i],
  },
  {
    company: 'Microsoft Azure',
    tier: 'vps_cloud',
    patterns: [/microsoft/i, /\bazure\b/i],
  },
  {
    company: 'DigitalOcean',
    tier: 'vps_cloud',
    patterns: [/digitalocean/i, /digital ocean/i],
  },
  {
    company: 'Linode',
    tier: 'vps_cloud',
    patterns: [/linode/i, /akamai.*linode/i],
  },
  {
    company: 'Vultr',
    tier: 'vps_cloud',
    patterns: [/vultr/i],
  },
  {
    company: 'Hetzner',
    tier: 'vps_cloud',
    patterns: [/hetzner/i],
  },
  {
    company: 'OVH',
    tier: 'vps_cloud',
    patterns: [/\bovh\b/i],
  },
];

function ratingFor(company: string, tier: HostingTier): HostingRatingHint {
  switch (tier) {
    case 'managed_wordpress':
      return {
        hosting_grade: 'A',
        note: `${company} managed WordPress — appropriate hosting when the build is clean (hosting score 100 when setup looks solid).`,
        attribute_slow_speed_to_resources: false,
      };
    case 'cloud_paas':
      return {
        hosting_grade: 'A',
        note: `${company} cloud/PaaS hosting — generally strong for modern static or app sites.`,
        attribute_slow_speed_to_resources: false,
      };
    case 'vps_cloud':
      return {
        hosting_grade: 'B',
        note: `${company} cloud/VPS — capable infrastructure; speed depends on how the server is tuned.`,
        attribute_slow_speed_to_resources: false,
      };
    case 'shared_budget':
      return {
        hosting_grade: 'D',
        note: `${company} shared/budget hosting — often underpowered. If the front-end build is clean (low file sizes) but Lighthouse speed is still poor, treat it as a server resource issue.`,
        attribute_slow_speed_to_resources: true,
      };
    case 'cdn':
      return {
        hosting_grade: 'B',
        note: `${company} CDN/proxy in front of the origin — origin host may be hidden. Pair with header fingerprints (detect_tech_stack) when available.`,
        attribute_slow_speed_to_resources: false,
      };
    default:
      return {
        hosting_grade: 'C',
        note: 'Hosting company not confidently identified from IP / DNS signals.',
        attribute_slow_speed_to_resources: false,
      };
  }
}

/** Pure classifier — used by dns_check and unit verification. */
export function classifyHostingFromSignals(opts: {
  ptr?: string[];
  org?: string;
  isp?: string;
  asn?: string;
  nameservers?: string[];
  cnames?: string[];
}): Pick<HostingLookupResult, 'company' | 'tier' | 'confidence' | 'signals' | 'rating'> {
  const signals: string[] = [];
  const haystacks: { label: string; value: string }[] = [];

  for (const p of opts.ptr ?? []) {
    if (p) haystacks.push({ label: `PTR ${p}`, value: p });
  }
  if (opts.org) haystacks.push({ label: `org ${opts.org}`, value: opts.org });
  if (opts.isp) haystacks.push({ label: `isp ${opts.isp}`, value: opts.isp });
  if (opts.asn) haystacks.push({ label: `asn ${opts.asn}`, value: opts.asn });
  for (const ns of opts.nameservers ?? []) {
    if (ns) haystacks.push({ label: `NS ${ns}`, value: ns });
  }
  for (const cn of opts.cnames ?? []) {
    if (cn) haystacks.push({ label: `CNAME ${cn}`, value: cn });
  }

  // Prefer more specific brands over broad CDN/cloud. Rules are ordered with
  // managed WP and shared hosts before Cloudflare/AWS catch-alls.
  for (const rule of BRAND_RULES) {
    const hit = haystacks.find((h) => rule.patterns.some((re) => re.test(h.value)));
    if (!hit) continue;
    signals.push(hit.label);
    // Extra corroborating hits raise confidence
    for (const h of haystacks) {
      if (h === hit) continue;
      if (rule.patterns.some((re) => re.test(h.value))) signals.push(h.label);
    }
    const uniqueSignals = [...new Set(signals)].slice(0, 6);
    const fromNsOrHost = /^(NS|CNAME|PTR)\b/.test(hit.label);
    const confidence: HostingConfidence =
      uniqueSignals.length >= 2 || (fromNsOrHost && rule.tier !== 'cdn' && rule.tier !== 'vps_cloud')
        ? 'high'
        : rule.tier === 'cdn' || rule.tier === 'vps_cloud'
          ? 'medium'
          : 'medium';
    return {
      company: rule.company,
      tier: rule.tier,
      confidence,
      signals: uniqueSignals,
      rating: ratingFor(rule.company, rule.tier),
    };
  }

  // Fall back to raw org/isp label when no brand matched
  const orgLabel = (opts.org || opts.isp || '').trim();
  if (orgLabel) {
    return {
      company: orgLabel,
      tier: 'unknown',
      confidence: 'low',
      signals: [`org ${orgLabel}`],
      rating: ratingFor(orgLabel, 'unknown'),
    };
  }

  return {
    company: 'Unknown',
    tier: 'unknown',
    confidence: 'low',
    signals: [],
    rating: ratingFor('Unknown', 'unknown'),
  };
}

async function reversePtr(ip: string): Promise<string[]> {
  const r = new Resolver({ timeout: PTR_TIMEOUT_MS, tries: 1 });
  try {
    return await r.reverse(ip);
  } catch {
    return [];
  }
}

type IpWhoResponse = {
  success?: boolean;
  ip?: string;
  country?: string;
  connection?: { asn?: number; org?: string; isp?: string; domain?: string };
  message?: string;
};

async function lookupIpWho(ip: string): Promise<{
  org?: string;
  isp?: string;
  asn?: string;
  country?: string;
}> {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(IPWHO_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as IpWhoResponse;
    if (data.success === false) return {};
    const asnNum = data.connection?.asn;
    return {
      org: data.connection?.org?.trim() || undefined,
      isp: data.connection?.isp?.trim() || undefined,
      asn: asnNum != null ? `AS${asnNum} ${data.connection?.org ?? ''}`.trim() : undefined,
      country: data.country?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

async function enrichIp(ip: string): Promise<HostingIpDetail> {
  const [ptr, meta] = await Promise.all([reversePtr(ip), lookupIpWho(ip)]);
  return {
    ip,
    ptr,
    org: meta.org,
    isp: meta.isp,
    asn: meta.asn,
    country: meta.country,
  };
}

/**
 * Resolve hosting company for a domain from its A records + NS/CNAME hints.
 */
export async function lookupHosting(opts: {
  ips: string[];
  nameservers?: string[];
  cnames?: string[];
}): Promise<HostingLookupResult> {
  const ips = [...new Set(opts.ips.filter(Boolean))].slice(0, MAX_IPS);
  const details = ips.length
    ? await Promise.all(ips.map((ip) => enrichIp(ip)))
    : [];

  // Prefer the first IP that classifies as something more specific than CDN/unknown.
  let best = classifyHostingFromSignals({
    ptr: details.flatMap((d) => d.ptr),
    org: details[0]?.org,
    isp: details[0]?.isp,
    asn: details[0]?.asn,
    nameservers: opts.nameservers,
    cnames: opts.cnames,
  });

  // If the apex IP is only Cloudflare but NS/CNAME name a real host, re-classify
  // using NS/CNAME alone (common for proxied GoDaddy/Bluehost/WP Engine sites).
  if (best.tier === 'cdn' || best.tier === 'unknown') {
    const fromDns = classifyHostingFromSignals({
      nameservers: opts.nameservers,
      cnames: opts.cnames,
    });
    if (fromDns.tier !== 'unknown' && fromDns.tier !== 'cdn') {
      best = {
        ...fromDns,
        signals: [...fromDns.signals, ...best.signals.filter((s) => /cloudflare/i.test(s))].slice(
          0,
          6,
        ),
      };
    } else if (best.tier === 'cdn' && fromDns.company !== 'Unknown' && fromDns.company !== best.company) {
      // Keep CDN but mention DNS brand if different
      best = {
        ...best,
        signals: [...best.signals, ...fromDns.signals].slice(0, 6),
      };
    }
  }

  // When multiple IPs disagree, prefer managed WP / shared over generic cloud.
  for (const d of details.slice(1)) {
    const alt = classifyHostingFromSignals({
      ptr: d.ptr,
      org: d.org,
      isp: d.isp,
      asn: d.asn,
      nameservers: opts.nameservers,
      cnames: opts.cnames,
    });
    const rank = (t: HostingTier) =>
      ({ managed_wordpress: 5, shared_budget: 4, cloud_paas: 3, vps_cloud: 2, cdn: 1, unknown: 0 })[t];
    if (rank(alt.tier) > rank(best.tier)) best = alt;
  }

  return {
    ...best,
    ips: details,
  };
}

export function formatHostingLookup(result: HostingLookupResult): string {
  const lines = [
    `Hosting: ${result.company} (${result.tier.replace(/_/g, ' ')}, confidence ${result.confidence})`,
    `Hosting grade hint: ${result.rating.hosting_grade}`,
    result.rating.note,
  ];
  if (result.rating.attribute_slow_speed_to_resources) {
    lines.push(
      'Speed attribution: if Lighthouse is poor and page weight looks lean → likely server resource issue.',
    );
  }
  if (result.signals.length) {
    lines.push(`Signals: ${result.signals.join('; ')}`);
  }
  for (const d of result.ips.slice(0, 3)) {
    const bits = [d.ip];
    if (d.ptr.length) bits.push(`PTR ${d.ptr[0]}`);
    if (d.org) bits.push(d.org);
    if (d.asn) bits.push(d.asn);
    lines.push(`IP: ${bits.join(' · ')}`);
  }
  return lines.join('\n');
}
