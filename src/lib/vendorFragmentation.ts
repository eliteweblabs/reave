/**
 * Detect fragmented ordering / multi-vendor CTAs on restaurant (and similar)
 * sites — the sales pitch that sells: one homepage stitched to DoorDash,
 * Uber Eats, Grubhub, Shopify, SpotHopper apps, third-party pickup, etc.
 */

export type VendorKind =
  | 'delivery_marketplace'
  | 'pickup_ordering'
  | 'shopify'
  | 'job_board'
  | 'agency_platform'
  | 'other_checkout';

export type VendorHit = {
  kind: VendorKind;
  vendor: string;
  host: string;
  linkText: string;
  href: string;
};

export type VendorFragmentationReport = {
  vendors: VendorHit[];
  /** Distinct vendor hosts (excluding the audited site). */
  distinctHosts: string[];
  deliveryMarketplaces: string[];
  hasPickupVendor: boolean;
  hasShopify: boolean;
  fragmentedOrdering: boolean;
  score: 'pass' | 'warn' | 'fail';
  summary: string;
  bullets: string[];
};

const VENDOR_RULES: Array<{
  kind: VendorKind;
  vendor: string;
  host: RegExp;
}> = [
  { kind: 'delivery_marketplace', vendor: 'DoorDash', host: /(?:^|\.)(?:doordash\.com|order\.online)$/i },
  { kind: 'delivery_marketplace', vendor: 'Uber Eats', host: /(?:^|\.)(?:ubereats\.com|uber\.com)$/i },
  { kind: 'delivery_marketplace', vendor: 'Grubhub', host: /(?:^|\.)(?:grubhub\.com|seamless\.com)$/i },
  { kind: 'delivery_marketplace', vendor: 'Postmates', host: /(?:^|\.)postmates\.com$/i },
  { kind: 'delivery_marketplace', vendor: 'Toast', host: /(?:^|\.)toasttab\.com$/i },
  { kind: 'pickup_ordering', vendor: 'RestaurantSignIn', host: /(?:^|\.)restaurantsignin\.com$/i },
  { kind: 'pickup_ordering', vendor: 'ChowNow', host: /(?:^|\.)chownow\.com$/i },
  { kind: 'pickup_ordering', vendor: 'Olo', host: /(?:^|\.)olo\.com$/i },
  { kind: 'shopify', vendor: 'Shopify', host: /(?:^|\.)myshopify\.com$/i },
  { kind: 'job_board', vendor: 'SpotHopper careers', host: /(?:^|\.)(?:tmt\.spotapps\.co|spotapps\.co)$/i },
  { kind: 'agency_platform', vendor: 'SpotHopper', host: /(?:^|\.)spotapps\.co$/i },
];

const ORDERISH = /\b(?:order|delivery|pickup|pick[\s-]?up|takeout|take[\s-]?out|online\s+order)\b/i;

