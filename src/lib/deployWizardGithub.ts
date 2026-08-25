/**
 * Deploy-wizard GitHub provisioning for a client website repo.
 *
 * GitHub cannot create PATs via API. Apply creates eliteweblabs/{slug}-site
 * and a restricted GitHub App installed on that repo only. Never reuse this
 * host’s GITHUB_APP_* — on reave.app that App is for the reΛVe.app site, not the client.
 */
import {
  githubAddRepoToAppInstallation,
  githubEnsureRepo,
  githubRemoveRepoFromAppInstallation,
} from './githubClient';
import { githubAppCanWriteRepo } from './githubApp';
import { PROTECTED_APP_REPOS, defaultWebsiteRepoSlug } from './websiteEditorRepo';
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

  const credentials = opts.credentials;
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

  const tokenCreds = {
    appId: credentials.GITHUB_APP_ID,
    installationId: credentials.GITHUB_APP_INSTALLATION_ID,
    privateKey: credentials.GITHUB_APP_PRIVATE_KEY,
  };
  const siteRepo = ensured.data.repo;
  let canWrite = await githubAppCanWriteRepo(tokenCreds, siteRepo);
  if (!canWrite) {
    const attached = await githubAddRepoToAppInstallation({
      repo: siteRepo,
      installationId: credentials.GITHUB_APP_INSTALLATION_ID,
    });
    if (attached.ok) {
      canWrite = await githubAppCanWriteRepo(tokenCreds, siteRepo);
      if (canWrite) notes.push(`Added ${siteRepo} to the GitHub App installation`);
    }
  } else {
    notes.push(`GitHub App can write ${siteRepo}`);
  }
  if (!canWrite) {
    return {
      ok: false,
      error: `GitHub App cannot write ${siteRepo}. On the App install screen choose Only select repositories and pick ${siteRepo} — not eliteweblabs/reave.`,
    };
  }

  for (const protectedRepo of PROTECTED_APP_REPOS) {
    if (!(await githubAppCanWriteRepo(tokenCreds, protectedRepo))) continue;
    await githubRemoveRepoFromAppInstallation({
      repo: protectedRepo,
      installationId: credentials.GITHUB_APP_INSTALLATION_ID,
    });
    if (await githubAppCanWriteRepo(tokenCreds, protectedRepo)) {
      return {
        ok: false,
        error: `This GitHub App can still access ${protectedRepo}. Edit the installation: Only select repositories → ${siteRepo} only.`,
      };
    }
    notes.push(`Removed ${protectedRepo} from the GitHub App`);
  }

  return { ok: true, repo: siteRepo, created: ensured.data.created, notes, credentials };
}
