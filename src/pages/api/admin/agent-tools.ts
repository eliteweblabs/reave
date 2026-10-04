/**
 * GET /api/admin/agent-tools — tool manifest this install sends to the admin agent.
 */
import type { APIContext } from 'astro';
import { agentToolManifestSummary } from '../../../lib/agentTools';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { enabledFeatures, ensureFeatureOverridesLoaded, hasWebsiteEditor } from '../../../lib/features';
import { isGithubConfigured } from '../../../lib/githubClient';
import { getInstallConfigSync, installConfigSlug, isOpsInstall } from '../../../lib/installConfig';
import { githubWebsiteRepoSlug, hasWebsiteGithubAgentTools } from '../../../lib/websiteEditorRepo';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  await ensureFeatureOverridesLoaded();

  const manifest = agentToolManifestSummary();
  const features = [...enabledFeatures()].sort();

  const deployCommit =
    serverEnv('RAILWAY_GIT_COMMIT_SHA')?.trim() || serverEnv('GIT_COMMIT_SHA')?.trim() || null;

  return jsonResponse({
    ok: true,
    manifest,
    install_slug: installConfigSlug(),
    is_ops_install: isOpsInstall(),
    website_github_tools: hasWebsiteGithubAgentTools(),
    website_editor: hasWebsiteEditor(),
    website_repo: githubWebsiteRepoSlug() || getInstallConfigSync().websiteRepo || null,
    github_configured: isGithubConfigured(),
    enabled_features: features,
    deploy_commit: deployCommit,
    note:
      'Capco site edits from rekko.studio: call write_github_file with repo "eliteweblabs/capco". Client capcofire.com admin omits repo (locked to websiteRepo).',
  });
}