export function classifyVendorHref(
  href: string,
  linkText: string,
  pageHost = '',
): VendorHit | null {
  let url: URL;
  try {
    url = new URL(href, pageHost ? `https://${pageHost}` : 'https://example.invalid/');
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const page = pageHost.replace(/^www\./i, '').toLowerCase();
  if (page && (host === page || host.endsWith(`.${page}`))) return null;

  for (const rule of VENDOR_RULES) {
    if (!rule.host.test(host)) continue;
    // spotapps.co static assets / same-site builder — only flag when link text looks like careers/jobs
    if (rule.kind === 'agency_platform' || rule.kind === 'job_board') {
      if (!/career|job|apply|hiring|work with/i.test(linkText) && !/tmt\.spotapps/i.test(host)) {
        continue;
      }
    }
    return {
      kind: rule.kind === 'agency_platform' && /tmt\.spotapps/i.test(host) ? 'job_board' : rule.kind,
      vendor: rule.vendor,
      host,
      linkText: linkText.trim().slice(0, 80),
      href: url.toString(),
    };
  }

  // Generic off-site order/checkout when the label screams "order"
  if (ORDERISH.test(linkText) && host && page && host !== page) {
    return {
      kind: 'other_checkout',
      vendor: host,
      host,
      linkText: linkText.trim().slice(0, 80),
      href: url.toString(),
    };
  }
  return null;
}

export function analyzeVendorFragmentation(
  links: Array<{ text: string; href: string }>,
  pageUrlOrHost = '',
): VendorFragmentationReport {
  let pageHost = '';
  try {
    pageHost = new URL(
      /^https?:\/\//i.test(pageUrlOrHost) ? pageUrlOrHost : `https://${pageUrlOrHost || 'example.invalid'}`,
    ).hostname;
  } catch {
    pageHost = '';
  }

  const vendors: VendorHit[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const hit = classifyVendorHref(link.href, link.text, pageHost);
    if (!hit) continue;
    const key = `${hit.kind}:${hit.host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    vendors.push(hit);
  }

  const deliveryMarketplaces = [
    ...new Set(vendors.filter((v) => v.kind === 'delivery_marketplace').map((v) => v.vendor)),
  ];
  const hasPickupVendor = vendors.some((v) => v.kind === 'pickup_ordering');
  const hasShopify = vendors.some((v) => v.kind === 'shopify');
  const distinctHosts = [...new Set(vendors.map((v) => v.host))];
  const orderVendors = vendors.filter((v) =>
    ['delivery_marketplace', 'pickup_ordering', 'other_checkout'].includes(v.kind),
  );
  const fragmentedOrdering =
    orderVendors.length >= 2 || (deliveryMarketplaces.length >= 2 && hasPickupVendor);

  let score: VendorFragmentationReport['score'] = 'pass';
  if (fragmentedOrdering || orderVendors.length >= 3) score = 'fail';
  else if (orderVendors.length >= 2 || (deliveryMarketplaces.length >= 1 && hasShopify)) score = 'warn';

  const bullets: string[] = [];
  if (deliveryMarketplaces.length) {
    bullets.push(
      `Delivery marketplaces linked from the site: ${deliveryMarketplaces.join(', ')}.`,
    );
  }
  if (hasPickupVendor) {
    const pickup = vendors.filter((v) => v.kind === 'pickup_ordering');
    bullets.push(
      `Pickup / owned ordering routes to ${pickup.map((v) => v.vendor).join(', ')} — separate from marketplace links.`,
    );
  }
  if (hasShopify) {
    bullets.push('Merch / shop links out to a separate Shopify store (different cart and login).');
  }
  const careers = vendors.filter((v) => v.kind === 'job_board');
  if (careers.length) {
    bullets.push(`Careers links out to a third-party board (${careers.map((v) => v.host).join(', ')}).`);
  }
  if (fragmentedOrdering) {
    bullets.push(
      `Fragmented ordering flow: customers must guess which "Order" path is pickup vs delivery across ${orderVendors.length} vendors.`,
    );
    bullets.push(
      'Recommendation: consolidate onto a single commission-free owned ordering platform so cart, login, and customer data stay in one system.',
    );
  }

  const summary =
    score === 'fail'
      ? `Fragmented ordering — ${orderVendors.length} separate order vendors stitched onto the homepage.`
      : score === 'warn'
        ? `Multiple off-site vendors handle shop / order flows (${distinctHosts.length} hosts).`
        : orderVendors.length
          ? `Ordering links out to ${orderVendors.map((v) => v.vendor).join(', ')}.`
          : 'No multi-vendor ordering fragmentation detected in nav / CTAs.';

  return {
    vendors,
    distinctHosts,
    deliveryMarketplaces,
    hasPickupVendor,
    hasShopify,
    fragmentedOrdering,
    score,
    summary,
    bullets,
  };
}

/** Markdown block for audit ### Lead Capture / ### UX sections. */
export function formatVendorFragmentationMarkdown(report: VendorFragmentationReport): string {
  if (!report.vendors.length) return '';
  const lines = [
    '### Ordering & Vendor Fragmentation',
    `- Verdict: **${report.score === 'fail' ? 'Fail' : report.score === 'warn' ? 'Warn' : 'Pass'}** — ${report.summary}`,
    ...report.bullets.map((b) => `- ${b}`),
    ...report.vendors.map(
      (v) => `- ${v.vendor} (${v.kind.replace(/_/g, ' ')}): "${v.linkText || 'link'}" → ${v.href}`,
    ),
  ];
  return lines.join('\n');
}
