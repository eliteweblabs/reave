/**
 * Deployment wizard catalog — Railway sibling services and variable references.
 *
 * Service names are the contract. Keep them stable so every new install can
 * reuse the same `${{ service.VAR }}` / `${{ shared.KEY }}` templates.
 *
 * @see https://docs.railway.com/guides/variables#reference-variables
 */
import { normalizeBrandColorHex } from './companyBrandColors';
import {
  FEATURE_BLURBS,
  FEATURE_LABELS,
  expandFeatureRequirements,
  isPublicFeature,
  type FeatureId,
} from './featureCatalog';
import {
  defaultFixturePlaybook,
  isLawIndustrySlug,
  normalizeIndustryPlaybook,
  type DeckIndustryPlaybook,
} from './industryPlaybook';
import { isPracticeArea } from './practiceGate';
import { normalizePostAlias } from './postAlias';
import { defaultWebsiteRepoSlug } from './websiteEditorRepo';

/** Consumer Astro service — matches Reave App / Reave Demo (`reave`). */
export const DEPLOY_APP_SERVICE = 'reave';
export const DEPLOY_APP_POSTGRES = 'reave-postgres';

export type DeployServiceKind = 'app' | 'api' | 'postgres';
export type DeployVarKind = 'reference' | 'shared' | 'secret' | 'generated' | 'literal';

export type DeployWizardExtraId = 'changedetection_railway' | 'plausible_railway';

export type DeployWizardService = {
  id: string;
  label: string;
  kind: DeployServiceKind;
  description: string;
  repo?: string;
  image?: string;
  volumeMount?: string;
  /** Empty / omitted = core (always provisioned). */
  features?: readonly FeatureId[];
  extra?: DeployWizardExtraId;
};

export type DeployWizardVariable = {
  name: string;
  /** Railway service that receives the var, or `shared` for project-shared keys. */
  service: string;
  kind: DeployVarKind;
  /** Template or default. Reference values must start with `${{` or embed one. */
  value?: string;
  sharedKey?: string;
  description: string;
  required?: boolean;
  features?: readonly FeatureId[];
  extra?: DeployWizardExtraId;
};

export type DeployWizardExtra = {
  id: DeployWizardExtraId;
  label: string;
  blurb: string;
  /** Show this extra when any of these modules are selected (always if omitted). */
  whenFeatures?: readonly FeatureId[];
};

export type DeployDnsType = 'CNAME' | 'MX' | 'TXT';

export type DeployWizardDomain = {
  id: string;
  /** Host label on the install apex (`@` = apex, `www`, `ap`, `cal`, …). */
  host: string;
  type: DeployDnsType;
  /** Railway service to attach, or `resend` / `clerk`. */
  target: string;
  description: string;
  features?: readonly FeatureId[];
  extra?: DeployWizardExtraId;
};

export type DeployWizardPlanDomain = DeployWizardDomain & {
  fqdn: string;
  attach: string;
};

export type DeployWizardDnsKind = 'railway' | 'resend' | 'clerk' | 'skip';

/** book. is optional — Railway's public domain is enough for the booking API. */
export function deployWizardDnsKind(domain: Pick<DeployWizardDomain, 'id' | 'host' | 'target' | 'type'>): DeployWizardDnsKind {
  if (domain.id === 'book' || domain.host === 'book') return 'skip';
  if (domain.target === 'clerk') return 'clerk';
  if (domain.target === 'resend' || domain.type === 'MX') return 'resend';
  return 'railway';
}

export function railwayRef(service: string, variable: string): string {
  return `\${{ ${service}.${variable} }}`;
}

/** Same-service Railway ref — `${{EMAIL_FROM_NAME}}`. */
export function railwayLocalRef(variable: string): string {
  return `\${{${variable}}}`;
}

export function railwaySharedRef(key: string): string {
  return `\${{ shared.${key} }}`;
}

export function railwayPublicUrl(service: string): string {
  return `https://\${{ ${service}.RAILWAY_PUBLIC_DOMAIN }}`;
}

/** Cal.com ALLOWED_HOSTNAMES JSON array — hostname only, no protocol. */
export function railwayAllowedHostnames(service: string): string {
  return `["\${{ ${service}.RAILWAY_PUBLIC_DOMAIN }}"]`;
}

export function railwayPrivateUrl(service: string, port?: number): string {
  const host = `\${{ ${service}.RAILWAY_PRIVATE_DOMAIN }}`;
  return port ? `http://${host}:${port}` : `http://${host}`;
}

export const DEPLOY_WIZARD_EXTRAS: readonly DeployWizardExtra[] = [
  {
    id: 'changedetection_railway',
    label: 'ChangeDetection on Railway',
    blurb: 'Self-host ChangeDetection.io as `changedetection` instead of pasting a SaaS URL.',
    whenFeatures: ['site_monitoring'],
  },
  {
    id: 'plausible_railway',
    label: 'Plausible on Railway',
    blurb: 'Self-host Plausible as `plausible` and reference its public domain.',
    whenFeatures: ['analytic_audit'],
  },
];

/**
 * Canonical public hosts. Prefixes stay the same on every install
 * (`ap.reave.app`, `cal.client.com`, `inbound.tonybarlettajr.com`).
 */
export const DEPLOY_WIZARD_DOMAINS: readonly DeployWizardDomain[] = [
  {
    id: 'apex',
    host: '@',
    type: 'CNAME',
    target: DEPLOY_APP_SERVICE,
    description: 'Public site, admin, portal, CardDAV (`/carddav`), and APIs.',
  },
  {
    id: 'www',
    host: 'www',
    type: 'CNAME',
    target: DEPLOY_APP_SERVICE,
    description: 'Alias — the app redirects www → apex when PUBLIC_SITE_DOMAIN is set.',
  },
  {
    id: 'inbound',
    host: 'inbound',
    type: 'MX',
    target: 'resend',
    description: 'Resend receiving. Mailbox is inbox@inbound.{apex}. Apply creates the Resend domain and writes MX on Cloudflare.',
  },
  {
    id: 'clerk',
    host: 'clerk',
    type: 'CNAME',
    target: 'clerk',
    description: 'Clerk Frontend API on your domain. Copy the CNAME from Clerk → Domains.',
  },
  {
    id: 'accounts',
    host: 'accounts',
    type: 'CNAME',
    target: 'clerk',
    description: 'Clerk hosted accounts portal (pairs with clerk.{apex}).',
  },
  {
    id: 'ap',
    host: 'ap',
    type: 'CNAME',
    target: 'crater',
    description: 'Crater invoices — production uses ap.reave.app.',
    features: ['billing'],
  },
  {
    id: 'meet',
    host: 'meet',
    type: 'CNAME',
    target: 'galene',
    description: 'Galene video meetings — production uses meet.reave.app.',
    features: ['video_meet'],
  },
  {
    id: 'cal',
    host: 'cal',
    type: 'CNAME',
    target: 'calcom-web-app',
    description: 'Cal.com admin UI — production uses cal.reave.app.',
    features: ['scheduling'],
  },
  {
    id: 'book',
    host: 'book',
    type: 'CNAME',
    target: 'calcom-booking-api',
    description: 'Optional branded booking API. Skip — PUBLIC_BOOKING_API_URL uses the Railway public domain.',
    features: ['scheduling'],
  },
  {
    id: 'demo',
    host: 'demo',
    type: 'CNAME',
    target: DEPLOY_APP_SERVICE,
    description: 'Public sandbox host when this install is the demo project.',
    features: ['demo'],
  },
  {
    id: 'stats',
    host: 'stats',
    type: 'CNAME',
    target: 'plausible',
    description: 'Self-hosted Plausible.',
    extra: 'plausible_railway',
  },
  {
    id: 'watch',
    host: 'watch',
    type: 'CNAME',
    target: 'changedetection',
    description: 'Self-hosted ChangeDetection.io.',
    extra: 'changedetection_railway',
  },
];

export const DEPLOY_WIZARD_NEW_PROJECT = '__new__';

export function isDeployWizardNewProjectRef(project: string | undefined): boolean {
  const t = (project ?? '').trim();
  return !t || t === DEPLOY_WIZARD_NEW_PROJECT;
}

export function deployWizardDesiredProjectName(input: {
  projectName?: string;
  companyName?: string;
  siteDomain?: string;
  installSlug?: string;
}): string {
  const clean = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, 64);
  const typed = clean(input.projectName ?? '');
  if (typed) return typed;
  const company = clean(input.companyName ?? '');
  if (company) return company;
  const slug = resolveDeployWizardInstallSlug(input);
  return slug.replace(/-/g, ' ') || 'new-install';
}

export function normalizeSiteDomain(raw: string | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')[0]
    ?.split(':')[0]
    ?.toLowerCase()
    .replace(/^www\./, '') ?? '';
}

/** Public hostname only — used on the GitHub-App success return. */
export function isDeployWizardPublicHost(raw: string | undefined): boolean {
  const host = normalizeSiteDomain(raw);
  if (!host || host.length > 253) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.internal') || host.endsWith('.local')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host);
}

