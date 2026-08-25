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
      { label: 'Client Portal', href: '/features#feature-portal' },
      { label: 'Projects & Checklists', href: '/features#feature-projects' },
      { label: 'Smart Inbox & Email Triage', href: '/features#feature-email' },
      { label: 'AI Admin Agent', href: '/features#feature-ai-assistant' },
      { label: 'Chat / Commands', href: '/features#feature-ai-assistant' },
      { label: 'Knowledge Base', href: '/features#feature-learning' },
      { label: 'Media Library', href: '/features#feature-media' },
      { label: 'White-Label Branding', href: '/features#feature-white-label' },
      { label: 'Mobile PWA & Push Alerts', href: '/features#feature-mobile' },
      { label: 'Passkeys & Face ID' },
      { label: 'Phone Sign-In' },
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
      { label: 'Billing & Invoicing', href: '/features#feature-billing' },
      { label: 'Scheduling & Booking', href: '/features#feature-scheduling' },
      { label: 'Two-Way SMS', href: '/features#feature-sms' },
      { label: 'Siri Shortcuts', href: '/features#feature-siri' },
      { label: 'CardDAV Contact Sync', href: '/modules#plugin-carddav' },
      { label: 'Project Time Tracking', href: '/modules#plugin-time-tracking' },
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
      { label: 'Branded Public Website', href: '/features#feature-white-label' },
      { label: 'Agentic Website Editor', href: '/features#feature-site-editing' },
      { label: 'Voice & Call Routing', href: '/modules#plugin-voice' },
      { label: 'Dynamic Documents', href: '/modules#plugin-documents' },
      { label: 'Digital Signature', href: '/modules#plugin-documents' },
      { label: 'Newsletters, Social & Analytics', href: '/features#feature-growth' },
      { label: 'Read Receipts & Engagement', href: '/features#feature-growth' },
      { label: 'Website Audits, Uptime & Change Monitoring', href: '/modules#plugin-monitoring' },
    ],
  },
  {
    tier: 1,
    name: 'Full platform',
    summary:
      'Everything in Growth, plus industry plugins and agency tooling — dealership, fleet, and DNS.',
    month1: 5000,
    month2: 2500,
    month3: 1250,
    month4: 625,
    month5Plus: 312.5,
    features: [
      { label: 'Everything in Growth' },
      { label: 'Dealership Inventory Wizard', href: '/modules#plugin-dealership' },
      { label: 'Fleet GPS Tracking', href: '/modules#plugin-fleet' },
      { label: 'WordPress™ Connect', href: '/modules#plugin-wordpress-content' },
      { label: 'DNS Record Management', href: '/modules#plugin-namecom-dns' },
      { label: 'Any Remaining Optional Plugins', href: '/modules' },
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
