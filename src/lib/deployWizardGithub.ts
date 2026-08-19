/**
 * Deploy-wizard GitHub provisioning for a client website repo.
 *
 * GitHub cannot create PATs via API. Apply creates eliteweblabs/{slug}-site
 * and a restricted GitHub App installed on that repo only. If this host
 * already has GITHUB_APP_* (from an earlier Apply), those are reused.
 */
import {
  githubAddRepoToAppInstallation,
  githubEnsureRepo,
  githubRemoveRepoFromAppInstallation,
} from './githubClient';
import { isGithubAppConfigured } from './githubApp';
import { PROTECTED_APP_REPOS, defaultWebsiteRepoSlug } from './websiteEditorRepo';
import { serverEnv } from './serverEnv';
import type { DeployWizardGithubAppCredentials } from './deployWizardGithubApp';

export type ProvisionClientWebsiteGitHubOk = {
  ok: true;
  repo: string;
  created: boolean;
  notes: string[];
  credentials: DeployWizardGithubAppCredentials;
};

export type ProvisionClientWebsiteGitHubNeedApp = {
  ok: false;
  needsGithubApp: true;
  repo: string;
  created: boolean;
  notes: string[];
};

export type ProvisionClientWebsiteGitHubFail = { ok: false; error: string };

export function isProvisionNeedGithubApp(
  result: ProvisionClientWebsiteGitHubOk | ProvisionClientWebsiteGitHubNeedApp | ProvisionClientWebsiteGitHubFail,
): result is ProvisionClientWebsiteGitHubNeedApp {
  return !result.ok && 'needsGithubApp' in result && result.needsGithubApp === true;
}

export async function provisionClientWebsiteGitHub(opts: {
  installSlug: string;
  credentials?: DeployWizardGithubAppCredentials;
}): Promise<ProvisionClientWebsiteGitHubOk | ProvisionClientWebsiteGitHubNeedApp | ProvisionClientWebsiteGitHubFail> {
  const repo = defaultWebsiteRepoSlug(opts.installSlug);
  const ensured = await githubEnsureRepo({
    repo,
    description: `Public website for ${opts.installSlug}`,
    private: true,
  });
  if (!ensured.ok) return { ok: false, error: `Website repo ${repo}: ${ensured.error}` };

  const notes = [
    ensured.data.created
      ? `Created website repo ${ensured.data.repo}`
      : `Reused website repo ${ensured.data.repo}`,
  ];

  const credentials = opts.credentials ?? hostGithubAppCredentials();
  if (!credentials) {
    return {
      ok: false,
      needsGithubApp: true,
      repo: ensured.data.repo,
      created: ensured.data.created,
      notes: [
        ...notes,
        'GitHub will create a restricted App for this repo (Contents write only)',
      ],
    };
  }

  const attached = await githubAddRepoToAppInstallation({
    repo: ensured.data.repo,
    installationId: credentials.GITHUB_APP_INSTALLATION_ID,
  });
  if (!attached.ok) {
    return {
      ok: false,
      error: `${ensured.data.created ? 'Created' : 'Found'} ${ensured.data.repo}, but could not add it to the GitHub App: ${attached.error}`,
    };
  }
  notes.push(`Added ${ensured.data.repo} to the GitHub App installation`);

  await Promise.all(
    PROTECTED_APP_REPOS.map((protectedRepo) =>
      githubRemoveRepoFromAppInstallation({
        repo: protectedRepo,
        installationId: credentials.GITHUB_APP_INSTALLATION_ID,
      }),
    ),
  );

  return { ok: true, repo: ensured.data.repo, created: ensured.data.created, notes, credentials };
}

function hostGithubAppCredentials(): DeployWizardGithubAppCredentials | null {
  if (!isGithubAppConfigured()) return null;
  const id = serverEnv('GITHUB_APP_ID')?.trim();
  const installation = serverEnv('GITHUB_APP_INSTALLATION_ID')?.trim();
  const pem = serverEnv('GITHUB_APP_PRIVATE_KEY')?.trim();
  if (!id || !installation || !pem) return null;
  return {
    GITHUB_APP_ID: id,
    GITHUB_APP_INSTALLATION_ID: installation,
    GITHUB_APP_PRIVATE_KEY: pem,
  };
}
