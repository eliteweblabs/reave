/**
 * Managed hosting care plans + stack feature lists for /hosting.
 * Annual “we handle everything” pricing — WordPress and web-app stacks included.
 */

export type HostingPlanFeature = {
  label: string;
  /** Highlight as an Unlimited-only perk */
  unlimitedOnly?: boolean;
};

export type HostingCarePlan = {
  id: 'care' | 'care-unlimited';
  name: string;
  tagline: string;
  summary: string;
  annualUsd: number;
  monthlyEquivalentUsd: number;
  highlighted?: boolean;
  ctaLabel: string;
  features: HostingPlanFeature[];
};

export type HostingFeatureGroup = {
  id: string;
  title: string;
  lead: string;
  features: string[];
};

/** Hosting plans — billed annually. Names match /pricing (Core OS, Growth). */
export const HOSTING_CARE_PLANS: HostingCarePlan[] = [
  {
    id: 'care',
    name: 'Core OS',
    tagline: 'We handle everything',
    summary:
      'Fully managed hosting for one WordPress site or web app — security, updates, scans, SEO reports, and light content edits so you can stay focused on the business.',
    annualUsd: 600,
    monthlyEquivalentUsd: 50,
    ctaLabel: 'Start Core OS',
    features: [
      { label: 'Managed WordPress or web-app hosting' },
      { label: 'Daily site health scans' },
      { label: 'Malware scanning & cleanup' },
      { label: 'Weekly SEO performance reports' },
      { label: 'Core updates, plugins & dependencies managed for you' },
      { label: 'Uptime monitoring with alert response' },
      { label: 'SSL, DNS & domain assistance' },
      { label: 'Daily backups with restore on request' },
      { label: 'Up to 2 content edits per month' },
      { label: 'Priority email / chat support' },
    ],
  },
  {
    id: 'care-unlimited',
    name: 'Growth',
    tagline: 'Everything in Core OS, plus unlimited edits',
    summary:
      'Same hands-on care — plus unlimited content and design edits whenever you need a change. Your always-on web team for the year.',
    annualUsd: 900,
    monthlyEquivalentUsd: 75,
    highlighted: true,
    ctaLabel: 'Start Growth',
    features: [
      { label: 'Everything in Core OS' },
      { label: 'Unlimited content & design edits', unlimitedOnly: true },
      { label: 'Same-week turnaround on routine changes', unlimitedOnly: true },
      { label: 'Landing pages, copy refreshes & image swaps', unlimitedOnly: true },
      { label: 'Quarterly growth / conversion check-in', unlimitedOnly: true },
      { label: 'Staging previews before anything goes live', unlimitedOnly: true },
    ],
  },
];

/** Premium managed WordPress stack (feature set inspired by top managed WP hosts). */
export const WORDPRESS_HOSTING_FEATURES: HostingFeatureGroup = {
  id: 'wordpress',
  title: 'WordPress hosting',
  lead: 'Premium managed WordPress on isolated cloud containers — fast, secure, and hands-off.',
  features: [
    'Isolated container hosting on Google Cloud',
    'Global CDN with edge caching (260+ locations)',
    'Free SSL certificates with wildcard support',
    'Managed web application firewall & DDoS protection',
    'Daily automatic backups with point-in-time restore',
    'One-click staging environments',
    'Expert-assisted site migrations at no extra cost',
    'Automatic plugin & theme updates with visual checks',
    'Server-level page caching & PHP version management',
    'Application performance monitoring',
    'Malware removal included for as long as you host with us',
    'CDN bandwidth & SSD storage sized to your traffic',
  ],
};

/** Modern web-app / full-stack hosting (feature set inspired by modern PaaS platforms). */
export const WEB_APP_HOSTING_FEATURES: HostingFeatureGroup = {
  id: 'web-app',
  title: 'Web app hosting',
  lead: 'Ship Node, Python, Go, Docker, and full-stack apps with git-push deploys and managed data stores.',
  features: [
    'Deploy from Git with automatic builds on every push',
    'Dockerfile or automatic buildpack detection',
    'Managed Postgres, Redis, MySQL & MongoDB',
    'Private networking between services',
    'Custom domains with automatic TLS',
    'Zero-downtime deploys with one-click rollback',
    'Preview environments for staging & review',
    'Horizontal scaling with load-balanced replicas',
    'Cron jobs, workers & background services',
    'Live logs, CPU / memory / network metrics',
    'Encrypted secrets & environment variables',
    'Persistent volumes for stateful workloads',
  ],
};

/** Ongoing care services layered on top of either stack. */
export const CARE_SERVICES_FEATURES: HostingFeatureGroup = {
  id: 'care-services',
  title: 'Always-on care',
  lead: 'Hosting alone isn’t enough — we watch the site, keep it healthy, and report what matters.',
  features: [
    'Daily site scans (uptime, SSL, broken pages, critical errors)',
    'Malware & vulnerability scanning with remediation',
    'Weekly SEO reports (rankings, Core Web Vitals, crawl issues)',
    'Security patches applied on a managed schedule',
    'Spam, form-abuse & blacklist monitoring',
    'Monthly summary of health, traffic & action items',
    'Offsite backup verification',
    'Incident response — we jump on outages and hacks',
    'Accessibility & broken-link spot checks',
    'Ask-us-anything support for your site stack',
  ],
};

export function formatHostingUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
