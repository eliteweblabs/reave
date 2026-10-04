/**
 * GET /api/admin/agent-tools — tool manifest this install sends to the admin agent.
 */
import type { APIContext } from 'astro';
import { agentToolManifestSummary } from '../../../lib/agentTools';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { enabledFeatures, ensureFeatureOverridesLoaded, hasWebsiteEditor } from '../../../lib/features';
import { isGithubConfigured } from '../../../lib/githubClient';
import { getInstallConfigSync } from '../../../lib/installConfig';
import { githubWebsiteRepoSlug } from '../../../lib/websiteEditorRepo';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  await ensureFeatureOverridesLoaded();

  const manifest = agentToolManifestSummary();
  const features = [...enabledFeatures()].sort();

  return jsonResponse({
    ok: true,
    manifest,
    website_editor: hasWebsiteEditor(),
    website_repo: githubWebsiteRepoSlug() || getInstallConfigSync().websiteRepo || null,
    github_configured: isGithubConfigured(),
    enabled_features: features,
  });
}
