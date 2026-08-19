/**
 * Per-install front-end website repo for the Agentic Website Editor.
 *
 * Client installs edit a dedicated repo in the agency GitHub account. They
 * cannot write to the REΛVE app repo (eliteweblabs/reave) or any other repo.
 * Official / ops installs keep the existing app + sibling-repo tools.
 */
import { normalizeRepoSlug, type GithubResult } from './githubClient';
import { getInstallConfigSync, isOpsInstall } from './installConfig';
import { serverEnv } from './serverEnv';

function appRepoSlug(): string {
  const explicit = serverEnv('GITHUB_REPO')?.trim();
  if (explicit) return normalizeRepoSlug(explicit) ?? explicit;
  const owner = serverEnv('RAILWAY_GIT_REPO_OWNER')?.trim();
  const name = serverEnv('RAILWAY_GIT_REPO_NAME')?.trim();
  if (owner && name) return `${owner}/${name}`;
  return '';
}

export const GITHUB_WEBSITE_OWNER = 'eliteweblabs';

/** Repos a client install must never edit — the REΛVE app itself. */
export const PROTECTED_APP_REPOS = ['eliteweblabs/reave'] as const;

export function defaultWebsiteRepoSlug(installSlug: string): string {
  const slug = installSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'site';
  return `${GITHUB_WEBSITE_OWNER}/${slug}-site`;
}

export function isProtectedAppRepo(repo: string): boolean {
  const slug = normalizeRepoSlug(repo)?.toLowerCase();
  if (!slug) return false;
  return PROTECTED_APP_REPOS.includes(slug as (typeof PROTECTED_APP_REPOS)[number]);
}

/** owner/repo for this install’s public website, or empty when unset. */
export function githubWebsiteRepoSlug(): string {
  const env = serverEnv('GITHUB_WEBSITE_REPO')?.trim();
  if (env) return normalizeRepoSlug(env) ?? env;
  const fromConfig = getInstallConfigSync().websiteRepo?.trim();
  if (fromConfig) return normalizeRepoSlug(fromConfig) ?? fromConfig;
  if (isOpsInstall()) return appRepoSlug();
  return '';
}

export function lockedWebsiteEditorRepo(opts: {
  opsInstall: boolean;
  websiteRepo: string;
  requested?: string;
}): GithubResult<string> {
  const requested = opts.requested?.trim() ? normalizeRepoSlug(opts.requested) : null;

  if (opts.opsInstall) {
    if (requested) return { ok: true, data: requested };
    const website = opts.websiteRepo.trim();
    if (website) return { ok: true, data: normalizeRepoSlug(website) ?? website };
    return { ok: false, error: 'invalid repo (expected owner/name)' };
  }

  const site = opts.websiteRepo.trim() ? normalizeRepoSlug(opts.websiteRepo) : null;
  if (!site) {
    return {
      ok: false,
      error:
        'Website repo is not configured. Set websiteRepo in this install’s config or GITHUB_WEBSITE_REPO to the front-end repo (not eliteweblabs/reave).',
    };
  }
  if (isProtectedAppRepo(site)) {
    return {
      ok: false,
      error:
        'websiteRepo cannot be the REΛVE app. Point it at this install’s dedicated front-end repo.',
    };
  }
  if (requested && requested.toLowerCase() !== site.toLowerCase()) {
    return {
      ok: false,
      error: `This install can only edit ${site}. The REΛVE app and other repos are not writable from here.`,
    };
  }
  return { ok: true, data: site };
}

/** Resolve the repo a website-editor tool may touch this turn. */
export function resolveWebsiteEditorRepo(requested?: string): GithubResult<string> {
  return lockedWebsiteEditorRepo({
    opsInstall: isOpsInstall(),
    websiteRepo: githubWebsiteRepoSlug(),
    requested,
  });
}