export function normalizeDeployWizardEmail(raw: string | undefined): string {
  const email = (raw ?? '').trim().toLowerCase().slice(0, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

export function normalizeDeployWizardPhone(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const us = (digits.startsWith('1') && digits.length >= 11 ? digits.slice(1) : digits).slice(0, 10);
  if (us.length === 10) return `+1${us}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return '';
}

export function normalizeDeployWizardPersonName(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Comma-separated ADMIN_USERNAME matches from optional owner name/email. */
export function defaultAdminUsernameFromOwner(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
}): string {
  const first = normalizeDeployWizardPersonName(input.firstName);
  const last = normalizeDeployWizardPersonName(input.lastName);
  const email = normalizeDeployWizardEmail(input.email);
  const parts: string[] = [];
  const add = (value: string) => {
    if (value && !parts.some((part) => part.toLowerCase() === value.toLowerCase())) parts.push(value);
  };
  add(first);
  add(last);
  add([first, last].filter(Boolean).join(' '));
  add(email);
  const local = email.split('@')[0]?.trim() || '';
  add(local);
  return parts.join(', ');
}

export function deployWizardSiteOrigin(raw: string | undefined): string {
  const host = normalizeSiteDomain(raw);
  return isDeployWizardPublicHost(host) ? `https://${host}` : '';
}

export function deployWizardFqdn(host: string, apex: string): string {
  const label = host === '@' ? '' : host;
  if (!apex) return label ? `${label}.{apex}` : '{apex}';
  return label ? `${label}.${apex}` : apex;
}

/** Demo / no-DNS staging host on the official zone, e.g. life-saving.reave.app */
export function deployWizardStagingHost(installSlug: string): string {
  const slug = (installSlug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'demo'}.reave.app`;
}

/** INSTALL_CONFIG slug derived from the company / install title (not typed separately). */
export function deriveInstallSlugFromCompanyName(
  companyName: string | undefined,
  fallback = 'demo',
): string {
  const slug = (companyName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

/** Resolve slug for a new wizard run — explicit installSlug only for re-apply / GitHub resume. */
export function resolveDeployWizardInstallSlug(input: {
  companyName?: string;
  siteDomain?: string;
  installSlug?: string;
}): string {
  const explicit = (input.installSlug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (explicit && explicit !== 'demo') return explicit.slice(0, 48) || 'demo';
  const fromCompany = deriveInstallSlugFromCompanyName(input.companyName, '');
  if (fromCompany) return fromCompany;
  const domain = normalizeSiteDomain(input.siteDomain);
  const label = domain.split('.')[0]?.replace(/^www\./, '') ?? '';
  if (label && !domain.endsWith('.reave.app')) {
    return deriveInstallSlugFromCompanyName(label.replace(/-/g, ' '), 'demo');
  }
  return 'demo';
}

/**
 * Canonical Railway service names. New installs must use these exact names
 * so reference templates stay copy-paste identical.
 */
export const DEPLOY_WIZARD_SERVICES: readonly DeployWizardService[] = [
  {
    id: DEPLOY_APP_SERVICE,
    label: 'Reave app',
    kind: 'app',
    description: 'Astro site + admin + APIs. Connect eliteweblabs/reave.',
    repo: 'eliteweblabs/reave',
  },
  {
    id: DEPLOY_APP_POSTGRES,
    label: 'App Postgres',
    kind: 'postgres',
    description: 'Chats, knowledge, jobs, media, email — referenced as DATABASE_URL on reave.',
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:16',
    volumeMount: '/var/lib/postgresql/data',
  },
  {
    id: 'contact-api',
    label: 'contact-api',
    kind: 'api',
    description: 'Contacts, portals, CardDAV backend. Schema is created on boot.',
    repo: 'eliteweblabs/contact-api',
  },
  {
    id: 'contact-postgres',
    label: 'contact-postgres',
    kind: 'postgres',
    description: 'Dedicated Postgres for contact-api (do not share reave-postgres).',
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:16',
    volumeMount: '/var/lib/postgresql/data',
  },
  {
    id: 'crater',
    label: 'Crater',
    kind: 'api',
    description: 'Invoicing UI + API.',
    repo: 'eliteweblabs/crater',
    features: ['billing'],
  },
  {
    id: 'crater-postgres',
    label: 'crater-postgres',
    kind: 'postgres',
    description: 'Crater database.',
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:16',
    volumeMount: '/var/lib/postgresql/data',
    features: ['billing'],
  },
  {
    id: 'galene',
    label: 'Galene',
    kind: 'api',
    description: 'Video meetings at meet.{apex}. Connect eliteweblabs/reave with root directory galene-railway.',
    repo: 'eliteweblabs/reave',
    features: ['video_meet'],
  },
  {
    id: 'calcom-booking-api',
    label: 'calcom-booking-api',
    kind: 'api',
    description: 'Booking REST API (private network to reave).',
    repo: 'eliteweblabs/calcom-booking-api',
    features: ['scheduling'],
  },
  {
    id: 'calcom-web-app',
    label: 'calcom-web-app',
    kind: 'api',
    description: 'Cal.com admin UI (same Docker image as reave.app — not the GitHub fork).',
    image: 'calcom/cal.com@sha256:ace3bb1219fb7306585ab9f4d94d41af7ee064c343db0498173436bbe857bd49',
    features: ['scheduling'],
  },
  {
    id: 'calcom-postgres',
    label: 'calcom-postgres',
    kind: 'postgres',
    description: 'Cal.com database.',
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:16',
    volumeMount: '/var/lib/postgresql/data',
    features: ['scheduling'],
  },
  {
    id: 'fleet-api',
    label: 'fleet-api',
    kind: 'api',
    description: 'Multi-vehicle GPS registry and location history.',
    repo: 'eliteweblabs/fleet-api',
    features: ['fleet_tracking'],
  },
  {
    id: 'fleet-postgres',
    label: 'fleet-postgres',
    kind: 'postgres',
    description: 'Fleet tracking database.',
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:16',
    volumeMount: '/var/lib/postgresql/data',
    features: ['fleet_tracking'],
  },
  {
    id: 'inventory-api',
    label: 'inventory-api',
    kind: 'api',
    description: 'Shopify / Woo / Square inventory proxy.',
    repo: 'eliteweblabs/inventory-api',
    features: ['inventory_sync'],
  },
  {
    id: 'materials-api',
    label: 'materials-api',
    kind: 'api',
    description: 'Retail materials pricing (Home Depot).',
    repo: 'eliteweblabs/materials-api',
    features: ['materials_pricing'],
  },
  {
    id: 'paulino-wizard',
    label: 'paulino-wizard',
    kind: 'api',
    description: 'Dealership inventory and deal flow. Same-project name still works for refs.',
    repo: 'eliteweblabs/paulino-wizard',
    features: ['dealership_wizard'],
  },
  {
    id: 'changedetection',
    label: 'changedetection',
    kind: 'api',
    description: 'Self-hosted ChangeDetection.io.',
    extra: 'changedetection_railway',
  },
  {
    id: 'plausible',
    label: 'plausible',
    kind: 'api',
    description: 'Self-hosted Plausible Analytics.',
    extra: 'plausible_railway',
  },
];

function v(
  partial: DeployWizardVariable & { required?: boolean },
): DeployWizardVariable {
  return { required: partial.required !== false, ...partial };
}

/** All variables the wizard can emit. Filtered by selected features / extras. */
export const DEPLOY_WIZARD_VARIABLES: readonly DeployWizardVariable[] = [
  // ── Shared keys (set once, referenced everywhere) ──
  v({
    name: 'CONTACT_API_CLIENT_KEY',
    service: 'shared',
    kind: 'generated',
    description: 'Shared client key for contact-api and reave.',
  }),
  v({
    name: 'FLEET_API_CLIENT_KEY',
    service: 'shared',
    kind: 'generated',
    description: 'Shared client key for fleet-api and reave.',
    features: ['fleet_tracking'],
  }),
  v({
    name: 'INVENTORY_API_CLIENT_KEY',
    service: 'shared',
    kind: 'generated',
    description: 'Shared client key for inventory-api and reave.',
    features: ['inventory_sync'],
  }),
  v({
    name: 'MATERIALS_API_CLIENT_KEY',
    service: 'shared',
    kind: 'generated',
    description: 'Shared client key for materials-api and reave.',
    features: ['materials_pricing'],
  }),
  v({
    name: 'CRATER_API_TOKEN',
    service: 'shared',
    kind: 'generated',
    description: 'Same token on Crater and reave.',
    features: ['billing'],
  }),

  // ── reave (app) — core ──
  v({
    name: 'DATABASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_POSTGRES, 'DATABASE_URL'),
    description: 'App Postgres connection.',
  }),
  v({
    name: 'PUBLIC_SITE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl(DEPLOY_APP_SERVICE),
    description: 'Public origin until a custom domain is attached.',
  }),
  v({
    name: 'COMPANY_ICON_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: `${railwayLocalRef('PUBLIC_SITE_URL')}/api/branding/icon?size=192`,
    description: 'Public brand icon. Siblings reference ${{ reave.COMPANY_ICON_URL }}.',
  }),
  v({
    name: 'COMPANY_LOGO_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: `${railwayLocalRef('PUBLIC_SITE_URL')}/api/branding/logo`,
    description: 'Public wordmark PNG. Crater mail uses ${{ reave.COMPANY_LOGO_URL }}.',
  }),
  v({
    name: 'CONTACT_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('contact-api'),
    description: 'contact-api public URL — do not hardcode.',
  }),
  v({
    name: 'CONTACT_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('CONTACT_API_CLIENT_KEY'),
    sharedKey: 'CONTACT_API_CLIENT_KEY',
    description: 'Same shared key contact-api reads as API_KEY.',
  }),
  v({
    name: 'INSTALL_CONFIG',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'demo',
    description: 'Install slug — loads config/config-{slug}.json.',
  }),
  v({
    name: 'REAVE_HUB_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'https://reave.app',
    required: false,
    description: 'Official reave hub for install-owner punch lists / feature requests.',
  }),
  v({
    name: 'REAVE_HUB_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    required: false,
    description:
      'Shared key the install owner uses to send punch-list items to official reave. Copied from this host when set.',
  }),
  v({
    name: 'FEATURES',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '[]',
    description:
      'Enabled optional modules as a JSON array. Merged with config/config-{slug}.json so Add-ons match what you toggled.',
  }),
  v({
    name: 'POST_ALIAS',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'project',
    description: 'User-facing work label (project, deal, job, lead). Plural is derived.',
  }),
  v({
    name: 'COMPANY_NAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Display name for the install. Prefills EMAIL_FROM_NAME when empty.',
    required: false,
  }),
  v({
    name: 'ADMIN_USERNAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Deployment owner match (comma-separated). Falls back to owner name/email, then company name.',
    required: false,
  }),
  v({
    name: 'OWNER_FIRST_NAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Optional owner first name. Applied to Profile on first sign-in.',
    required: false,
  }),
  v({
    name: 'OWNER_LAST_NAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Optional owner last name. Applied to Profile on first sign-in.',
    required: false,
  }),
  v({
    name: 'OWNER_EMAIL',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Optional owner email. Used for Web Push mailto and owner sign-in match. Clerk still owns the live login email.',
    required: false,
  }),
  v({
    name: 'OWNER_PHONE',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Optional owner phone (E.164). Applied to Profile on first sign-in.',
    required: false,
  }),
  v({
    name: 'COMPANY_DOMAIN',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Same apex as PUBLIC_SITE_DOMAIN — filled from the wizard site-domain field.',
    required: false,
  }),
  v({
    name: 'BOOKING_TIMEZONE',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'America/New_York',
    description: 'IANA timezone for schedules and reminders.',
    required: false,
  }),
  v({
    name: 'PUBLIC_CLERK_PUBLISHABLE_KEY',
    service: 'shared',
    kind: 'secret',
    description:
      'Clerk publishable key (pk_live_ / pk_test_) from a new Clerk application for this install — not reave.app’s keys.',
  }),
  v({
    name: 'CLERK_SECRET_KEY',
    service: 'shared',
    kind: 'secret',
    description:
      'Clerk secret key (sk_live_ / sk_test_) from the same install-scoped Clerk application.',
  }),
  v({
    name: 'PUBLIC_CLERK_PUBLISHABLE_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Same install-scoped Clerk publishable key on the app service.',
  }),
  v({
    name: 'CLERK_SECRET_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Same install-scoped Clerk secret key on the app service.',
  }),
  v({
    name: 'PUBLIC_CLERK_ALLOW_SIGN_UP',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'true',
    description: 'Allow first-user sign-up; tighten after the owner exists.',
    required: false,
  }),
  v({
    name: 'ANTHROPIC_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description:
      'Claude API key for the admin agent. Leave blank to use this host’s reave.app key (chat shows a shared-key flag). Paste the client’s key to use theirs.',
  }),
  v({
    name: 'RESEND_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description:
      'Resend API key (inbound + outbound). Copied from this host on apply. Apply also creates the inbound domain and webhook.',
  }),
  v({
    name: 'RESEND_WEBHOOK_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Resend email.received signing secret. Apply creates the webhook for https://{apex}/api/email/inbound.',
  }),
  v({
    name: 'RESEND_FROM',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Verified sender — noreply@inbound.{apex}, the Resend domain Apply already provisions.',
  }),
  v({
    name: 'EMAIL_FROM',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayLocalRef('RESEND_FROM'),
    description: 'Same-service alias so Cal.com / Crater can reference ${{reave.EMAIL_FROM}}.',
  }),
  v({
    name: 'EMAIL_FROM_NAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'From display name — filled from the company name field. Cal.com reads ${{reave.EMAIL_FROM_NAME}}.',
    required: false,
  }),
  v({
    name: 'PUBLIC_SITE_DOMAIN',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Install apex (acme.com). Filled from the wizard site-domain field.',
    required: false,
  }),
  v({
    name: 'PLANNED_SITE_DOMAIN',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Client-owned apex for go-live when staging on {slug}.reave.app.',
    required: false,
  }),
  v({
    name: 'VAPID_PUBLIC_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Web Push public key.',
    required: false,
  }),
  v({
    name: 'VAPID_PRIVATE_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Web Push private key.',
    required: false,
  }),
  v({
    name: 'VAPID_SUBJECT',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'mailto:admin@localhost',
    description: 'Web Push subject (mailto:). Filled from the owner email when provided.',
    required: false,
  }),
  v({
    name: 'PUSH_ENABLED',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '1',
    description: 'Enable admin PWA push.',
    required: false,
  }),
  v({
    name: 'AGENT_ALERT_USER_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Clerk user id of the deployment owner (set after first sign-in). Comma-separated for multiple admins.',
    required: false,
  }),
  v({
    name: 'DASHBOARD_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Contacts PII gate.',
    required: false,
  }),
  v({
    name: 'GOOGLE_MAPS_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Places, maps, and review sync.',
    required: false,
  }),
  v({
    name: 'PUBLIC_MAPBOX_ACCESS_TOKEN',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Mapbox token for admin geo maps and the Knowledge court-radius pin.',
    required: false,
  }),

  // ── contact-api ──
  v({
    name: 'DATABASE_URL',
    service: 'contact-api',
    kind: 'reference',
    value: railwayRef('contact-postgres', 'DATABASE_URL'),
    description: 'contact-api’s own Postgres — not reave-postgres.',
  }),
  v({
    name: 'API_KEY',
    service: 'contact-api',
    kind: 'shared',
    value: railwaySharedRef('CONTACT_API_CLIENT_KEY'),
    sharedKey: 'CONTACT_API_CLIENT_KEY',
    description: 'Must match CONTACT_API_KEY on reave.',
  }),
  v({
    name: 'ALLOWED_ORIGINS',
    service: 'contact-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'PUBLIC_SITE_URL'),
    description: 'CORS — pull the public site URL from reave, do not paste it.',
  }),

  // ── CardDAV / media ──
  v({
    name: 'CARDDAV_USERNAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'reave',
    description: 'HTTP Basic user for iOS CardDAV.',
    features: ['carddav'],
  }),
  v({
    name: 'CARDDAV_PASSWORD',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'HTTP Basic password for iOS CardDAV.',
    features: ['carddav'],
  }),
  v({
    name: 'MEDIA_WEBDAV_USERNAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'reave',
    description: 'Finder / iOS Files drop folder user (or reuse CardDAV).',
    required: false,
  }),
  v({
    name: 'MEDIA_WEBDAV_PASSWORD',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Media drop-folder password.',
    required: false,
  }),

  // ── Billing / Crater ──
  v({
    name: 'CRATER_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('crater'),
    description: 'Public Crater host.',
    features: ['billing'],
  }),
  v({
    name: 'CRATER_API_TOKEN',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('CRATER_API_TOKEN'),
    sharedKey: 'CRATER_API_TOKEN',
    description: 'Same shared token Crater reads.',
    features: ['billing'],
  }),
  v({
    name: 'DATABASE_URL',
    service: 'crater',
    kind: 'reference',
    value: railwayRef('crater-postgres', 'DATABASE_URL'),
    description: 'Crater Postgres.',
    features: ['billing'],
  }),
  v({
    name: 'CRATER_API_TOKEN',
    service: 'crater',
    kind: 'shared',
    value: railwaySharedRef('CRATER_API_TOKEN'),
    sharedKey: 'CRATER_API_TOKEN',
    description: 'Must match reave’s CRATER_API_TOKEN.',
    features: ['billing'],
  }),
  v({
    name: 'APP_URL',
    service: 'crater',
    kind: 'reference',
    value: railwayPublicUrl('crater'),
    description: 'Crater public origin.',
    features: ['billing'],
  }),
  v({
    name: 'COMPANY_LOGO_URL',
    service: 'crater',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'COMPANY_LOGO_URL'),
    description: 'Invoice email header — PNG wordmark, not SVG.',
    features: ['billing'],
  }),
  v({
    name: 'MAIL_MAILER',
    service: 'crater',
    kind: 'literal',
    value: 'smtp',
    description: 'Use SMTP (Resend) instead of sendmail.',
    features: ['billing'],
  }),

  // ── Video meet / Galene ──
  v({
    name: 'GALENE_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('galene'),
    description: 'Public Galene host (Meet footer tab + agent tools).',
    features: ['video_meet'],
  }),
  v({
    name: 'GALENE_ADMIN_PASSWORD',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('GALENE_ADMIN_PASSWORD'),
    sharedKey: 'GALENE_ADMIN_PASSWORD',
    description: 'Galene admin API password (HTTP Basic).',
    features: ['video_meet'],
  }),
  v({
    name: 'GALENE_ADMIN_PASSWORD',
    service: 'galene',
    kind: 'shared',
    value: railwaySharedRef('GALENE_ADMIN_PASSWORD'),
    sharedKey: 'GALENE_ADMIN_PASSWORD',
    description: 'Must match reave’s GALENE_ADMIN_PASSWORD.',
    features: ['video_meet'],
  }),
  v({
    name: 'GALENE_GROUP_PASSWORD',
    service: 'galene',
    kind: 'generated',
    description: 'Default room moderator password (username host).',
    features: ['video_meet'],
  }),
  v({
    name: 'REAVE_APP_URL',
    service: 'galene',
    kind: 'reference',
    value: railwayPublicUrl(DEPLOY_APP_SERVICE),
    description: 'Branding pull — GET /api/branding on boot.',
    features: ['video_meet'],
  }),
  v({
    name: 'GALENE_PUBLIC_URL',
    service: 'galene',
    kind: 'reference',
    value: railwayPublicUrl('galene'),
    description: 'Public origin written to config.json proxyURL.',
    features: ['video_meet'],
  }),
  v({
    name: 'GALENE_RELAY_ONLY',
    service: 'galene',
    kind: 'literal',
    value: '0',
    description: 'Allow direct WebRTC when TURN is unavailable.',
    features: ['video_meet'],
    required: false,
  }),

  v({
    name: 'MAIL_FROM_ADDRESS',
    service: 'crater',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'EMAIL_FROM'),
    description: 'Invoice mail from-address — same Resend sender as reave.',
    features: ['billing'],
  }),
  v({
    name: 'MAIL_FROM_NAME',
    service: 'crater',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'EMAIL_FROM_NAME'),
    description: 'Invoice from-name — ${{reave.EMAIL_FROM_NAME}}.',
    features: ['billing'],
  }),
  v({
    name: 'MAIL_PASSWORD',
    service: 'crater',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'RESEND_API_KEY'),
    description: 'Resend SMTP password from reave.RESEND_API_KEY.',
    features: ['billing'],
  }),
  v({
    name: 'MAIL_HOST',
    service: 'crater',
    kind: 'literal',
    value: 'smtp.resend.com',
    description: 'Resend SMTP.',
    features: ['billing'],
  }),
  v({
    name: 'MAIL_PORT',
    service: 'crater',
    kind: 'literal',
    value: '465',
    description: 'Resend SMTP port.',
    features: ['billing'],
  }),
  v({
    name: 'MAIL_USERNAME',
    service: 'crater',
    kind: 'literal',
    value: 'resend',
    description: 'Resend SMTP user.',
    features: ['billing'],
  }),
  v({
    name: 'MAIL_ENCRYPTION',
    service: 'crater',
    kind: 'literal',
    value: 'ssl',
    description: 'Resend SMTPS on 465.',
    features: ['billing'],
  }),

  // ── Scheduling / Cal.com ──
  v({
    name: 'BOOKING_API_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPrivateUrl('calcom-booking-api', 8080),
    description: 'Private booking API (service-to-service).',
    features: ['scheduling'],
  }),
  v({
    name: 'PUBLIC_BOOKING_API_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('calcom-booking-api'),
    description: 'Public booking URL for client embeds.',
    features: ['scheduling'],
  }),
  v({
    name: 'CALCOM_WEBAPP_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('calcom-web-app'),
    description: 'Cal.com admin UI.',
    features: ['scheduling'],
  }),
  v({
    name: 'CALCOM_USERNAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '',
    description: 'Booking username — filled from the install slug (company / domain). Cal.com picks this up from reave.',
    features: ['scheduling'],
  }),
  v({
    name: 'CALCOM_USERNAME',
    service: 'calcom-booking-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'CALCOM_USERNAME'),
    description: 'Same owner username as reave — booking-api looks this user up. Without it the calendar returns User not found.',
    features: ['scheduling'],
  }),
  v({
    name: 'MAPBOX_ACCESS_TOKEN',
    service: 'calcom-booking-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'PUBLIC_MAPBOX_ACCESS_TOKEN'),
    description: 'Geocode job-site addresses on create. Copied from reave PUBLIC_MAPBOX_ACCESS_TOKEN.',
    features: ['scheduling'],
    required: false,
  }),
  v({
    name: 'CALCOM_DATABASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayRef('calcom-postgres', 'DATABASE_URL'),
    description: 'So reave can push icon / username / email onto the Cal.com user when the sibling appears.',
    features: ['scheduling'],
  }),
  v({
    name: 'CALENDAR_REMINDER_POLL_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Cron auth for /api/calendar/reminders/poll.',
    features: ['scheduling'],
  }),
  v({
    name: 'BOOKING_API_KEY',
    service: 'shared',
    kind: 'generated',
    description: 'Shared key when calcom-booking-api enforces auth.',
    features: ['scheduling'],
    required: false,
  }),
  v({
    name: 'BOOKING_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('BOOKING_API_KEY'),
    sharedKey: 'BOOKING_API_KEY',
    description: 'Optional; sent to calcom-booking-api.',
    features: ['scheduling'],
    required: false,
  }),
  v({
    name: 'DATABASE_URL',
    service: 'calcom-booking-api',
    kind: 'reference',
    value: railwayRef('calcom-postgres', 'DATABASE_URL'),
    description: 'Cal.com Postgres (booking API).',
    features: ['scheduling'],
  }),
  v({
    name: 'CALCOM_DATABASE_URL',
    service: 'calcom-booking-api',
    kind: 'reference',
    value: railwayRef('calcom-postgres', 'DATABASE_URL'),
    description: 'Cal.com Postgres — booking-api reads CALCOM_DATABASE_URL (not DATABASE_URL alone).',
    features: ['scheduling'],
  }),
  v({
    name: 'MAPBOX_TOKEN',
    service: 'calcom-booking-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'PUBLIC_MAPBOX_ACCESS_TOKEN'),
    description: 'Geocode job-site addresses — server reads MAPBOX_TOKEN.',
    features: ['scheduling'],
    required: false,
  }),
  v({
    name: 'DATABASE_DIRECT_URL',
    service: 'calcom-booking-api',
    kind: 'reference',
    value: railwayRef('calcom-postgres', 'DATABASE_URL'),
    description: 'Same DB — Cal.com migrations need a direct URL.',
    features: ['scheduling'],
  }),
  v({
    name: 'API_KEY',
    service: 'calcom-booking-api',
    kind: 'shared',
    value: railwaySharedRef('BOOKING_API_KEY'),
    sharedKey: 'BOOKING_API_KEY',
    description: 'Must match BOOKING_API_KEY on reave.',
    features: ['scheduling'],
    required: false,
  }),
  v({
    name: 'DATABASE_URL',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef('calcom-postgres', 'DATABASE_URL'),
    description: 'Cal.com Postgres (web app).',
    features: ['scheduling'],
  }),
  v({
    name: 'DATABASE_DIRECT_URL',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef('calcom-postgres', 'DATABASE_URL'),
    description: 'Same DB — Cal.com migrations need a direct URL.',
    features: ['scheduling'],
  }),
  v({
    name: 'EMAIL_FROM',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'EMAIL_FROM'),
    description: 'Do not leave unset — Cal.com falls back to sendmail and mail never leaves the box.',
    features: ['scheduling'],
  }),
  v({
    name: 'EMAIL_FROM_NAME',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'EMAIL_FROM_NAME'),
    description: 'Display name — ${{reave.EMAIL_FROM_NAME}}, not a second paste.',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXT_PUBLIC_APP_NAME',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'EMAIL_FROM_NAME'),
    description: 'Cal.com UI title — same display name as reave.',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXT_PUBLIC_COMPANY_NAME',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'EMAIL_FROM_NAME'),
    description: 'Cal.com company name — ${{ reave.EMAIL_FROM_NAME }}.',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'EMAIL_FROM'),
    description: 'Cal.com support address — ${{ reave.EMAIL_FROM }}.',
    features: ['scheduling'],
  }),
  v({
    name: 'RESEND_API_KEY',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'RESEND_API_KEY'),
    description: 'Cal.com native Resend transport — same key as reave.',
    features: ['scheduling'],
  }),
  v({
    name: 'EMAIL_SERVER_HOST',
    service: 'calcom-web-app',
    kind: 'literal',
    value: 'smtp.resend.com',
    description: 'Resend SMTP (nodemailer fallback if RESEND_API_KEY is ignored).',
    features: ['scheduling'],
  }),
  v({
    name: 'EMAIL_SERVER_PORT',
    service: 'calcom-web-app',
    kind: 'literal',
    value: '465',
    description: 'Resend SMTP port.',
    features: ['scheduling'],
  }),
  v({
    name: 'EMAIL_SERVER_USER',
    service: 'calcom-web-app',
    kind: 'literal',
    value: 'resend',
    description: 'Resend SMTP user.',
    features: ['scheduling'],
  }),
  v({
    name: 'EMAIL_SERVER_PASSWORD',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'RESEND_API_KEY'),
    description: 'SMTP password = reave.RESEND_API_KEY.',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXT_PUBLIC_WEBAPP_URL',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayPublicUrl('calcom-web-app'),
    description: 'Public Cal.com origin (custom cal.{apex} once attached).',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXTAUTH_URL',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayPublicUrl('calcom-web-app'),
    description: 'Must match NEXT_PUBLIC_WEBAPP_URL.',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXTAUTH_SECRET',
    service: 'calcom-web-app',
    kind: 'generated',
    description: 'NextAuth secret (openssl rand -base64 32). next.config throws without it.',
    features: ['scheduling'],
  }),
  v({
    name: 'CALENDSO_ENCRYPTION_KEY',
    service: 'calcom-web-app',
    kind: 'generated',
    description: 'Cal.com calendar encryption key. next.config throws without this exact name.',
    features: ['scheduling'],
  }),
  v({
    name: 'ALLOWED_HOSTNAMES',
    service: 'calcom-web-app',
    kind: 'reference',
    value: railwayAllowedHostnames('calcom-web-app'),
    description: 'JSON hostname list matching RAILWAY_PUBLIC_DOMAIN (no https://).',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXT_PUBLIC_LICENSE_CONSENT',
    service: 'calcom-web-app',
    kind: 'literal',
    value: 'agree',
    description: 'Required by the official Cal.com Docker image.',
    features: ['scheduling'],
  }),
  v({
    name: 'PORT',
    service: 'calcom-web-app',
    kind: 'literal',
    value: '3000',
    description: 'Cal.com listens on 3000.',
    features: ['scheduling'],
  }),
  v({
    name: 'NEXT_PUBLIC_DISABLE_SIGNUP',
    service: 'calcom-web-app',
    kind: 'literal',
    value: 'true',
    description: 'Public signup off — owner is provisioned from reave.app identity.',
    features: ['scheduling'],
  }),

  // ── Fleet ──
  v({
    name: 'FLEET_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('fleet-api'),
    description: 'fleet-api public URL.',
    features: ['fleet_tracking'],
  }),
  v({
    name: 'FLEET_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('FLEET_API_CLIENT_KEY'),
    sharedKey: 'FLEET_API_CLIENT_KEY',
    description: 'Same shared key fleet-api reads as API_KEY.',
    features: ['fleet_tracking'],
  }),
  v({
    name: 'DATABASE_URL',
    service: 'fleet-api',
    kind: 'reference',
    value: railwayRef('fleet-postgres', 'DATABASE_URL'),
    description: 'Fleet Postgres.',
    features: ['fleet_tracking'],
  }),
  v({
    name: 'API_KEY',
    service: 'fleet-api',
    kind: 'shared',
    value: railwaySharedRef('FLEET_API_CLIENT_KEY'),
    sharedKey: 'FLEET_API_CLIENT_KEY',
    description: 'Must match FLEET_API_KEY on reave.',
    features: ['fleet_tracking'],
  }),
  v({
    name: 'ALLOWED_ORIGINS',
    service: 'fleet-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'PUBLIC_SITE_URL'),
    description: 'CORS — pull the public site URL from reave.',
    features: ['fleet_tracking'],
  }),

  // ── Inventory ──
  v({
    name: 'INVENTORY_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('inventory-api'),
    description: 'inventory-api public URL.',
    features: ['inventory_sync'],
  }),
  v({
    name: 'INVENTORY_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('INVENTORY_API_CLIENT_KEY'),
    sharedKey: 'INVENTORY_API_CLIENT_KEY',
    description: 'Same shared key inventory-api reads as API_KEY.',
    features: ['inventory_sync'],
  }),
  v({
    name: 'API_KEY',
    service: 'inventory-api',
    kind: 'shared',
    value: railwaySharedRef('INVENTORY_API_CLIENT_KEY'),
    sharedKey: 'INVENTORY_API_CLIENT_KEY',
    description: 'Must match INVENTORY_API_KEY on reave.',
    features: ['inventory_sync'],
  }),
  v({
    name: 'ALLOWED_ORIGINS',
    service: 'inventory-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'PUBLIC_SITE_URL'),
    description: 'CORS — pull the public site URL from reave.',
    features: ['inventory_sync'],
  }),

  // ── Materials (extra) ──
  v({
    name: 'MATERIALS_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('materials-api'),
    description: 'materials-api public URL.',
    features: ['materials_pricing'],
  }),
  v({
    name: 'MATERIALS_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('MATERIALS_API_CLIENT_KEY'),
    sharedKey: 'MATERIALS_API_CLIENT_KEY',
    description: 'Same shared key materials-api reads as API_KEY.',
    features: ['materials_pricing'],
  }),
  v({
    name: 'API_KEY',
    service: 'materials-api',
    kind: 'shared',
    value: railwaySharedRef('MATERIALS_API_CLIENT_KEY'),
    sharedKey: 'MATERIALS_API_CLIENT_KEY',
    description: 'Must match MATERIALS_API_KEY on reave.',
    features: ['materials_pricing'],
  }),
  v({
    name: 'ALLOWED_ORIGINS',
    service: 'materials-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'PUBLIC_SITE_URL'),
    description: 'CORS — pull the public site URL from reave.',
    features: ['materials_pricing'],
  }),

  // ── Dealership ──
  v({
    name: 'PAULINO_WIZARD_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('paulino-wizard'),
    description: 'Works when the service is named paulino-wizard in this project.',
    features: ['dealership_wizard'],
  }),

  // ── Voice / Vapi ──
  v({
    name: 'TELNYX_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Telnyx portal API key.',
    features: ['voice'],
  }),
  v({
    name: 'TELNYX_FROM_NUMBER',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Inbound number in E.164.',
    features: ['voice'],
  }),
  v({
    name: 'TELNYX_WEBHOOK_PUBLIC_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Telnyx webhook signature public key.',
    features: ['voice'],
  }),
  v({
    name: 'TELNYX_APP_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Call Control Application ID.',
    features: ['voice'],
  }),
  v({
    name: 'TELNYX_OPERATOR_NUMBER',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Transfer target for /takeover.',
    features: ['voice'],
    required: false,
  }),
  v({
    name: 'VOICE_AGENT_ENABLED',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '1',
    description: 'Enable the AI phone agent.',
    features: ['voice'],
  }),
  v({
    name: 'VAPI_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Vapi private key for admin sync.',
    features: ['vapi'],
  }),
  v({
    name: 'PUBLIC_VAPI_PUBLIC_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Vapi browser SDK key.',
    features: ['vapi'],
  }),
  v({
    name: 'PUBLIC_VAPI_ASSISTANT_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Vapi assistant UUID (or set in Admin → Vapi).',
    features: ['vapi'],
    required: false,
  }),

  // ── Monitoring ──
  v({
    name: 'CHANGEDETECTION_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('changedetection'),
    description: 'Self-hosted ChangeDetection public URL.',
    extra: 'changedetection_railway',
  }),
  v({
    name: 'CHANGEDETECTION_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'ChangeDetection.io instance URL (SaaS or existing host).',
    features: ['site_monitoring'],
  }),
  v({
    name: 'CHANGEDETECTION_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'ChangeDetection API key.',
    features: ['site_monitoring'],
  }),
  v({
    name: 'CHANGEDETECTION_WEBHOOK_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Auth for inbound change webhooks.',
    features: ['site_monitoring'],
  }),
  v({
    name: 'UPTIMEROBOT_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'UptimeRobot API key.',
    features: ['uptime_monitoring'],
  }),
  v({
    name: 'UPTIMEROBOT_WEBHOOK_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Auth for UptimeRobot webhooks.',
    features: ['uptime_monitoring'],
  }),
  v({
    name: 'GOOGLE_PAGESPEED_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'PageSpeed Insights / Lighthouse.',
    features: ['site_audits'],
  }),

  // ── Email marketing (Resend already in core; extras) ──
  v({
    name: 'NEWSLETTER_POLL_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Cron auth for /api/newsletter/poll.',
    features: ['email_marketing'],
  }),

  // ── Dev infra ──
  v({
    name: 'GITHUB_TOKEN',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    required: false,
    description:
      'Optional. Client website editor uses the GitHub App copied on apply (GitHub cannot mint PATs). Leave empty on client installs.',
    features: ['website', 'content_management', 'dev_infra'],
  }),
  v({
    name: 'GITHUB_WEBSITE_REPO',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    description: 'Front-end website repo (owner/repo). Created on apply as eliteweblabs/{slug}-site.',
    features: ['website', 'content_management'],
  }),
  v({
    name: 'GITHUB_APP_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Restricted GitHub App created on apply for this site’s repo only.',
    features: ['website', 'content_management'],
  }),
  v({
    name: 'GITHUB_APP_INSTALLATION_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Installation of that App on eliteweblabs/{slug}-site only (never reave).',
    features: ['website', 'content_management'],
  }),
  v({
    name: 'GITHUB_APP_PRIVATE_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Private key for this install’s App. Tokens are minted for GITHUB_WEBSITE_REPO only.',
    features: ['website', 'content_management'],
  }),
  v({
    name: 'RAILWAY_API_TOKEN',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Railway account token for deploy tools and this wizard’s apply step.',
    features: ['dev_infra'],
  }),
  v({
    name: 'RAILWAY_WEBHOOK_INGRESS_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Deploy-failure webhook key.',
    features: ['dev_infra'],
  }),
  v({
    name: 'KINSTA_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Kinsta API key (WordPress hosts).',
    features: ['dev_infra', 'wordpress_content'],
    required: false,
  }),
  v({
    name: 'KINSTA_COMPANY_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'MyKinsta company UUID.',
    features: ['dev_infra', 'wordpress_content'],
    required: false,
  }),

  // ── Other module secrets ──
  v({
    name: 'REAVE_WP_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Shared Reave Connect plugin key (X-Reave-Key). Paste the same value in WP Admin → Settings → Reave Connect.',
    features: ['wordpress_content'],
  }),
  v({
    name: 'REAVE_WP_SITE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    description: 'Default WordPress site URL for content tools (optional). Tools still accept site_url per call.',
    features: ['wordpress_content'],
    required: false,
  }),
  v({
    name: 'PEXELS_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Pexels stock photos (server-only).',
    features: ['website', 'stock_photos'],
  }),
  v({
    name: 'NAMECOM_USERNAME',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Name.com account username.',
    features: ['namecom_dns'],
  }),
  v({
    name: 'NAMECOM_TOKEN',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Name.com API token.',
    features: ['namecom_dns'],
  }),
  v({
    name: 'BRIGHTLOCAL_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'BrightLocal Citation Builder (agency key).',
    features: ['seo_directory'],
  }),
  v({
    name: 'ATTOM_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'ATTOM property data (or set REAL_ESTATE_DATA_PROVIDER=mock).',
    features: ['real_estate_data'],
    required: false,
  }),
  v({
    name: 'REAL_ESTATE_DATA_PROVIDER',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'attom',
    description: 'attom or mock.',
    features: ['real_estate_data'],
  }),
  v({
    name: 'LEAD_SCANNER_POLL_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Cron auth for /api/lead-scanner/poll.',
    features: ['real_estate_data'],
  }),
  v({
    name: 'ONLINE_REVIEWS_POLL_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Cron auth for /api/online-reviews/poll (Google review sync).',
    features: ['online_reviews'],
  }),
  v({
    name: 'ONLINE_REVIEWS_POLL_MINUTES',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '120',
    description: 'Minutes between automatic Google review sync runs (default 120).',
    features: ['online_reviews'],
    required: false,
  }),
  v({
    name: 'SOCIAL_LEAD_SCANNER_POLL_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'generated',
    description: 'Cron auth for /api/social-lead-scanner/poll.',
    features: ['social_lead_scanner'],
  }),
  v({
    name: 'SOCIAL_LEAD_SCANNER_POLL_MINUTES',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '60',
    description: 'Minutes between social keyword scans (default 60).',
    features: ['social_lead_scanner'],
    required: false,
  }),
  v({
    name: 'INSTAGRAM_APP_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description:
      'Instagram App ID from Meta → Instagram → API setup with Instagram login (not the Meta App ID).',
    features: ['social_inbox'],
    required: false,
  }),
  v({
    name: 'INSTAGRAM_APP_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Instagram App Secret from the same Business login settings panel.',
    features: ['social_inbox'],
    required: false,
  }),
  v({
    name: 'GOOGLE_CLIENT_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Google OAuth client (GSC / GA4 / Workspace DKIM).',
    features: ['analytic_audit', 'google_workspace'],
  }),
  v({
    name: 'GOOGLE_CLIENT_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Google OAuth secret.',
    features: ['analytic_audit', 'google_workspace'],
  }),
  v({
    name: 'PLAUSIBLE_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: 'https://plausible-analytics-ce-production-6fd8.up.railway.app',
    required: false,
    description: 'Shared self-hosted Plausible CE. Overridden when Plausible on Railway is selected.',
  }),
  v({
    name: 'PLAUSIBLE_API_BASE_URL',
    service: DEPLOY_APP_SERVICE,
    kind: 'reference',
    value: railwayPublicUrl('plausible'),
    description: 'Self-hosted Plausible public URL.',
    extra: 'plausible_railway',
  }),
  v({
    name: 'PLAUSIBLE_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Plausible API key.',
    features: ['analytic_audit'],
    required: false,
  }),
  v({
    name: 'INDEXNOW_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'IndexNow key for owned sites.',
    features: ['analytic_audit'],
    required: false,
  }),
  v({
    name: 'DEMO_MODE',
    service: DEPLOY_APP_SERVICE,
    kind: 'literal',
    value: '1',
    description: 'Enable demo seed tooling.',
    features: ['demo'],
  }),
];

export type DeployWizardDnsAccess = 'skip' | 'namecom' | 'godaddy' | 'cloudflare';

export type DeployWizardPlanInput = {
  features: readonly FeatureId[];
  extras?: readonly (DeployWizardExtraId | 'materials')[];
  /** Override the Astro service name if this install is not `reave`. */
  appService?: string;
  installSlug?: string;
  /** Client-owned apex (e.g. acme.com). Staging uses {slug}.reave.app when DNS is not ready. */
  siteDomain?: string;
  /** How Apply handles DNS when the apex is not in Cloudflare yet. */
  dnsAccess?: DeployWizardDnsAccess;
  /** Name.com API username — only used when dnsAccess is namecom (Apply only, not returned on plan). */
  namecomUsername?: string;
  /** Name.com API token — only used when dnsAccess is namecom (Apply only, not returned on plan). */
  namecomToken?: string;
  /** GoDaddy PAT — only used when dnsAccess is godaddy (Apply only, not returned on plan). */
  godaddyToken?: string;
  /** Work-record label (POST_ALIAS). Default `project`. */
  postAlias?: string;
  companyName?: string;
  adminUsername?: string;
  /** Optional owner Profile fields — applied on first sign-in. */
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  /** IANA timezone (BOOKING_TIMEZONE + Profile). Default America/New_York. */
  timezone?: string;
  /** Company identity + branding from the Client step. */
  client?: Partial<DeployWizardClientSetup>;
  /** Optional sample inbox / todos / schedule / knowledge for industries we do not have live access to yet. */
  seed?: Partial<DeployWizardSeedInput>;
};

/** Secrets filled from identity (not copied from this host). */
export const DEPLOY_WIZARD_DERIVED_SECRETS = new Set(['RESEND_FROM', 'EMAIL_FROM_NAME']);

/** Secrets that must not be copied from the reave.app host (client-scoped tokens). */
export const DEPLOY_WIZARD_NEVER_INHERIT = new Set([
  'GITHUB_TOKEN',
  'PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'AGENT_ALERT_USER_ID',
  'PUBLIC_VAPI_ASSISTANT_ID',
  'PUBLIC_VAPI_PUBLIC_KEY',
  'VAPI_API_KEY',
  'TELNYX_FROM_NUMBER',
  'TELNYX_OPERATOR_NUMBER',
]);

/** Secrets that show a paste field (Anthropic is optional — blank copies the reave.app host key). */
export const DEPLOY_WIZARD_OPERATOR_INPUT_SECRETS = new Set(['ANTHROPIC_API_KEY']);

/** Operator secrets that block Apply when empty. Resend is copied from this host on apply. */
export const DEPLOY_WIZARD_REQUIRED_OPERATOR_SECRETS = new Set<string>();

export const DEPLOY_WIZARD_NONE_INDUSTRY = { id: 'none', label: 'No sample data' } as const;

/** Industries that have dedicated seed fixtures in `scripts/demo-industries`. */
export const DEPLOY_WIZARD_FIXTURE_INDUSTRIES = [
  { id: 'law', label: 'Law firm' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'general', label: 'General contractor' },
] as const;

/** Fallback picker when the industries catalog is empty. */
export const DEPLOY_WIZARD_SEED_INDUSTRIES = [
  DEPLOY_WIZARD_NONE_INDUSTRY,
  ...DEPLOY_WIZARD_FIXTURE_INDUSTRIES,
] as const;

export type DeployWizardSeedIndustryId = string;

export function slugifyDeployWizardIndustry(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** `none` or a slug the industries catalog / seed picker can persist. */
export function isDeployWizardSeedIndustryId(value: string): boolean {
  if (value === 'none') return true;
  const slug = slugifyDeployWizardIndustry(value);
  return slug.length > 0 && slug === value.trim().toLowerCase();
}

/**
 * Picker list: no sample data, then enabled catalog industries, then fixture
 * industries the seed scripts still understand if the catalog has not listed them.
 * Disabled catalog rows stay hidden (fixture fallbacks do not re-add them).
 */
export type DeployWizardSeedIndustry = {
  id: string;
  label: string;
  playbook: DeckIndustryPlaybook;
};

export function mergeDeployWizardSeedIndustries(
  industries: ReadonlyArray<{
    id?: string | number;
    slug?: string;
    label: string;
    enabled?: boolean;
    playbook?: unknown;
  }>,
): DeployWizardSeedIndustry[] {
  const seen = new Set<string>(['none']);
  const catalog = new Set<string>();
  const rest: DeployWizardSeedIndustry[] = [];
  const add = (rawId: string, rawLabel: string, playbook?: unknown) => {
    const id = slugifyDeployWizardIndustry(rawId);
    const label = rawLabel.trim();
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    rest.push({
      id,
      label,
      playbook: normalizeIndustryPlaybook(playbook ?? defaultFixturePlaybook(id)),
    });
  };
  for (const row of industries) {
    const id = slugifyDeployWizardIndustry(String(row.slug || row.id || row.label));
    if (id) catalog.add(id);
    if (row.enabled === false) continue;
    add(String(row.slug || row.id || row.label), row.label, row.playbook);
  }
  for (const row of DEPLOY_WIZARD_FIXTURE_INDUSTRIES) {
    if (catalog.has(row.id)) continue;
    add(row.id, row.label, defaultFixturePlaybook(row.id));
  }
  rest.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return [
    { id: 'none', label: 'No sample data', playbook: normalizeIndustryPlaybook(null) },
    ...rest,
  ];
}

export type DeployWizardClientSetup = {
  /** Business tagline / short description. */
  tagline?: string;
  /** Office street address — Mapbox pin, bookings, and company panel. */
  address?: string;
  supportEmail?: string;
  supportPhone?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  /** Public logo URL (overrides default /api/branding/logo). */
  logoUrl?: string;
  /** Small inline logo upload — written as INSTALL_LOGO_DATA on apply. */
  logoData?: string;
  logoMediaType?: string;
};

export type DeployWizardSeedInput = {
  industry: DeployWizardSeedIndustryId;
  inbox: boolean;
  todos: boolean;
  schedule: boolean;
  /** Industry knowledge docs + law court gate (optional). */
  knowledge: boolean;
  /** @deprecated use client.address — kept for API compat */
  practiceAddress?: string;
  courtGateMode?: 'radius' | 'counties' | 'state';
  courtRadiusMi?: number;
  courtCounties?: string[];
  courtStates?: string[];
  practiceArea?: string;
  practiceAreas?: string[];
};

export function normalizeDeployWizardClient(
  raw?: Partial<DeployWizardClientSetup> | null,
  seed?: Partial<DeployWizardSeedInput> | null,
): DeployWizardClientSetup {
  const address = (raw?.address || seed?.practiceAddress || '').trim().slice(0, 200);
  const brandPrimary = normalizeBrandColorHex((raw?.brandPrimary || '').trim()) || undefined;
  const brandSecondary = normalizeBrandColorHex((raw?.brandSecondary || '').trim()) || undefined;
  const logoData = (raw?.logoData || '').trim();
  const logoMediaType = (raw?.logoMediaType || '').trim().slice(0, 80);
  return {
    tagline: (raw?.tagline || '').trim().slice(0, 240) || undefined,
    address: address || undefined,
    supportEmail: normalizeDeployWizardEmail(raw?.supportEmail) || undefined,
    supportPhone: normalizeDeployWizardPhone(raw?.supportPhone) || undefined,
    brandPrimary,
    brandSecondary,
    logoUrl: (raw?.logoUrl || '').trim().slice(0, 500) || undefined,
    logoData: logoData && logoData.length <= 24_000 ? logoData : undefined,
    logoMediaType:
      logoData && /^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/i.test(logoMediaType)
        ? logoMediaType
        : logoData
          ? 'image/png'
          : undefined,
  };
}

function normalizeSeedPracticeAreas(raw?: Partial<DeployWizardSeedInput> | null): string[] {
  const fromArr = Array.isArray(raw?.practiceAreas) ? raw.practiceAreas : [];
  const fromSingle = typeof raw?.practiceArea === 'string' ? raw.practiceArea.split(',') : [];
  return [
    ...new Set(
      [...fromArr, ...fromSingle]
        .map((s) => String(s).trim().toLowerCase())
        .filter(isPracticeArea),
    ),
  ];
}

export function normalizeDeployWizardSeed(raw?: Partial<DeployWizardSeedInput> | null): DeployWizardSeedInput {
  const industry = raw?.industry && isDeployWizardSeedIndustryId(raw.industry) ? raw.industry : 'none';
  const on = industry !== 'none';
  const radius = Number(raw?.courtRadiusMi);
  const practiceAreas = normalizeSeedPracticeAreas(raw);
  return {
    industry,
    inbox: on && raw?.inbox === true,
    todos: on && raw?.todos === true,
    schedule: on && raw?.schedule === true,
    knowledge: on && raw?.knowledge === true,
    practiceAddress: (raw?.practiceAddress || '').trim().slice(0, 200) || undefined,
    courtGateMode:
      raw?.courtGateMode === 'counties' || raw?.courtGateMode === 'state' || raw?.courtGateMode === 'radius'
        ? raw.courtGateMode
        : undefined,
    courtRadiusMi: Number.isFinite(radius) && radius > 0 ? Math.min(250, radius) : undefined,
    courtCounties: [...new Set((raw?.courtCounties ?? []).map((c) => String(c).trim()).filter(Boolean))],
    courtStates: [
      ...new Set(
        (raw?.courtStates ?? [])
          .map((s) => String(s).trim().toUpperCase())
          .filter((s) => /^[A-Z]{2}$/.test(s)),
      ),
    ],
    practiceAreas,
    practiceArea: practiceAreas[0],
  };
}

export function isDeployWizardRequiredOperatorSecret(
  name: string,
  _seed?: Pick<DeployWizardSeedInput, 'industry' | 'inbox'>,
): boolean {
  return DEPLOY_WIZARD_REQUIRED_OPERATOR_SECRETS.has(name);
}

/** GitHub App credentials created on apply (or reused from this host if already set). */
export const DEPLOY_WIZARD_GITHUB_APP_VARS = new Set([
  'GITHUB_APP_ID',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_APP_PRIVATE_KEY',
]);

/** Secrets created via an API on apply (not copied from this host). */
export const DEPLOY_WIZARD_PROVISIONED_SECRETS = new Set([
  'RESEND_WEBHOOK_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_APP_PRIVATE_KEY',
]);

export function isDeployWizardHostSecret(variable: Pick<DeployWizardVariable, 'kind' | 'name'>): boolean {
  return (
    variable.kind === 'secret' &&
    !DEPLOY_WIZARD_DERIVED_SECRETS.has(variable.name) &&
    !DEPLOY_WIZARD_PROVISIONED_SECRETS.has(variable.name) &&
    !DEPLOY_WIZARD_NEVER_INHERIT.has(variable.name)
  );
}

export function isDeployWizardProvisionedSecret(variable: Pick<DeployWizardVariable, 'kind' | 'name'>): boolean {
  return variable.kind === 'secret' && DEPLOY_WIZARD_PROVISIONED_SECRETS.has(variable.name);
}

/** Sender on the inbound domain Apply already creates in Resend (apex is a Railway CNAME). */
export function deployWizardResendFrom(siteDomain: string): string {
  return siteDomain ? `noreply@inbound.${siteDomain}` : '';
}

export function deployWizardInboundWebhookUrl(siteDomain: string): string {
  return siteDomain ? `https://${siteDomain}/api/email/inbound` : '';
}

export type DeployWizardPlanVariable = DeployWizardVariable & {
  filled: string;
  needsInput: boolean;
  /** Copy from this host’s env at apply. Never put the live value in `filled`. */
  inheritFromHost: boolean;
  /** crypto / VAPID pair minted on apply. */
  rolledOnApply: boolean;
  /** Created via a vendor API on apply (Resend webhook, …). */
  provisionedOnApply: boolean;
  /** Set only when sanitizing the plan for the browser — no secret values. */
  hostHasValue?: boolean;
};

export type DeployWizardPlan = {
  appService: string;
  installSlug: string;
  siteDomain: string;
  /** Client apex when staging on {slug}.reave.app — filled at go-live. */
  plannedSiteDomain: string;
  /** True when the public host is {slug}.reave.app (demo / no Cloudflare yet). */
  stagingHost: boolean;
  /** Create Cloudflare zone (+ Name.com NS) on Apply before DNS. */
  provisionOnApply: boolean;
  dnsAccess: DeployWizardDnsAccess;
  stagingNote?: string;
  postAlias: string;
  companyName: string;
  adminUsername: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  timezone: string;
  client: DeployWizardClientSetup;
  seed: DeployWizardSeedInput;
  features: FeatureId[];
  extras: DeployWizardExtraId[];
  services: DeployWizardService[];
  domains: DeployWizardPlanDomain[];
  variables: DeployWizardPlanVariable[];
  sharedKeys: string[];
  referenceCount: number;
  secretCount: number;
  hostSecretCount: number;
  generatedCount: number;
};

const EXTRA_IDS = new Set<string>(DEPLOY_WIZARD_EXTRAS.map((e) => e.id));

export function isDeployWizardExtraId(value: string): value is DeployWizardExtraId {
  return EXTRA_IDS.has(value);
}

function featureMatch(
  needed: readonly FeatureId[] | undefined,
  selected: ReadonlySet<string>,
): boolean {
  if (!needed?.length) return true;
  return needed.some((f) => selected.has(f));
}

function extraMatch(
  extra: DeployWizardExtraId | undefined,
  selected: ReadonlySet<string>,
): boolean {
  if (!extra) return true;
  return selected.has(extra);
}

/** Public-module host secrets still copy when the feature was not selected — a Law playbook must not strip Vapi / Telnyx / Pexels keys. Private ops tokens stay gated. */
function includeVariable(
  raw: DeployWizardVariable,
  featureSet: ReadonlySet<string>,
  extraSet: ReadonlySet<string>,
): boolean {
  if (!extraMatch(raw.extra, extraSet)) return false;
  if (featureMatch(raw.features, featureSet)) return true;
  if (!isDeployWizardHostSecret(raw) || !raw.features?.length) return false;
  return raw.features.every((feature) => isPublicFeature(feature));
}

export function listDeployWizardExtras(features: readonly FeatureId[]): DeployWizardExtra[] {
  const selected = new Set(features);
  return DEPLOY_WIZARD_EXTRAS.filter((e) => featureMatch(e.whenFeatures, selected));
}

function substituteAppService(value: string, appService: string): string {
  if (appService === DEPLOY_APP_SERVICE) return value;
  return value
    .replaceAll(`\${{ ${DEPLOY_APP_SERVICE}.`, `\${{ ${appService}.`)
    .replaceAll(`${DEPLOY_APP_SERVICE}.RAILWAY_`, `${appService}.RAILWAY_`);
}

export function buildDeployWizardPlan(input: DeployWizardPlanInput): DeployWizardPlan {
  const features = [...new Set(input.features)];
  // Legacy deploy wizard calls still pass extras: ['materials'] — treat as the module.
  if ((input.extras ?? []).includes('materials') && !features.includes('materials_pricing')) {
    features.push('materials_pricing');
  }
  features.splice(0, features.length, ...expandFeatureRequirements(features));
  const featureSet = new Set<string>(features);
  const extras = [...new Set(input.extras ?? [])].filter((id): id is DeployWizardExtraId => {
    if (!isDeployWizardExtraId(id)) return false;
    const extra = DEPLOY_WIZARD_EXTRAS.find((e) => e.id === id);
    return Boolean(extra && featureMatch(extra.whenFeatures, featureSet));
  });
  const appService = (input.appService?.trim() || DEPLOY_APP_SERVICE).slice(0, 64);
  const companyName = (input.companyName ?? '').trim().slice(0, 120);
  const installSlug = resolveDeployWizardInstallSlug({
    companyName,
    siteDomain: input.siteDomain,
    installSlug: input.installSlug,
  });
  const siteDomain = normalizeSiteDomain(input.siteDomain);
  const seed = normalizeDeployWizardSeed(input.seed);
  const client = normalizeDeployWizardClient(input.client, seed);
  const officeAddress = client.address || seed.practiceAddress;
  const postAlias = normalizePostAlias(input.postAlias || (isLawIndustrySlug(seed.industry) ? 'matter' : undefined));
  const ownerFirstName = normalizeDeployWizardPersonName(input.ownerFirstName);
  const ownerLastName = normalizeDeployWizardPersonName(input.ownerLastName);
  const ownerEmail = normalizeDeployWizardEmail(input.ownerEmail);
  const ownerPhone = normalizeDeployWizardPhone(input.ownerPhone);
  const adminUsername =
    (input.adminUsername ?? '').trim().slice(0, 120) ||
    defaultAdminUsernameFromOwner({ firstName: ownerFirstName, lastName: ownerLastName, email: ownerEmail });
  const timezone = (input.timezone?.trim() || 'America/New_York').slice(0, 64);
  const extraSet = new Set<string>(extras);

  const services = DEPLOY_WIZARD_SERVICES.filter(
    (s) => featureMatch(s.features, featureSet) && extraMatch(s.extra, extraSet),
  ).map((s) => (s.id === DEPLOY_APP_SERVICE && appService !== DEPLOY_APP_SERVICE ? { ...s, id: appService } : s));

  const seen = new Set<string>();
  const variables: DeployWizardPlanVariable[] = [];

  for (const raw of DEPLOY_WIZARD_VARIABLES) {
    if (!includeVariable(raw, featureSet, extraSet)) continue;

    // Prefer the Railway-hosted ChangeDetection / Plausible URL when that extra is on.
    if (
      raw.name === 'CHANGEDETECTION_BASE_URL' &&
      raw.kind === 'secret' &&
      extraSet.has('changedetection_railway')
    ) {
      continue;
    }
    if (raw.name === 'PLAUSIBLE_API_BASE_URL' && raw.kind !== 'reference' && extraSet.has('plausible_railway')) {
      continue;
    }

    const service = raw.service === DEPLOY_APP_SERVICE ? appService : raw.service;
    const dedupe = `${service}:${raw.name}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    let filled = raw.value ?? '';
    if (raw.name === 'INSTALL_CONFIG') filled = installSlug;
    if (raw.name === 'FEATURES') filled = JSON.stringify([...features].sort());
    if (raw.name === 'GITHUB_WEBSITE_REPO') filled = defaultWebsiteRepoSlug(installSlug);
    if (raw.name === 'CALCOM_USERNAME' && service === appService) filled = installSlug;
    if (raw.name === 'POST_ALIAS') filled = postAlias;
    if (raw.name === 'COMPANY_NAME') filled = companyName;
    if (raw.name === 'ADMIN_USERNAME') filled = adminUsername;
    if (raw.name === 'OWNER_FIRST_NAME') filled = ownerFirstName;
    if (raw.name === 'OWNER_LAST_NAME') filled = ownerLastName;
    if (raw.name === 'OWNER_EMAIL') filled = ownerEmail;
    if (raw.name === 'OWNER_PHONE') filled = ownerPhone;
    if (raw.name === 'BOOKING_TIMEZONE') filled = timezone;
    if (raw.name === 'PUBLIC_SITE_DOMAIN' && siteDomain) filled = siteDomain;
    if (raw.name === 'COMPANY_DOMAIN' && siteDomain) filled = siteDomain;
    if (raw.name === 'PLANNED_SITE_DOMAIN') filled = '';
    if (raw.name === 'EMAIL_FROM_NAME' && companyName) filled = companyName;
    if (raw.name === 'RESEND_FROM' && siteDomain) filled = deployWizardResendFrom(siteDomain);
    if (raw.name === 'COMPANY_LOGO_URL' && client.logoUrl) filled = client.logoUrl;
    if (raw.name === 'VAPID_SUBJECT' && ownerEmail) filled = `mailto:${ownerEmail}`;
    else if (raw.name === 'VAPID_SUBJECT' && siteDomain) filled = `mailto:admin@${siteDomain}`;
    if (appService !== DEPLOY_APP_SERVICE && filled) {
      filled = substituteAppService(filled, appService);
    }

    const inheritFromHost = isDeployWizardHostSecret(raw);
    const provisionedOnApply = isDeployWizardProvisionedSecret(raw);
    const rolledOnApply = raw.kind === 'generated';
    const required = isDeployWizardRequiredOperatorSecret(raw.name, seed);
    const needsInput = DEPLOY_WIZARD_OPERATOR_INPUT_SECRETS.has(raw.name);
    variables.push({
      ...raw,
      required,
      service,
      value: filled || raw.value,
      filled,
      needsInput,
      inheritFromHost,
      rolledOnApply,
      provisionedOnApply,
    });
  }

  const pushLiteral = (row: { name: string; value: string; description: string }) => {
    const dedupe = `${appService}:${row.name}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    variables.push({
      name: row.name,
      service: appService,
      kind: 'literal',
      description: row.description,
      required: false,
      filled: row.value,
      value: row.value,
      needsInput: false,
      inheritFromHost: false,
      rolledOnApply: false,
      provisionedOnApply: false,
    });
  };

  const bootstrapVars: Array<{ name: string; value: string; description: string }> = [];
  if (companyName || officeAddress || client.supportEmail || client.supportPhone || client.tagline || client.brandPrimary || client.brandSecondary || client.logoUrl || client.logoData) {
    bootstrapVars.push({
      name: 'INSTALL_BOOTSTRAP',
      value: '1',
      description: 'First admin visit writes company name, address, branding, and contact info from wizard env.',
    });
  }
  if (officeAddress) {
    bootstrapVars.push({
      name: 'BOOKING_DEFAULT_ADDRESS',
      value: officeAddress,
      description: 'Office address — Mapbox pin, bookings, driving directions, and company panel.',
    });
    bootstrapVars.push({
      name: 'COMPANY_ADDRESS',
      value: officeAddress,
      description: 'Same office address for company bootstrap.',
    });
  }
  if (client.tagline) {
    bootstrapVars.push({
      name: 'COMPANY_DESCRIPTION',
      value: client.tagline,
      description: 'Company tagline from the deploy wizard.',
    });
  }
  if (client.supportEmail) {
    bootstrapVars.push({
      name: 'COMPANY_SUPPORT_EMAIL',
      value: client.supportEmail,
      description: 'Public support / contact email.',
    });
  }
  if (client.supportPhone) {
    bootstrapVars.push({
      name: 'COMPANY_SUPPORT_PHONE',
      value: client.supportPhone,
      description: 'Public support phone.',
    });
  }
  if (client.brandPrimary) {
    bootstrapVars.push({
      name: 'COMPANY_BRAND_PRIMARY',
      value: client.brandPrimary,
      description: 'Primary brand color (hex).',
    });
  }
  if (client.brandSecondary) {
    bootstrapVars.push({
      name: 'COMPANY_BRAND_SECONDARY',
      value: client.brandSecondary,
      description: 'Secondary brand color (hex).',
    });
  }
  if (client.logoData) {
    bootstrapVars.push(
      {
        name: 'INSTALL_LOGO_DATA',
        value: client.logoData,
        description: 'Inline logo uploaded in the deploy wizard (base64).',
      },
      {
        name: 'INSTALL_LOGO_MEDIA_TYPE',
        value: client.logoMediaType || 'image/png',
        description: 'MIME type for INSTALL_LOGO_DATA.',
      },
    );
  }
  for (const row of bootstrapVars) pushLiteral(row);

  const wantsSampleSeed =
    seed.industry !== 'none' && (seed.inbox || seed.todos || seed.schedule || seed.knowledge);

  if (wantsSampleSeed) {
    const seedVars: Array<{ name: string; value: string; description: string }> = [
      { name: 'DEMO_INDUSTRY', value: seed.industry, description: 'Sample-data industry slug from Admin → Industries.' },
      { name: 'SEED_ON_BOOT', value: '1', description: 'First admin visit runs selected sample-data seeds.' },
      { name: 'SEED_INBOX', value: seed.inbox ? '1' : '0', description: 'Seed sample inbox messages.' },
      { name: 'SEED_TODOS', value: seed.todos ? '1' : '0', description: 'Seed sample todos / matters.' },
      { name: 'SEED_SCHEDULE', value: seed.schedule ? '1' : '0', description: 'Seed sample calendar bookings.' },
      { name: 'SEED_KNOWLEDGE', value: seed.knowledge ? '1' : '0', description: 'Seed industry knowledge docs (+ law court gate).' },
    ];
    if (isLawIndustrySlug(seed.industry) && seed.knowledge) {
      seedVars.push(
        {
          name: 'COURT_GATE_MODE',
          value: seed.courtGateMode || 'radius',
          description: 'How court knowledge is aggregated: radius | counties | state.',
        },
        {
          name: 'PRACTICE_AREA',
          value: (seed.practiceAreas?.length ? seed.practiceAreas : ['bankruptcy']).join(','),
          description: 'Legal departments this office serves (comma-separated: bankruptcy, tax, foreclosure, general).',
        },
      );
      if ((seed.courtGateMode || 'radius') === 'radius') {
        seedVars.push({
          name: 'COURT_RADIUS_MI',
          value: String(seed.courtRadiusMi || 60),
          description: 'Miles from the Mapbox office pin used to pull courthouses and trustees.',
        });
      }
      if (seed.courtGateMode === 'counties' && seed.courtCounties?.length) {
        seedVars.push({
          name: 'COURT_COUNTIES',
          value: seed.courtCounties.join(','),
          description: 'County gate (comma-separated).',
        });
      }
      if (seed.courtGateMode === 'state' && seed.courtStates?.length) {
        seedVars.push({
          name: 'COURT_STATES',
          value: seed.courtStates.join(','),
          description: 'State gate (comma-separated USPS codes).',
        });
      }
    }
    for (const row of seedVars) pushLiteral(row);
  } else if (seed.industry !== 'none') {
    pushLiteral({
      name: 'DEMO_INDUSTRY',
      value: seed.industry,
      description: 'Industry slug for playbooks and agent context (no sample rows seeded).',
    });
  }

  const sharedKeys = [...new Set(variables.filter((x) => x.service === 'shared').map((x) => x.name))];

  const domains = DEPLOY_WIZARD_DOMAINS.filter(
    (d) => featureMatch(d.features, featureSet) && extraMatch(d.extra, extraSet),
  ).map((d) => {
    const target = d.target === DEPLOY_APP_SERVICE ? appService : d.target;
    const fqdn = deployWizardFqdn(d.host, siteDomain);
    const attach =
      target === 'resend'
        ? 'Resend → Receiving (MX + verification)'
        : target === 'clerk'
          ? 'Clerk → Domains (copy CNAME)'
          : `Railway → ${target} → Settings → Networking → Custom domain`;
    return { ...d, target, fqdn, attach };
  });

  return {
    appService,
    installSlug,
    siteDomain,
    plannedSiteDomain: '',
    stagingHost: false,
    provisionOnApply: false,
    dnsAccess: 'skip',
    postAlias,
    companyName,
    adminUsername,
    ownerFirstName,
    ownerLastName,
    ownerEmail,
    ownerPhone,
    timezone,
    client,
    seed,
    features,
    extras,
    services,
    domains,
    variables,
    sharedKeys,
    referenceCount: variables.filter((x) => x.kind === 'reference' || x.kind === 'shared').length,
    secretCount: variables.filter((x) => x.kind === 'secret' && x.needsInput).length,
    hostSecretCount: variables.filter((x) => x.inheritFromHost).length,
    generatedCount: variables.filter((x) => x.kind === 'generated').length,
  };
}

export function formatDeployWizardCli(plan: DeployWizardPlan, values: Record<string, string> = {}): string {
  const lines: string[] = [
    `# Railway variable plan — service names must match exactly`,
    `# App service: ${plan.appService} · install: ${plan.installSlug}` +
      (plan.siteDomain ? ` · apex: ${plan.siteDomain}` : '') +
      ` · post: ${plan.postAlias}` +
      (plan.companyName ? ` · company: ${plan.companyName}` : '') +
      (plan.ownerEmail || plan.ownerFirstName
        ? ` · owner: ${[plan.ownerFirstName, plan.ownerLastName].filter(Boolean).join(' ')}${plan.ownerEmail ? ` <${plan.ownerEmail}>` : ''}`
        : ''),
    '',
  ];

  if (plan.domains.length) {
    lines.push('# DNS — Apply writes Railway CNAMEs + _railway-verify TXT on Cloudflare (skip book.; Clerk CNAMEs optional with /__clerk)');
    for (const domain of plan.domains) {
      const host = domain.host === '@' ? '@' : domain.host;
      lines.push(`# ${domain.type.padEnd(5)} ${host.padEnd(12)} ${domain.fqdn}  →  ${domain.attach}`);
    }
    lines.push('');
  }

  const byService = new Map<string, DeployWizardPlanVariable[]>();
  for (const variable of plan.variables) {
    const list = byService.get(variable.service) ?? [];
    list.push(variable);
    byService.set(variable.service, list);
  }

  for (const [service, vars] of byService) {
    lines.push(`# ${service}`);
    for (const variable of vars) {
      const key = `${variable.service}:${variable.name}`;
      const value = values[key] ?? variable.filled;
      if (variable.inheritFromHost) {
        lines.push(`# railway variable set ${variable.name}='<from this host>' --service ${service} --skip-deploys`);
        continue;
      }
      if (variable.provisionedOnApply) {
        lines.push(`# railway variable set ${variable.name}='<created on apply>' --service ${service} --skip-deploys`);
        continue;
      }
      if (variable.rolledOnApply || variable.kind === 'generated') {
        lines.push(`# railway variable set ${variable.name}='<rolled on apply>' --service ${service} --skip-deploys`);
        continue;
      }
      if (!value && variable.kind === 'secret') {
        lines.push(`# railway variable set ${variable.name}='<paste>' --service ${service} --skip-deploys`);
        continue;
      }
      const quoted = value.replace(/'/g, `'\\''`);
      if (service === 'shared') {
        lines.push(`railway variable set ${variable.name}='${quoted}' --skip-deploys`);
      } else {
        lines.push(`railway variable set ${variable.name}='${quoted}' --service ${service} --skip-deploys`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

export function featureLabel(feature: FeatureId): string {
  return FEATURE_LABELS[feature] ?? feature;
}

export function featureBlurb(feature: FeatureId): string {
  return FEATURE_BLURBS[feature] ?? '';
}
