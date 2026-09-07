/**
 * BuiltWith-style stack summary for Sites fleet tiles — Wappalyzer hits plus
 * fleet wiring (hosting, analytics, Reave Connect on WordPress).
 */
import type { AnalyticsAccountRow, UptimeMonitorForFleetMerge } from './analyticsSiteMerge';
import type { SiteHealthSummary } from './siteHealthScore';

export type SiteTechStackItem = {
  name: string;
  category: string;
  /** Simple Icons slug when available — UI renders as a masked logo. */
  iconSlug: string | null;
  /** Optional status chip (Connect installed / missing). */
  status?: 'ok' | 'warn' | 'missing' | null;
  detail?: string;
};

export type SiteTechStackSummary = {
  items: SiteTechStackItem[];
  checkedAt: number;
};

const TECH_ICON_SLUGS: Record<string, string> = {
  WordPress: 'wordpress',
  WooCommerce: 'woocommerce',
  Shopify: 'shopify',
  Squarespace: 'squarespace',
  Wix: 'wix',
  Webflow: 'webflow',
  Drupal: 'drupal',
  Joomla: 'joomla',
  Ghost: 'ghost',
  React: 'react',
  'Next.js': 'nextdotjs',
  Astro: 'astro',
  Vue: 'vuedotjs',
  Angular: 'angular',
  Svelte: 'svelte',
  jQuery: 'jquery',
  'Google Analytics': 'googleanalytics',
  'Google Tag Manager': 'googletagmanager',
  Plausible: 'plausibleanalytics',
  Hotjar: 'hotjar',
  Cloudflare: 'cloudflare',
  Fastly: 'fastly',
  Nginx: 'nginx',
  Apache: 'apache',
  PHP: 'php',
  Node: 'nodedotjs',
  Stripe: 'stripe',
  PayPal: 'paypal',
  HubSpot: 'hubspot',
  Mailchimp: 'mailchimp',
  Kinsta: 'kinsta',
  Railway: 'railway',
  Vercel: 'vercel',
  Netlify: 'netlify',
  Cloudinary: 'cloudinary',
  Elementor: 'elementor',
  Yoast: 'yoast',
};

const CATEGORY_ORDER = [
  'CMS',
  'Plugins',
  'E-commerce',
  'JavaScript Framework',
  'JavaScript Library',
  'CSS Framework',
  'Analytics',
  'Tag Manager',
  'Advertising',
  'CDN',
  'Hosting',
  'Payment',
  'Monitoring',
  'Other',
];

function iconSlugForTech(name: string): string | null {
  if (TECH_ICON_SLUGS[name]) return TECH_ICON_SLUGS[name]!;
  const lower = name.toLowerCase();
  for (const [key, slug] of Object.entries(TECH_ICON_SLUGS)) {
    if (key.toLowerCase() === lower) return slug;
  }
  return null;
}

function dedupeItems(items: SiteTechStackItem[]): SiteTechStackItem[] {
  const seen = new Set<string>();
  const out: SiteTechStackItem[] = [];
  for (const item of items) {
    const key = `${item.category}::${item.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function siteLikelyWordPress(input: {
  technologies?: Array<{ name: string; category?: string }> | null;
  health?: SiteHealthSummary | null;
  wpConnectAvailable?: boolean | null;
}): boolean {
  const techNames = (input.technologies ?? []).map((t) => t.name.toLowerCase());
  if (techNames.includes('wordpress')) return true;
  const sitemapDetail = input.health?.readiness?.items?.find((i) => i.id === 'xml_sitemap')?.detail ?? '';
  if (/wp-sitemap/i.test(sitemapDetail)) return true;
  if (input.wpConnectAvailable === true) return true;
  return false;
}

export function buildSiteTechStackSummary(input: {
  technologies?: Array<{ name: string; category: string }> | null;
  analytics?: AnalyticsAccountRow | null;
  monitor?: UptimeMonitorForFleetMerge | null;
  wpConnectAvailable?: boolean | null;
  health?: SiteHealthSummary | null;
  checkedAt?: number;
}): SiteTechStackSummary | null {
  const checkedAt = input.checkedAt ?? Date.now();
  const items: SiteTechStackItem[] = [];

  for (const tech of input.technologies ?? []) {
    items.push({
      name: tech.name,
      category: tech.category || 'Other',
      iconSlug: iconSlugForTech(tech.name),
    });
  }

  const analytics = input.analytics;
  if (analytics?.registered) {
    items.push({
      name: 'Plausible',
      category: 'Analytics',
      iconSlug: 'plausibleanalytics',
      status: 'ok',
      detail: 'Wired on dashboard',
    });
  } else if (analytics && analytics.registered === false) {
    items.push({
      name: 'Plausible',
      category: 'Analytics',
      iconSlug: 'plausibleanalytics',
      status: 'missing',
      detail: 'Not wired',
    });
  }

  if (analytics?.kind === 'kinsta') {
    items.push({
      name: 'Kinsta',
      category: 'Hosting',
      iconSlug: 'kinsta',
      status: 'ok',
    });
  } else if (analytics?.kind === 'railway') {
    items.push({
      name: 'Railway',
      category: 'Hosting',
      iconSlug: 'railway',
      status: 'ok',
    });
  }

  if (input.monitor) {
    items.push({
      name: 'UptimeRobot',
      category: 'Monitoring',
      iconSlug: 'uptimerobot',
      status: 'ok',
    });
  }

  const isWordPress = siteLikelyWordPress({
    technologies: input.technologies,
    health: input.health,
    wpConnectAvailable: input.wpConnectAvailable,
  });

  if (isWordPress) {
    const connect = input.wpConnectAvailable;
    items.push({
      name: 'Reave Connect',
      category: 'Plugins',
      iconSlug: 'wordpress',
      status: connect === true ? 'ok' : connect === false ? 'missing' : null,
      detail:
        connect === true
          ? 'Installed'
          : connect === false
            ? 'Not installed — add plugin'
            : 'Not checked yet',
    });
  }

  const deduped = dedupeItems(items);
  if (!deduped.length) return null;

  deduped.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    const ar = ai === -1 ? CATEGORY_ORDER.length : ai;
    const br = bi === -1 ? CATEGORY_ORDER.length : bi;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });

  return { items: deduped, checkedAt };
}

export function mergeSiteTechStackSummary(
  previous: SiteTechStackSummary | null | undefined,
  next: SiteTechStackSummary | null | undefined,
  opts: { probed?: boolean } = {},
): SiteTechStackSummary | null {
  if (!next?.items?.length) return previous?.items?.length ? previous : null;
  if (!previous?.items?.length) return next;
  if (opts.probed) return next;

  const wiringCategories = new Set(['Plugins', 'Hosting', 'Analytics', 'Monitoring']);
  const archivedTech = previous.items.filter((item) => !wiringCategories.has(item.category));
  const wiring = next.items.filter((item) => wiringCategories.has(item.category));
  const items = dedupeItems([...archivedTech, ...wiring]);
  return items.length
    ? { items, checkedAt: Math.max(previous.checkedAt, next.checkedAt) }
    : previous;
}
