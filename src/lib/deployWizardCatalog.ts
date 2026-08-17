/**
 * Deployment wizard catalog — Railway sibling services and variable references.
 *
 * Service names are the contract. Keep them stable so every new install can
 * reuse the same `${{ service.VAR }}` / `${{ shared.KEY }}` templates.
 *
 * @see https://docs.railway.com/guides/variables#reference-variables
 */
import { FEATURE_BLURBS, FEATURE_LABELS, type FeatureId } from './featureCatalog';
import { normalizePostAlias } from './postAlias';

/** Consumer Astro service — matches Reave App / Reave Demo (`reave`). */
export const DEPLOY_APP_SERVICE = 'reave';
export const DEPLOY_APP_POSTGRES = 'reave-postgres';

export type DeployServiceKind = 'app' | 'api' | 'postgres';
export type DeployVarKind = 'reference' | 'shared' | 'secret' | 'generated' | 'literal';

export type DeployWizardExtraId = 'materials' | 'changedetection_railway' | 'plausible_railway';

export type DeployWizardService = {
  id: string;
  label: string;
  kind: DeployServiceKind;
  description: string;
  repo?: string;
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

export function railwayPrivateUrl(service: string, port?: number): string {
  const host = `\${{ ${service}.RAILWAY_PRIVATE_DOMAIN }}`;
  return port ? `http://${host}:${port}` : `http://${host}`;
}

export const DEPLOY_WIZARD_EXTRAS: readonly DeployWizardExtra[] = [
  {
    id: 'materials',
    label: 'Materials API',
    blurb: 'Home Depot pricing for estimates — same-project materials-api service.',
  },
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
    description: 'Resend receiving. Mailbox is inbox@inbound.{apex}. Copy MX from Resend → Receiving.',
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
    description: 'Public booking API for client embeds (PUBLIC_BOOKING_API_URL).',
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

export function deployWizardFqdn(host: string, apex: string): string {
  const label = host === '@' ? '' : host;
  if (!apex) return label ? `${label}.{apex}` : '{apex}';
  return label ? `${label}.${apex}` : apex;
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
  },
  {
    id: 'crater',
    label: 'Crater',
    kind: 'api',
    description: 'Invoicing UI + API.',
    repo: 'eliteweblabs/crater-invoicing',
    features: ['billing'],
  },
  {
    id: 'crater-postgres',
    label: 'crater-postgres',
    kind: 'postgres',
    description: 'Crater database.',
    features: ['billing'],
  },
  {
    id: 'calcom-booking-api',
    label: 'calcom-booking-api',
    kind: 'api',
    description: 'Booking REST API (private network to reave).',
    features: ['scheduling'],
  },
  {
    id: 'calcom-web-app',
    label: 'calcom-web-app',
    kind: 'api',
    description: 'Cal.com admin UI.',
    features: ['scheduling'],
  },
  {
    id: 'calcom-postgres',
    label: 'calcom-postgres',
    kind: 'postgres',
    description: 'Cal.com database.',
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
    extra: 'materials',
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
    extra: 'materials',
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
    description: 'Deployment owner match (comma-separated). Falls back to company name.',
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
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Clerk publishable key (pk_live_ / pk_test_).',
  }),
  v({
    name: 'CLERK_SECRET_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Clerk secret key (sk_live_ / sk_test_).',
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
    description: 'Claude API key for the admin agent.',
  }),
  v({
    name: 'RESEND_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Resend API key (inbound + outbound).',
  }),
  v({
    name: 'RESEND_WEBHOOK_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Resend email.received webhook signing secret.',
  }),
  v({
    name: 'RESEND_FROM',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Verified sender, e.g. Reave <noreply@mail.example.com>. Source of truth for sibling EMAIL_FROM.',
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
    description: 'From display name (e.g. Tony Barletta Jr.). Cal.com reads ${{reave.EMAIL_FROM_NAME}}.',
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
    description: 'Web Push subject (mailto:). Update to the owner email.',
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
    description: 'Clerk user id of the deployment owner (set after first sign-in).',
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
    description: 'Mapbox token for admin geo maps.',
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
    name: 'MAIL_MAILER',
    service: 'crater',
    kind: 'literal',
    value: 'smtp',
    description: 'Use SMTP (Resend) instead of sendmail.',
    features: ['billing'],
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
    description: 'NextAuth secret (openssl rand -base64 32).',
    features: ['scheduling'],
  }),
  v({
    name: 'CALENDAR_ENCRYPTION_KEY',
    service: 'calcom-web-app',
    kind: 'generated',
    description: 'Cal.com calendar encryption key.',
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
    extra: 'materials',
  }),
  v({
    name: 'MATERIALS_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'shared',
    value: railwaySharedRef('MATERIALS_API_CLIENT_KEY'),
    sharedKey: 'MATERIALS_API_CLIENT_KEY',
    description: 'Same shared key materials-api reads as API_KEY.',
    extra: 'materials',
  }),
  v({
    name: 'API_KEY',
    service: 'materials-api',
    kind: 'shared',
    value: railwaySharedRef('MATERIALS_API_CLIENT_KEY'),
    sharedKey: 'MATERIALS_API_CLIENT_KEY',
    description: 'Must match MATERIALS_API_KEY on reave.',
    extra: 'materials',
  }),
  v({
    name: 'ALLOWED_ORIGINS',
    service: 'materials-api',
    kind: 'reference',
    value: railwayRef(DEPLOY_APP_SERVICE, 'PUBLIC_SITE_URL'),
    description: 'CORS — pull the public site URL from reave.',
    extra: 'materials',
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
    description: 'GitHub PAT for the Agentic Website Editor (write_github_file).',
    features: ['content_management', 'dev_infra'],
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
    name: 'PEXELS_API_KEY',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Pexels stock photos (server-only).',
    features: ['stock_photos'],
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
    name: 'GOOGLE_CLIENT_ID',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Google OAuth client (GSC / GA4).',
    features: ['analytic_audit'],
  }),
  v({
    name: 'GOOGLE_CLIENT_SECRET',
    service: DEPLOY_APP_SERVICE,
    kind: 'secret',
    description: 'Google OAuth secret.',
    features: ['analytic_audit'],
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

export type DeployWizardPlanInput = {
  features: readonly FeatureId[];
  extras?: readonly DeployWizardExtraId[];
  /** Override the Astro service name if this install is not `reave`. */
  appService?: string;
  installSlug?: string;
  /** Install apex, e.g. `acme.com` — used to render FQDNs. */
  siteDomain?: string;
  /** Work-record label (POST_ALIAS). Default `project`. */
  postAlias?: string;
  companyName?: string;
  adminUsername?: string;
  /** IANA timezone (BOOKING_TIMEZONE). Default America/New_York. */
  timezone?: string;
};

export type DeployWizardPlanVariable = DeployWizardVariable & {
  filled: string;
  needsInput: boolean;
};

export type DeployWizardPlan = {
  appService: string;
  installSlug: string;
  siteDomain: string;
  postAlias: string;
  companyName: string;
  adminUsername: string;
  timezone: string;
  features: FeatureId[];
  extras: DeployWizardExtraId[];
  services: DeployWizardService[];
  domains: DeployWizardPlanDomain[];
  variables: DeployWizardPlanVariable[];
  sharedKeys: string[];
  referenceCount: number;
  secretCount: number;
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
  const featureSet = new Set<string>(features);
  const extras = [...new Set(input.extras ?? [])].filter((id) => {
    if (!isDeployWizardExtraId(id)) return false;
    const extra = DEPLOY_WIZARD_EXTRAS.find((e) => e.id === id);
    return Boolean(extra && featureMatch(extra.whenFeatures, featureSet));
  });
  const appService = (input.appService?.trim() || DEPLOY_APP_SERVICE).slice(0, 64);
  const installSlug = (input.installSlug?.trim() || 'demo').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'demo';
  const siteDomain = normalizeSiteDomain(input.siteDomain);
  const postAlias = normalizePostAlias(input.postAlias);
  const companyName = (input.companyName ?? '').trim().slice(0, 120);
  const adminUsername = (input.adminUsername ?? '').trim().slice(0, 120);
  const timezone = (input.timezone?.trim() || 'America/New_York').slice(0, 64);
  const extraSet = new Set<string>(extras);

  const services = DEPLOY_WIZARD_SERVICES.filter(
    (s) => featureMatch(s.features, featureSet) && extraMatch(s.extra, extraSet),
  ).map((s) => (s.id === DEPLOY_APP_SERVICE && appService !== DEPLOY_APP_SERVICE ? { ...s, id: appService } : s));

  const seen = new Set<string>();
  const variables: DeployWizardPlanVariable[] = [];

  for (const raw of DEPLOY_WIZARD_VARIABLES) {
    if (!featureMatch(raw.features, featureSet) || !extraMatch(raw.extra, extraSet)) continue;

    // Prefer the Railway-hosted ChangeDetection / Plausible URL when that extra is on.
    if (
      raw.name === 'CHANGEDETECTION_BASE_URL' &&
      raw.kind === 'secret' &&
      extraSet.has('changedetection_railway')
    ) {
      continue;
    }
    if (raw.name === 'PLAUSIBLE_API_BASE_URL' && raw.kind === 'secret' && extraSet.has('plausible_railway')) {
      continue;
    }

    const service = raw.service === DEPLOY_APP_SERVICE ? appService : raw.service;
    const dedupe = `${service}:${raw.name}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    let filled = raw.value ?? '';
    if (raw.name === 'INSTALL_CONFIG') filled = installSlug;
    if (raw.name === 'CALCOM_USERNAME') filled = installSlug;
    if (raw.name === 'POST_ALIAS') filled = postAlias;
    if (raw.name === 'COMPANY_NAME') filled = companyName;
    if (raw.name === 'ADMIN_USERNAME') filled = adminUsername;
    if (raw.name === 'BOOKING_TIMEZONE') filled = timezone;
    if (raw.name === 'PUBLIC_SITE_DOMAIN' && siteDomain) filled = siteDomain;
    if (raw.name === 'COMPANY_DOMAIN' && siteDomain) filled = siteDomain;
    if (raw.name === 'EMAIL_FROM_NAME' && companyName) filled = companyName;
    if (raw.name === 'VAPID_SUBJECT' && siteDomain) filled = `mailto:admin@${siteDomain}`;
    if (appService !== DEPLOY_APP_SERVICE && filled) {
      filled = substituteAppService(filled, appService);
    }

    const needsInput = raw.kind === 'secret' || raw.kind === 'generated' || raw.kind === 'literal';
    variables.push({ ...raw, service, value: filled || raw.value, filled, needsInput });
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
    postAlias,
    companyName,
    adminUsername,
    timezone,
    features,
    extras,
    services,
    domains,
    variables,
    sharedKeys,
    referenceCount: variables.filter((x) => x.kind === 'reference' || x.kind === 'shared').length,
    secretCount: variables.filter((x) => x.kind === 'secret').length,
    generatedCount: variables.filter((x) => x.kind === 'generated').length,
  };
}

export function formatDeployWizardCli(plan: DeployWizardPlan, values: Record<string, string> = {}): string {
  const lines: string[] = [
    `# Railway variable plan — service names must match exactly`,
    `# App service: ${plan.appService} · install: ${plan.installSlug}` +
      (plan.siteDomain ? ` · apex: ${plan.siteDomain}` : '') +
      ` · post: ${plan.postAlias}` +
      (plan.companyName ? ` · company: ${plan.companyName}` : ''),
    '',
  ];

  if (plan.domains.length) {
    lines.push('# DNS — add these on the install apex, then attach CNAMEs on the named Railway service');
    lines.push('# Railway also asks for a TXT _railway-verify record until each custom domain verifies.');
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
