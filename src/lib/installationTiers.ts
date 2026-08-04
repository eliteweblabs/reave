/**
 * Installation tier pricing + feature allocation for /pricing (and /features when embedded).
 * Feature labels and anchors stay aligned with accordion ids on the features page.
 */
export type TierFeatureRef = {
  label: string;
  /** Deep-link anchor on /features — e.g. #feature-contacts */
  href?: string;
};

export type InstallationTier = {
  tier: number;
  name: string;
  summary: string;
  month1: number;
  month2: number;
  month3: number;
  month4Plus: number;
  features: TierFeatureRef[];
};

/** 50% step-down months 1–3, flat from month 4. Tier 1 = fullest scope. */
export const INSTALLATION_TIERS: InstallationTier[] = [
  {
    tier: 4,
    name: 'Core OS',
    summary:
      'Standalone admin and client portal — contacts, projects, inbox, AI, and mobile without the public marketing site.',
    month1: 2000,
    month2: 1000,
    month3: 500,
    month4Plus: 250,
    features: [
      { label: 'Contacts & CRM', href: '#feature-contacts' },
      { label: 'Client portal', href: '#feature-portal' },
      { label: 'Projects & checklists', href: '#feature-projects' },
      { label: 'Smart inbox & email triage', href: '#feature-email' },
      { label: 'AI admin agent', href: '#feature-ai-assistant' },
      { label: 'Knowledge base', href: '#feature-learning' },
      { label: 'White-label branding', href: '#feature-white-label' },
      { label: 'Mobile PWA & push alerts', href: '#feature-mobile' },
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
    month4Plus: 375,
    features: [
      { label: 'Everything in Tier 4' },
      { label: 'Billing & invoicing', href: '#feature-billing' },
      { label: 'Scheduling & booking', href: '#feature-scheduling' },
      { label: 'Two-way SMS', href: '#feature-sms' },
      { label: 'Siri shortcuts', href: '#feature-siri' },
      { label: 'CardDAV contact sync', href: '#plugin-carddav' },
      { label: 'Project time tracking', href: '#plugin-time-tracking' },
    ],
  },
  {
    tier: 2,
    name: 'Growth',
    summary:
      'Everything in Operations, plus a branded public site, voice, documents, marketing automation, and site monitoring.',
    month1: 4000,
    month2: 2000,
    month3: 1000,
    month4Plus: 500,
    features: [
      { label: 'Everything in Tier 3' },
      { label: 'Branded public website', href: '#feature-white-label' },
      { label: 'Voice & call routing', href: '#plugin-voice' },
      { label: 'Document signing', href: '#plugin-documents' },
      { label: 'Newsletters, social & analytics', href: '#feature-growth' },
      { label: 'Read receipts & engagement', href: '#feature-growth' },
      { label: 'Site audits, uptime & change monitoring', href: '#plugin-monitoring' },
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
    month4Plus: 625,
    features: [
      { label: 'Everything in Tier 2' },
      { label: 'Dealership inventory wizard', href: '#plugin-dealership' },
      { label: 'Fleet GPS tracking', href: '#plugin-fleet' },
      { label: 'Dev & deploy infrastructure', href: '#plugin-dev-infra' },
      { label: 'DNS record management', href: '#plugin-namecom-dns' },
      { label: 'Any remaining optional plugins', href: '#feature-ninety' },
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
