import { projectRoot } from './projectRoot';
/**
 * First-run client setup — steps reave.app cannot complete from the deploy wizard
 * (device install, the client’s mailbox admin, their own API keys).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isCardDavConfigured } from './carddav/auth';
import { getStoredCompanyConfig } from './companyConfigStore';
import { hasFeature } from './features';
import { isCanonicalReaveInstall } from './installConfig';
import { getPgPool } from './pgPool';
import { isResendConfigured } from './resendDnsSync';
import { serverEnv } from './serverEnv';

export type ClientSetupStepId =
  | 'pwa'
  | 'other-devices'
  | 'email-key'
  | 'mail-provider'
  | 'company'
  | 'push'
  | 'carddav'
  | 'maps';

export type ClientSetupStep = {
  id: ClientSetupStepId;
  title: string;
  summary: string;
  required: boolean;
  done: boolean;
  autoDone: boolean;
};

export type ClientSetupProgress = {
  completed: ClientSetupStepId[];
  skipped: ClientSetupStepId[];
  dismissedUntil: string | null;
  finishedAt: string | null;
};

export type ClientSetupState = {
  enabled: boolean;
  finished: boolean;
  dismissed: boolean;
  steps: ClientSetupStep[];
  remaining: number;
  brand: { name: string; domain: string };
  inboundHost: string;
  carddavUsername: string | null;
  carddavConfigured: boolean;
  resendConfigured: boolean;
  mapsConfigured: boolean;
  companyAddress: string | null;
};

const STEP_IDS: ClientSetupStepId[] = [
  'pwa',
  'other-devices',
  'email-key',
  'mail-provider',
  'company',
  'push',
  'carddav',
  'maps',
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS client_setup (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  completed TEXT[] NOT NULL DEFAULT '{}',
  skipped TEXT[] NOT NULL DEFAULT '{}',
  dismissed_until TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO client_setup (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`;

function isStepId(value: string): value is ClientSetupStepId {
  return STEP_IDS.includes(value as ClientSetupStepId);
}

function uniqSteps(values: string[]): ClientSetupStepId[] {
  return [...new Set(values.filter(isStepId))];
}

function emptyProgress(): ClientSetupProgress {
  return { completed: [], skipped: [], dismissedUntil: null, finishedAt: null };
}


function filePath(): string {
  return join(projectRoot(), 'src', 'knowledge', 'client-setup.json');
}

export function isClientSetupEnabled(): boolean {
  const flag = serverEnv('CLIENT_SETUP')?.trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  return !isCanonicalReaveInstall();
}

function companyDomain(): string {
  return (
    serverEnv('COMPANY_DOMAIN')?.trim() ||
    serverEnv('PUBLIC_SITE_DOMAIN')?.trim() ||
    ''
  ).replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

export function inboundMailHost(domain = companyDomain()): string {
  const host = domain.replace(/^www\./, '').split('/')[0] || '';
  if (!host || host.endsWith('.up.railway.app')) return 'inbound.your-domain.com';
  return `inbound.${host}`;
}

async function contextFlags() {
  const stored = await getStoredCompanyConfig();
  return {
    resendConfigured: isResendConfigured(),
    mapsConfigured: Boolean(serverEnv('GOOGLE_MAPS_API_KEY')?.trim() || serverEnv('GOOGLE_PLACES_API_KEY')?.trim()),
    carddavConfigured: isCardDavConfigured(),
    carddavUsername: serverEnv('CARDDAV_USERNAME')?.trim() || null,
    companyName: stored?.name?.trim() || serverEnv('COMPANY_NAME')?.trim() || '',
    companyAddress: stored?.address?.trim() || serverEnv('BOOKING_DEFAULT_ADDRESS')?.trim() || null,
    domain: companyDomain(),
    carddavOn: hasFeature('carddav'),
    mapsUseful: hasFeature('online_reviews') || hasFeature('scheduling') || hasFeature('real_estate_data'),
  };
}

export function buildClientSetupSteps(
  flags: {
    resendConfigured: boolean;
    mapsConfigured: boolean;
    companyAddress: string | null;
    carddavOn: boolean;
    mapsUseful: boolean;
  },
  progress: ClientSetupProgress,
): ClientSetupStep[] {
  const marked = new Set([...progress.completed, ...progress.skipped]);
  const catalog: Array<Omit<ClientSetupStep, 'done' | 'autoDone'> & { include: boolean; auto: boolean }> = [
    {
      id: 'pwa',
      title: 'Install this device',
      summary: 'Add the admin app to your phone or computer so it opens like a real app — we cannot do this from the server.',
      required: true,
      include: true,
      auto: false,
    },
    {
      id: 'other-devices',
      title: 'Phone and laptop',
      summary: 'Repeat install on the other device you work from (Windows, Mac, iPhone, or Android).',
      required: false,
      include: true,
      auto: false,
    },
    {
      id: 'email-key',
      title: 'Your email API key',
      summary: 'Create a Resend API key on the account that owns your domain. We cannot log into your Resend (or Google / Microsoft) admin.',
      required: true,
      include: !flags.resendConfigured,
      auto: flags.resendConfigured,
    },
    {
      id: 'mail-provider',
      title: 'Google Workspace or Microsoft 365',
      summary: 'If staff already live in Gmail or Outlook, keep that MX. This OS receives at an inbound host — do not replace your Workspace or 365 records.',
      required: false,
      include: true,
      auto: false,
    },
    {
      id: 'company',
      title: 'Office address',
      summary: 'The Mapbox pin (courts, bookings, maps) needs the street address only you know.',
      required: false,
      include: !flags.companyAddress,
      auto: Boolean(flags.companyAddress),
    },
    {
      id: 'push',
      title: 'Notifications',
      summary: 'Allow alerts on this device. Browsers will not let us turn that on remotely.',
      required: false,
      include: true,
      auto: false,
    },
    {
      id: 'carddav',
      title: 'Contacts on iPhone',
      summary: 'Add the CardDAV account in iOS Settings. The username is on this install — the phone step is yours.',
      required: false,
      include: flags.carddavOn,
      auto: false,
    },
    {
      id: 'maps',
      title: 'Google Maps key',
      summary: 'Reviews and address autocomplete need a key from your Google Cloud project.',
      required: false,
      include: flags.mapsUseful && !flags.mapsConfigured,
      auto: flags.mapsConfigured,
    },
  ];

  return catalog
    .filter((row) => row.include || row.auto)
    .map((row) => {
      const autoDone = row.auto;
      return {
        id: row.id,
        title: row.title,
        summary: row.summary,
        required: row.required && !autoDone,
        autoDone,
        done: autoDone || marked.has(row.id),
      };
    });
}

function readFileProgress(): ClientSetupProgress | null {
  try {
    if (!existsSync(filePath())) return null;
    const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as Partial<ClientSetupProgress>;
    return {
      completed: uniqSteps(raw.completed ?? []),
      skipped: uniqSteps(raw.skipped ?? []),
      dismissedUntil: typeof raw.dismissedUntil === 'string' ? raw.dismissedUntil : null,
      finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : null,
    };
  } catch {
    return null;
  }
}

function writeFileProgress(progress: ClientSetupProgress): void {
  const dir = dirname(filePath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath(), `${JSON.stringify(progress, null, 2)}\n`);
}

export async function getClientSetupProgress(): Promise<ClientSetupProgress> {
  const pool = getPgPool();
  if (pool) {
    await pool.query(SCHEMA);
    const { rows } = await pool.query<{
      completed: string[] | null;
      skipped: string[] | null;
      dismissed_until: Date | null;
      finished_at: Date | null;
    }>('SELECT completed, skipped, dismissed_until, finished_at FROM client_setup WHERE id = 1');
    const row = rows[0];
    if (row) {
      return {
        completed: uniqSteps(row.completed ?? []),
        skipped: uniqSteps(row.skipped ?? []),
        dismissedUntil: row.dismissed_until ? row.dismissed_until.toISOString() : null,
        finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
      };
    }
  }
  return readFileProgress() ?? emptyProgress();
}

export async function setClientSetupProgress(next: ClientSetupProgress): Promise<ClientSetupProgress> {
  const progress: ClientSetupProgress = {
    completed: uniqSteps(next.completed),
    skipped: uniqSteps(next.skipped),
    dismissedUntil: next.dismissedUntil,
    finishedAt: next.finishedAt,
  };
  const pool = getPgPool();
  if (pool) {
    await pool.query(SCHEMA);
    await pool.query(
      `UPDATE client_setup
       SET completed = $1, skipped = $2, dismissed_until = $3, finished_at = $4, updated_at = now()
       WHERE id = 1`,
      [
        progress.completed,
        progress.skipped,
        progress.dismissedUntil,
        progress.finishedAt,
      ],
    );
  } else {
    writeFileProgress(progress);
  }
  return progress;
}

export async function getClientSetupState(): Promise<ClientSetupState> {
  const enabled = isClientSetupEnabled();
  const [progress, flags] = await Promise.all([getClientSetupProgress(), contextFlags()]);
  const steps = enabled
    ? buildClientSetupSteps(flags, progress)
    : buildClientSetupSteps(flags, progress).map((step) => ({ ...step, done: true }));
  const remaining = steps.filter((step) => !step.done).length;
  const dismissed =
    Boolean(progress.dismissedUntil) && Date.parse(progress.dismissedUntil || '') > Date.now();
  return {
    enabled,
    finished: Boolean(progress.finishedAt) || remaining === 0,
    dismissed,
    steps,
    remaining,
    brand: { name: flags.companyName || flags.domain || 'this office', domain: flags.domain },
    inboundHost: inboundMailHost(flags.domain),
    carddavUsername: flags.carddavUsername,
    carddavConfigured: flags.carddavConfigured,
    resendConfigured: flags.resendConfigured,
    mapsConfigured: flags.mapsConfigured,
    companyAddress: flags.companyAddress,
  };
}

export async function completeClientSetupStep(id: string): Promise<ClientSetupState> {
  if (!isStepId(id)) return getClientSetupState();
  const progress = await getClientSetupProgress();
  const completed = uniqSteps([...progress.completed, id]);
  const skipped = progress.skipped.filter((step) => step !== id);
  const steps = buildClientSetupSteps(await contextFlags(), { ...progress, completed, skipped });
  const finishedAt = steps.every((step) => step.done) ? new Date().toISOString() : progress.finishedAt;
  await setClientSetupProgress({ ...progress, completed, skipped, finishedAt, dismissedUntil: null });
  return getClientSetupState();
}

export async function skipClientSetupStep(id: string): Promise<ClientSetupState> {
  if (!isStepId(id)) return getClientSetupState();
  const progress = await getClientSetupProgress();
  const skipped = uniqSteps([...progress.skipped, id]);
  await setClientSetupProgress({ ...progress, skipped, dismissedUntil: null });
  return getClientSetupState();
}

export async function dismissClientSetup(days = 3): Promise<ClientSetupState> {
  const progress = await getClientSetupProgress();
  const until = new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  await setClientSetupProgress({ ...progress, dismissedUntil: until });
  return getClientSetupState();
}

export async function finishClientSetup(): Promise<ClientSetupState> {
  const progress = await getClientSetupProgress();
  const flags = await contextFlags();
  const steps = buildClientSetupSteps(flags, progress);
  const completed = uniqSteps([...progress.completed, ...steps.map((step) => step.id)]);
  await setClientSetupProgress({
    ...progress,
    completed,
    skipped: [],
    dismissedUntil: null,
    finishedAt: new Date().toISOString(),
  });
  return getClientSetupState();
}

export async function reopenClientSetup(): Promise<ClientSetupState> {
  const progress = await getClientSetupProgress();
  await setClientSetupProgress({ ...progress, dismissedUntil: null, finishedAt: null });
  return getClientSetupState();
}
