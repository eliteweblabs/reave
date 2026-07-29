/**
 * Demo mode — sales/testing installs on Railway with seeded dashboard data.
 *
 * Activated when DEMO_MODE=1 or INSTALL_CONFIG=demo (or domain slug resolves to demo).
 * The demo plugin exposes agent tools and /api/admin/demo for seeding + status.
 */
import pg from 'pg';
import { installConfigSlug } from './installConfig';
import { getStoredCompanyConfig } from './companyConfigStore';
import { isContactApiConfigured } from './contactApi';
import { serverEnv } from './serverEnv';

const { Pool } = pg;

export type DemoSetupCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type DemoSetupStatus = {
  demoMode: boolean;
  installSlug: string;
  readyToSeed: boolean;
  seeded: boolean;
  checks: DemoSetupCheck[];
  counts: {
    demoJobs: number;
    demoChats: number;
    demoTodos: number;
  };
  companyName: string | null;
};

function poolSsl(url: string): pg.ConnectionConfig['ssl'] {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

/** Whether this deployment is a demo/testing install. */
export function isDemoMode(): boolean {
  const flag = serverEnv('DEMO_MODE')?.trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  const install = serverEnv('INSTALL_CONFIG')?.trim().toLowerCase();
  if (install === 'demo') return true;
  return installConfigSlug() === 'demo';
}

function envSet(name: string): boolean {
  return Boolean(serverEnv(name)?.trim());
}

/** Prerequisites for running scripts/seed-demo.ts from this service. */
export function demoSeedPrerequisites(): DemoSetupCheck[] {
  const checks: DemoSetupCheck[] = [
    {
      id: 'database',
      label: 'DATABASE_URL',
      ok: envSet('DATABASE_URL'),
    },
    {
      id: 'contact_api',
      label: 'CONTACT_API_BASE_URL',
      ok: isContactApiConfigured(),
      detail: isContactApiConfigured() ? undefined : 'Deploy contact-api or set CONTACT_API_BASE_URL',
    },
    {
      id: 'contact_api_key',
      label: 'CONTACT_API_KEY',
      ok: envSet('CONTACT_API_KEY'),
    },
    {
      id: 'agent_user',
      label: 'AGENT_ALERT_USER_ID (Clerk user id for demo chats)',
      ok: envSet('AGENT_ALERT_USER_ID'),
      detail: envSet('AGENT_ALERT_USER_ID')
        ? undefined
        : 'Sign in once, copy your Clerk user id from admin profile',
    },
    {
      id: 'real_contact',
      label: 'DEMO_REAL_CONTACT_EMAIL (live client-portal demo contact)',
      ok: envSet('DEMO_REAL_CONTACT_EMAIL'),
      detail: envSet('DEMO_REAL_CONTACT_EMAIL')
        ? undefined
        : 'Your email — kept when re-seeding so you can demo the client portal on your phone',
    },
  ];
  return checks;
}

export function isDemoSeedReady(): boolean {
  return demoSeedPrerequisites().every((c) => c.ok);
}

async function demoCounts(): Promise<{ demoJobs: number; demoChats: number; demoTodos: number }> {
  const url = serverEnv('DATABASE_URL')?.trim();
  if (!url) return { demoJobs: 0, demoChats: 0, demoTodos: 0 };

  const pool = new Pool({ connectionString: url, ssl: poolSsl(url), max: 2 });
  try {
    const [jobs, chats, todos] = await Promise.all([
      pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM jobs WHERE source = 'demo'`),
      pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM chat_threads WHERE title LIKE '[Demo]%' OR title LIKE '%[demo-seed]%'`,
      ),
      pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM todos WHERE title LIKE '[Demo]%' OR notes LIKE '%[demo-seed]%'`,
      ),
    ]);
    return {
      demoJobs: Number(jobs.rows[0]?.n ?? 0),
      demoChats: Number(chats.rows[0]?.n ?? 0),
      demoTodos: Number(todos.rows[0]?.n ?? 0),
    };
  } catch {
    return { demoJobs: 0, demoChats: 0, demoTodos: 0 };
  } finally {
    await pool.end();
  }
}

/** Full demo setup snapshot for admin UI and agent tools. */
export async function getDemoSetupStatus(): Promise<DemoSetupStatus> {
  const checks = demoSeedPrerequisites();
  const counts = await demoCounts();
  const company = await getStoredCompanyConfig();
  const seeded = counts.demoJobs >= 3 || counts.demoChats >= 1;

  return {
    demoMode: isDemoMode(),
    installSlug: installConfigSlug(),
    readyToSeed: checks.every((c) => c.ok),
    seeded,
    checks,
    counts,
    companyName: company?.name?.trim() || null,
  };
}
