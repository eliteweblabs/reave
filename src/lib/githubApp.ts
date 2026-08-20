/**
 * GitHub App installation tokens — the automatic stand-in for a fine-grained PAT.
 *
 * GitHub has no API to create PATs. Deploy-wizard Apply creates a restricted
 * App for eliteweblabs/{slug}-site. The client mints a 1-hour token scoped to
 * that website repo. Do not reuse this host’s GITHUB_APP_* for a new client.
 */
import { createSign } from 'node:crypto';
import { serverEnv } from './serverEnv';

const GITHUB_API = 'https://api.github.com';

export function normalizeGithubAppPrivateKey(raw: string): string {
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '\n');
}

export function isGithubAppConfigured(): boolean {
  return Boolean(
    serverEnv('GITHUB_APP_ID')?.trim() &&
      serverEnv('GITHUB_APP_INSTALLATION_ID')?.trim() &&
      serverEnv('GITHUB_APP_PRIVATE_KEY')?.trim(),
  );
}

export function githubAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(data);
  const sig = sign.sign(normalizeGithubAppPrivateKey(privateKeyPem), 'base64url');
  return `${data}.${sig}`;
}

type CachedToken = { token: string; expiresAt: number; repos: string };

const cache = new Map<string, CachedToken>();

function websiteRepoName(): string | undefined {
  const raw = serverEnv('GITHUB_WEBSITE_REPO')?.trim() || '';
  const slug = raw
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  const name = slug.split('/')[1]?.trim();
  return name || undefined;
}

export async function githubAppInstallationToken(opts?: {
  repositories?: string[];
  credentials?: { appId: string; installationId: string; privateKey: string };
  skipCache?: boolean;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const appId = opts?.credentials?.appId?.trim() || serverEnv('GITHUB_APP_ID')?.trim();
  const installationId =
    opts?.credentials?.installationId?.trim() || serverEnv('GITHUB_APP_INSTALLATION_ID')?.trim();
  const pem = opts?.credentials?.privateKey?.trim() || serverEnv('GITHUB_APP_PRIVATE_KEY')?.trim();
  if (!appId || !installationId || !pem) {
    return { ok: false, error: 'GitHub App is not configured (GITHUB_APP_ID / INSTALLATION_ID / PRIVATE_KEY)' };
  }

  const repositories =
    opts?.repositories !== undefined
      ? opts.repositories.filter(Boolean)
      : opts?.credentials
        ? []
        : websiteRepoName()
          ? [websiteRepoName()!]
          : [];
  const cacheKey = `${appId}:${installationId}:${repositories.slice().sort().join(',')}`;
  if (!opts?.skipCache) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt - 60_000 > Date.now()) {
      return { ok: true, token: hit.token };
    }
  }

  const jwt = githubAppJwt(appId, pem);
  const body: Record<string, unknown> = {
    permissions: { contents: 'write', metadata: 'read' },
  };
  if (repositories.length) body.repositories = repositories;

  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'reave-admin-agent',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text().catch(() => '');
  let parsed: { token?: string; expires_at?: string; message?: string } = {};
  try {
    parsed = text ? (JSON.parse(text) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok || !parsed.token) {
    return {
      ok: false,
      error: parsed.message || `GitHub App token failed (HTTP ${res.status})`,
    };
  }

  const expiresAt = parsed.expires_at ? Date.parse(parsed.expires_at) : Date.now() + 50 * 60_000;
  cache.set(cacheKey, { token: parsed.token, expiresAt, repos: cacheKey });
  return { ok: true, token: parsed.token };
}

export type GithubAppTokenCredentials = {
  appId: string;
  installationId: string;
  privateKey: string;
};

/** True when this App installation can mint a contents-write token for owner/repo. */
export async function githubAppCanWriteRepo(
  credentials: GithubAppTokenCredentials,
  repo: string,
): Promise<boolean> {
  const name = repo.trim().split('/')[1]?.trim();
  if (!name) return false;
  const minted = await githubAppInstallationToken({
    credentials,
    repositories: [name],
    skipCache: true,
  });
  return minted.ok;
}

/** Test helper. */
export function _clearGithubAppTokenCache(): void {
  cache.clear();
}
