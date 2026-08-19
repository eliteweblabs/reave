/**
 * Deploy-wizard GitHub App provisioning for a client website repo.
 *
 * GitHub cannot create PATs via API. Apply creates eliteweblabs/{slug}-site,
 * adds it to the host GitHub App installation, and the catalog copies App
 * credentials onto the new install so write_github_file can mint tokens.
 */
import { githubAddRepoToAppInstallation, githubEnsureRepo } from './githubClient';
import { isGithubAppConfigured } from './githubApp';
import { defaultWebsiteRepoSlug } from './websiteEditorRepo';

export async function provisionClientWebsiteGitHub(opts: {
  installSlug: string;
}): Promise<{ ok: true; repo: string; created: boolean; notes: string[] } | { ok: false; error: string }> {
  if (!isGithubAppConfigured()) {
    return {
      ok: false,
      error:
        'GitHub cannot create PATs via API. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID on this host (a GitHub App installed on eliteweblabs, selected repos only — not eliteweblabs/reave). Apply will then create the website repo and copy the App onto the client.',
    };
  }

  const repo = defaultWebsiteRepoSlug(opts.installSlug);
  const ensured = await githubEnsureRepo({
    repo,
    description: `Public website for ${opts.installSlug}`,
    private: true,
  });
  if (!ensured.ok) return { ok: false, error: `Website repo ${repo}: ${ensured.error}` };

  const attached = await githubAddRepoToAppInstallation({ repo: ensured.data.repo });
  if (!attached.ok) {
    return {
      ok: false,
      error: `${ensured.data.created ? 'Created' : 'Found'} ${ensured.data.repo}, but could not add it to the GitHub App: ${attached.error}`,
    };
  }

  const notes = [
    ensured.data.created
      ? `Created website repo ${ensured.data.repo}`
      : `Reused website repo ${ensured.data.repo}`,
    `Added ${ensured.data.repo} to the GitHub App installation`,
  ];
  return { ok: true, repo: ensured.data.repo, created: ensured.data.created, notes };
}
