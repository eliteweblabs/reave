/**
 * Kinsta REST API v2 client for the admin agent.
 * @see https://kinsta.com/docs/kinsta-api/
 */
import { isNonProductionLabel } from './publicUrl';
import { serverEnv } from './serverEnv';

const KINSTA_API_BASE = serverEnv('KINSTA_API_BASE_URL')?.trim().replace(/\/+$/, '') || 'https://api.kinsta.com/v2';

export function isKinstaConfigured(): boolean {
  return Boolean(serverEnv('KINSTA_API_KEY')?.trim() && serverEnv('KINSTA_COMPANY_ID')?.trim());
}

function companyId(): string | null {
  return serverEnv('KINSTA_COMPANY_ID')?.trim() || null;
}

function isKinstaDryRun(): boolean {
  const dryRaw = serverEnv('KINSTA_DRY_RUN');
  return dryRaw === '1' || dryRaw === 'true';
}

export type KinstaEnvironmentSummary = {
  id: string;
  name: string;
  display_name: string;
  primary_domain: string | null;
  php_version: string | null;
};

export type KinstaSiteSummary = {
  id: string;
  name: string;
  display_name: string;
  status: string;
  environments: KinstaEnvironmentSummary[];
};

export type KinstaBackupSummary = {
  id: number;
  name: string;
  note: string | null;
  type: string;
  created_at: number;
};

export type KinstaCreateSiteInput = {
  display_name: string;
  region?: string;
  install_mode?: 'new' | 'clone';
  source_env_id?: string;
  admin_email?: string;
  admin_user?: string;
  admin_password?: string;
  site_title?: string;
  wp_language?: string;
  woocommerce?: boolean;
  wordpressseo?: boolean;
};

type KinstaApiEnvironment = {
  id?: string;
  name?: string;
  display_name?: string;
  primaryDomain?: { name?: string } | null;
  container_info?: { php_engine_version?: string } | null;
  environments?: KinstaApiEnvironment[];
};

type KinstaApiSite = {
  id?: string;
  name?: string;
  display_name?: string;
  status?: string;
  environments?: KinstaApiEnvironment[];
};

function mapEnvironment(env: KinstaApiEnvironment): KinstaEnvironmentSummary {
  return {
    id: String(env.id ?? ''),
    name: String(env.name ?? ''),
    display_name: String(env.display_name ?? env.name ?? ''),
    primary_domain: env.primaryDomain?.name?.trim() || null,
    php_version: env.container_info?.php_engine_version?.trim() || null,
  };
}

function mapSite(site: KinstaApiSite, includeEnvironments: boolean): KinstaSiteSummary {
  const environments = includeEnvironments
    ? (site.environments ?? []).map(mapEnvironment).filter((e) => e.id)
    : [];
  return {
    id: String(site.id ?? ''),
    name: String(site.name ?? ''),
    display_name: String(site.display_name ?? site.name ?? ''),
    status: String(site.status ?? 'unknown'),
    environments,
  };
}

