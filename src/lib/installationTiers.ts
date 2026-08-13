/**
 * Installation tier pricing + feature allocation for /pricing (and /features when embedded).
 * Feature labels and anchors deep-link to /features or /modules.
 */
export type TierFeatureRef = {
  label: string;
  /** Deep-link — e.g. /features#feature-contacts or /modules#plugin-fleet */
  href?: string;
};

export type InstallationTier = {
  tier: number;
  name: string;
  summary: string;
  month1: number;
  month2: number;
  month3: number;
  month4: number;
  month5Plus: number;
  features: TierFeatureRef[];
};

/** 50% step-down months 1–4, flat from month 5. Tier 1 = fullest scope. */
export const INSTALLATION_TIERS: InstallationTier[] = [
  {
    tier: 4,
    name: 'Core OS',
    summary:
      'Standalone admin and client portal — contacts, projects, inbox, AI, and mobile without the public marketing site.',
    month1: 2000,
    month2: 1000,
    month3: 500,
    month4: 250,
    month5Plus: 125,
    features: [
      { label: 'Contacts & CRM', href: '/features#feature-contacts' },
      { label: 'Client portal', href: '/features#feature-portal' },
      { label: 'Projects & checklists', href: '/features#feature-projects' },
      { label: 'Smart inbox & email triage', href: '/features#feature-email' },
      { label: 'AI admin agent', href: '/features#feature-ai-assistant' },
      { label: 'Knowledge base', href: '/features#feature-learning' },
      { label: 'Media library', href: '/features#feature-media' },
      { label: 'White-label branding', href: '/features#feature-white-label' },
      { label: 'Mobile PWA & push alerts', href: '/features#feature-mobile' },
      { label: 'Passkeys & Face ID' },
      { label: 'Phone sign-in' },
    ],
  },
  {
    tier: 3,
    name: 'Operations',
    summary:
      'Everything in Core OS, plus billing, scheduling, SMS, Siri, CardDAV, and time tracking for day-to-day client work.',
    month1: 3000,
    month2: 1500,
    month3: 750,
    month4: 375,
    month5Plus: 187.5,
    features: [
      { label: 'Everything in Core OS' },
      { label: 'Billing & invoicing', href: '/features#feature-billing' },
      { label: 'Scheduling & booking', href: '/features#feature-scheduling' },
      { label: 'Two-way SMS', href: '/features#feature-sms' },
      { label: 'Siri shortcuts', href: '/features#feature-siri' },
      { label: 'CardDAV contact sync', href: '/modules#plugin-carddav' },
      { label: 'Project time tracking', href: '/modules#plugin-time-tracking' },
    ],
  },
  {
    tier: 2,
    name: 'Growth',
    summary:
      'Everything in Operations, plus a branded public website, voice, documents, marketing automation, and website monitoring.',
    month1: 4000,
    month2: 2000,
    month3: 1000,
    month4: 500,
    month5Plus: 250,
    features: [
      { label: 'Everything in Operations' },
      { label: 'Branded public website', href: '/features#feature-white-label' },
      { label: 'CMS-less website editing via agent', href: '/features#feature-site-editing' },
      { label: 'Voice & call routing', href: '/modules#plugin-voice' },
      { label: 'Document signing', href: '/modules#plugin-documents' },
      { label: 'Newsletters, social & analytics', href: '/features#feature-growth' },
      { label: 'Read receipts & engagement', href: '/features#feature-growth' },
      { label: 'Website audits, uptime & change monitoring', href: '/modules#plugin-monitoring' },
    ],
  },
  {
    tier: 1,
    name: 'Full platform',
    summary:
      'Everything in Growth, plus industry plugins and agency tooling — dealership, fleet, deploy infra, and DNS.',
    month1: 5000,
    month2: 2500,
    month3: 1250,
    month4: 625,
    month5Plus: 312.5,
    features: [
      { label: 'Everything in Growth' },
      { label: 'Dealership inventory wizard', href: '/modules#plugin-dealership' },
      { label: 'Fleet GPS tracking', href: '/modules#plugin-fleet' },
      { label: 'WordPress content plugin', href: '/modules#plugin-wordpress-content' },
      { label: 'Dev & deploy infrastructure', href: '/modules#plugin-dev-infra' },
      { label: 'DNS record management', href: '/modules#plugin-namecom-dns' },
      { label: 'Any remaining optional plugins', href: '/modules' },
    ],
  },
];

export function formatInstallUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
