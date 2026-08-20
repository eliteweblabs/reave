/**
 * Per-install GitHub App created during deploy-wizard Apply.
 *
 * GitHub cannot mint PATs. The only creation API is the App manifest flow
 * (one browser confirmation, then one install confirmation). Apply creates
 * eliteweblabs/{slug}-site, then this module registers an App whose
 * installation is that repo only.
 */
import { randomBytes } from 'node:crypto';
import type { DeployWizardSeedInput } from './deployWizardCatalog';
import { GITHUB_WEBSITE_OWNER, defaultWebsiteRepoSlug } from './websiteEditorRepo';

const GITHUB_API = 'https://api.github.com';
const PENDING_TTL_MS = 60 * 60 * 1000;
const CANONICAL_ORIGIN = 'https://reave.app';

function isPublicHttpOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return false;
    if (host.startsWith('127.') || host.endsWith('.internal')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Public https origin for GitHub App callback URLs. Never localhost / Railway SSR. */
export function publicGithubAppOrigin(raw: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!isPublicHttpOrigin(trimmed)) return CANONICAL_ORIGIN;
  const parsed = new URL(trimmed);
  parsed.protocol = 'https:';
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.origin;
}

export const DEPLOY_WIZARD_GITHUB_APP_COOKIE = 'dw_gh_app';

export type DeployWizardGithubAppCredentials = {
  GITHUB_APP_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
};

export type DeployWizardGithubAppApplyBody = {
  features: string[];
  extras: string[];
  appService?: string;
  installSlug: string;
  siteDomain?: string;
  postAlias?: string;
  companyName?: string;
  adminUsername?: string;
  timezone?: string;
  seed?: Partial<DeployWizardSeedInput>;
  project: string;
  projectName?: string;
  environment: string;
  values: Record<string, string>;
};

export type DeployWizardGithubAppPending = {
  createdAt: number;
  apply: DeployWizardGithubAppApplyBody;
  repo: string;
  origin: string;
  appId?: string;
  appSlug?: string;
  privateKey?: string;
  installationId?: string;
};

export type DeployWizardGithubAppManifestStart = {
  state: string;
  org: string;
  actionUrl: string;
  manifest: Record<string, unknown>;
  repo: string;
};

const pending = new Map<string, DeployWizardGithubAppPending>();

function prunePending(now = Date.now()): void {
  for (const [id, row] of pending) {
    if (row.createdAt + PENDING_TTL_MS < now) pending.delete(id);
  }
}

export function githubAppManifestName(installSlug: string): string {
  const slug = installSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'site';
  return `reave-${slug}`.slice(0, 34);
}

export function buildGithubAppManifest(opts: {
  installSlug: string;
  origin: string;
  siteDomain?: string;
  state: string;
}): Record<string, unknown> {
  const repo = defaultWebsiteRepoSlug(opts.installSlug);
  const origin = publicGithubAppOrigin(opts.origin);
  const callback = `${origin}/api/deploy/wizard/github-app`;
  const homepage = opts.siteDomain
    ? `https://${opts.siteDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`
    : origin;
  return {
    name: githubAppManifestName(opts.installSlug),
    url: homepage,
    hook_attributes: { url: `${origin}/api/deploy/wizard/github-app/hook`, active: false },
    redirect_url: callback,
    setup_url: callback,
    callback_urls: [callback],
    description: `REΛVE website editor for ${repo}. Contents write on that repo only — never eliteweblabs/reave.`,
    public: false,
    default_permissions: { contents: 'write', metadata: 'read' },
    default_events: [],
  };
}

export function createGithubAppPending(
  apply: DeployWizardGithubAppApplyBody,
  origin: string,
): DeployWizardGithubAppManifestStart {
  prunePending();
  const state = randomBytes(16).toString('hex');
  const repo = defaultWebsiteRepoSlug(apply.installSlug);
  const publicOrigin = publicGithubAppOrigin(origin);
  pending.set(state, {
    createdAt: Date.now(),
    apply,
    repo,
    origin: publicOrigin,
  });
  return {
    state,
    org: GITHUB_WEBSITE_OWNER,
    actionUrl: `https://github.com/organizations/${encodeURIComponent(GITHUB_WEBSITE_OWNER)}/settings/apps/new?state=${encodeURIComponent(state)}`,
    manifest: buildGithubAppManifest({
      installSlug: apply.installSlug,
      origin: publicOrigin,
      siteDomain: apply.siteDomain,
      state,
    }),
    repo,
  };
}

export function getGithubAppPending(state: string | undefined): DeployWizardGithubAppPending | null {
  if (!state?.trim()) return null;
  prunePending();
  return pending.get(state.trim()) ?? null;
}

export function saveGithubAppPending(state: string, next: DeployWizardGithubAppPending): void {
  pending.set(state, { ...next, createdAt: next.createdAt || Date.now() });
}

export function deleteGithubAppPending(state: string): void {
  pending.delete(state);
}

export function githubAppInstallUrl(appSlug: string, opts?: { targetId?: number }): string {
  const slug = encodeURIComponent(appSlug);
  if (opts?.targetId) {
    return `https://github.com/apps/${slug}/installations/new/permissions?target_id=${opts.targetId}`;
  }
  return `https://github.com/apps/${slug}/installations/new`;
}

export async function convertGithubAppManifest(code: string): Promise<
  | { ok: true; appId: string; appSlug: string; privateKey: string }
  | { ok: false; error: string }
> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'reave-admin-agent',
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text().catch(() => '');
  let parsed: { id?: number; slug?: string; pem?: string; message?: string } = {};
  try {
    parsed = text ? (JSON.parse(text) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok || !parsed.id || !parsed.pem) {
    return {
      ok: false,
      error: parsed.message || `GitHub App manifest conversion failed (HTTP ${res.status})`,
    };
  }

  return {
    ok: true,
    appId: String(parsed.id),
    appSlug: parsed.slug || '',
    privateKey: parsed.pem,
  };
}

export function pendingToCredentials(
  row: DeployWizardGithubAppPending | null | undefined,
): DeployWizardGithubAppCredentials | null {
  if (!row?.appId || !row.privateKey || !row.installationId) return null;
  return {
    GITHUB_APP_ID: row.appId,
    GITHUB_APP_INSTALLATION_ID: row.installationId,
    GITHUB_APP_PRIVATE_KEY: row.privateKey,
  };
}

export function githubAppCookieHeader(state: string, secure = true): string {
  return `${DEPLOY_WIZARD_GITHUB_APP_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure ? '; Secure' : ''}`;
}

export function clearGithubAppCookieHeader(): string {
  return `${DEPLOY_WIZARD_GITHUB_APP_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readGithubAppCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return '';
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [name, ...rest] = part.trim().split('=');
    if (name === DEPLOY_WIZARD_GITHUB_APP_COOKIE) {
      return decodeURIComponent(rest.join('=') || '');
    }
  }
  return '';
}

/** Test helper. */
export function _clearGithubAppPending(): void {
  pending.clear();
}