export async function kinstaRequest<T>(opts: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | boolean | undefined>;
  body?: unknown;
}): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; error: string; status?: number; raw?: string }
> {
  const token = serverEnv('KINSTA_API_KEY')?.trim();
  if (!token) {
    return { ok: false, error: 'KINSTA_API_KEY is not set on this service' };
  }

  const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
  const url = new URL(`${KINSTA_API_BASE}${path}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, value === true ? 'true' : String(value));
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const raw = await res.text();
  let data: T | undefined;
  if (raw) {
    try {
      data = JSON.parse(raw) as T;
    } catch {
      return {
        ok: false,
        error: 'Invalid JSON from Kinsta',
        status: res.status,
        raw: raw.slice(0, 400),
      };
    }
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `HTTP ${res.status}`;
    return { ok: false, error: message, status: res.status, raw: raw.slice(0, 400) };
  }

  return { ok: true, status: res.status, data: data as T };
}

export async function kinstaListSites(opts?: {
  includeEnvironments?: boolean;
  company?: string;
}): Promise<
  | { ok: true; company_id: string; sites: KinstaSiteSummary[] }
  | { ok: false; error: string }
> {
  const cid = opts?.company?.trim() || companyId();
  if (!cid) {
    return { ok: false, error: 'KINSTA_COMPANY_ID is not set on this service' };
  }

  const includeEnvironments = opts?.includeEnvironments !== false;
  const result = await kinstaRequest<{ company?: { sites?: KinstaApiSite[] } }>({
    path: '/sites',
    query: {
      company: cid,
      include_environments: includeEnvironments ? 'true' : 'false',
    },
  });

  if (!result.ok) return { ok: false, error: result.error };

  const sites = (result.data.company?.sites ?? [])
    .map((site) => mapSite(site, includeEnvironments))
    .filter((site) => site.id);

  return { ok: true, company_id: cid, sites };
}

export async function kinstaGetSite(siteId: string): Promise<
  | { ok: true; site: KinstaSiteSummary }
  | { ok: false; error: string }
> {
  const id = siteId.trim();
  if (!id) return { ok: false, error: 'site_id is required' };

  const result = await kinstaRequest<{ site?: KinstaApiSite }>({
    path: `/sites/${encodeURIComponent(id)}`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const site = result.data.site;
  if (!site?.id) return { ok: false, error: 'Site not found in Kinsta response' };

  const envResult = await kinstaRequest<{ site?: { environments?: KinstaApiEnvironment[] } }>({
    path: `/sites/${encodeURIComponent(id)}/environments`,
  });
  const environments = envResult.ok
    ? (envResult.data.site?.environments ?? []).map(mapEnvironment).filter((e) => e.id)
    : [];

  return {
    ok: true,
    site: {
      ...mapSite(site, false),
      environments,
    },
  };
}

export async function kinstaClearCache(environmentId: string): Promise<
  | { ok: true; operation_id: string; dry_run?: boolean }
  | { ok: false; error: string }
> {
  const envId = environmentId.trim();
  if (!envId) return { ok: false, error: 'environment_id is required' };

  if (isKinstaDryRun()) {
    return { ok: true, operation_id: '(dry-run)', dry_run: true };
  }

  const result = await kinstaRequest<{ operation_id?: string }>({
    method: 'POST',
    path: '/sites/tools/clear-cache',
    body: { environment_id: envId },
  });
  if (!result.ok) return { ok: false, error: result.error };

  const operationId = result.data.operation_id?.trim();
  if (!operationId) return { ok: false, error: 'Kinsta did not return operation_id' };
  return { ok: true, operation_id: operationId };
}

export async function kinstaGetOperation(operationId: string): Promise<
  | { ok: true; status: string; data: unknown }
  | { ok: false; error: string }
> {
  const id = operationId.trim();
  if (!id) return { ok: false, error: 'operation_id is required' };
  if (id === '(dry-run)') {
    return { ok: true, status: 'has_completed', data: { dry_run: true } };
  }

  const result = await kinstaRequest<{ status?: string } & Record<string, unknown>>({
    path: `/operations/${encodeURIComponent(id)}`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    status: String(result.data.status ?? 'unknown'),
    data: result.data,
  };
}

export async function kinstaPing(): Promise<
  | { ok: true; company_id: string; site_count: number }
  | { ok: false; error: string }
> {
  const out = await kinstaListSites({ includeEnvironments: false });
  if (!out.ok) return { ok: false, error: out.error };
  return { ok: true, company_id: out.company_id, site_count: out.sites.length };
}

export async function kinstaDeleteSite(siteId: string): Promise<
  | { ok: true; operation_id: string; dry_run?: boolean }
  | { ok: false; error: string }
> {
  const id = siteId.trim();
  if (!id) return { ok: false, error: 'site_id is required' };

  if (isKinstaDryRun()) {
    return { ok: true, operation_id: '(dry-run)', dry_run: true };
  }

  const result = await kinstaRequest<{ operation_id?: string }>({
    method: 'DELETE',
    path: `/sites/${encodeURIComponent(id)}`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const operationId = result.data.operation_id?.trim();
  if (!operationId) return { ok: false, error: 'Kinsta did not return operation_id' };
  return { ok: true, operation_id: operationId };
}

export async function kinstaCreateSite(input: KinstaCreateSiteInput): Promise<
  | { ok: true; operation_id: string; dry_run?: boolean }
  | { ok: false; error: string }
> {
  const cid = companyId();
  if (!cid) return { ok: false, error: 'KINSTA_COMPANY_ID is not set on this service' };

  const displayName = input.display_name.trim();
  if (!displayName) return { ok: false, error: 'display_name is required' };

  const installMode = input.install_mode ?? 'new';
  if (installMode === 'clone') {
    const sourceEnvId = input.source_env_id?.trim();
    if (!sourceEnvId) return { ok: false, error: 'source_env_id is required when install_mode is clone' };
  } else {
    const adminEmail = input.admin_email?.trim();
    const adminUser = input.admin_user?.trim();
    const adminPassword = input.admin_password?.trim();
    if (!adminEmail || !adminUser || !adminPassword) {
      return {
        ok: false,
        error: 'admin_email, admin_user, and admin_password are required for install_mode new',
      };
    }
  }

  if (isKinstaDryRun()) {
    return { ok: true, operation_id: '(dry-run)', dry_run: true };
  }

  const body: Record<string, unknown> = {
    company: cid,
    display_name: displayName,
    install_mode: installMode,
    is_subdomain_multisite: false,
    is_multisite: false,
    wp_language: input.wp_language?.trim() || 'en_US',
  };

  if (installMode === 'clone') {
    body.source_env_id = input.source_env_id!.trim();
    if (input.region?.trim()) body.region = input.region.trim();
  } else {
    body.region = input.region?.trim() || 'us-central1';
    body.admin_email = input.admin_email!.trim();
    body.admin_user = input.admin_user!.trim();
    body.admin_password = input.admin_password!.trim();
    body.site_title = input.site_title?.trim() || displayName;
    body.woocommerce = input.woocommerce === true;
    body.wordpressseo = input.wordpressseo === true;
  }

  const result = await kinstaRequest<{ operation_id?: string }>({
    method: 'POST',
    path: '/sites',
    body,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const operationId = result.data.operation_id?.trim();
  if (!operationId) return { ok: false, error: 'Kinsta did not return operation_id' };
  return { ok: true, operation_id: operationId };
}

export async function kinstaCreateManualBackup(
  environmentId: string,
  tag?: string,
): Promise<
  | { ok: true; operation_id: string; dry_run?: boolean }
  | { ok: false; error: string }
> {
  const envId = environmentId.trim();
  if (!envId) return { ok: false, error: 'environment_id is required' };

  if (isKinstaDryRun()) {
    return { ok: true, operation_id: '(dry-run)', dry_run: true };
  }

  const body: Record<string, string> = {};
  const note = tag?.trim();
  if (note) body.tag = note;

  const result = await kinstaRequest<{ operation_id?: string }>({
    method: 'POST',
    path: `/sites/environments/${encodeURIComponent(envId)}/manual-backups`,
    body: Object.keys(body).length ? body : {},
  });
  if (!result.ok) return { ok: false, error: result.error };

  const operationId = result.data.operation_id?.trim();
  if (!operationId) return { ok: false, error: 'Kinsta did not return operation_id' };
  return { ok: true, operation_id: operationId };
}

export async function kinstaListBackups(environmentId: string): Promise<
  | { ok: true; environment_id: string; backups: KinstaBackupSummary[] }
  | { ok: false; error: string }
> {
  const envId = environmentId.trim();
  if (!envId) return { ok: false, error: 'environment_id is required' };

  const result = await kinstaRequest<{
    environment?: {
      display_name?: string;
      backups?: Array<{
        id?: number;
        name?: string;
        note?: string;
        type?: string;
        created_at?: number;
      }>;
    };
  }>({
    path: `/sites/environments/${encodeURIComponent(envId)}/backups`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const backups = (result.data.environment?.backups ?? [])
    .filter((b) => typeof b.id === 'number')
    .map((b) => ({
      id: b.id as number,
      name: String(b.name ?? ''),
      note: b.note?.trim() || null,
      type: String(b.type ?? 'unknown'),
      created_at: Number(b.created_at ?? 0),
    }));

  return { ok: true, environment_id: envId, backups };
}

export function formatKinstaSitesSummary(sites: KinstaSiteSummary[]): string {
  if (!sites.length) return 'No Kinsta WordPress sites found for this company.';
  const lines: string[] = [];
  for (const site of sites) {
    lines.push(`${site.display_name || site.name} (${site.status}) — site_id ${site.id}`);
    for (const env of site.environments) {
      const domain = env.primary_domain ? ` · ${env.primary_domain}` : '';
      const php = env.php_version ? ` · PHP ${env.php_version}` : '';
      lines.push(`  ${env.display_name || env.name}: env_id ${env.id}${domain}${php}`);
    }
  }
  return lines.join('\n');
}

function normalizeDomainKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/** Public site URLs from Kinsta primary domains (all environments). */
export async function kinstaCollectMonitorUrls(): Promise<
  | { ok: true; urls: Array<{ url: string; friendlyName: string }> }
  | { ok: false; error: string }
> {
  if (!isKinstaConfigured()) {
    return { ok: false, error: 'KINSTA_API_KEY or KINSTA_COMPANY_ID is not set' };
  }

  const listed = await kinstaListSites({ includeEnvironments: true });
  if (!listed.ok) return { ok: false, error: listed.error };

  const urls: Array<{ url: string; friendlyName: string }> = [];
  const seen = new Set<string>();

  for (const site of listed.sites) {
    const siteLabel = site.display_name || site.name;
    for (const env of site.environments) {
      const domain = env.primary_domain?.trim();
      if (!domain) continue;
      // Only monitor production environments — skip staging/dev.
      if (isNonProductionLabel(env.name) || isNonProductionLabel(env.display_name)) continue;
      const key = normalizeDomainKey(domain);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const envLabel = env.display_name || env.name;
      const friendlyName =
        envLabel && envLabel.toLowerCase() !== 'live' && envLabel.toLowerCase() !== siteLabel.toLowerCase()
          ? `${siteLabel} (${envLabel})`
          : siteLabel;
      urls.push({
        url: domain.startsWith('http') ? domain : `https://${domain}`,
        friendlyName,
      });
    }
  }

  return { ok: true, urls };
}
