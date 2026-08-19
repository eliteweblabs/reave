/**
 * Shared Apply executor — used by POST /api/deploy/wizard and the GitHub
 * App manifest callback after the owner confirms the restricted App.
 */
import {
  buildDeployWizardPlan,
  formatDeployWizardCli,
  isDeployWizardExtraId,
  type DeployWizardExtraId,
  type DeployWizardPlan,
} from './deployWizardCatalog';
import type { DeployWizardGithubAppApplyBody, DeployWizardGithubAppCredentials } from './deployWizardGithubApp';
import { applyDeployWizardDns } from './deployWizardDns';
import { isDeployWizardNeedGithubApp, resolveDeployWizardApply } from './deployWizardResolve';
import { isCloudflareConfigured } from './cloudflareClient';
import { syncCalcomIdentityFromReave } from './calcomIdentitySync';
import { FEATURE_ID_SET, type FeatureId } from './featureCatalog';
import { railwaySetVariables } from './railwayAgentApi';

export type DeployWizardApplyResult =
  | {
      ok: true;
      plan: DeployWizardPlan;
      cli: string;
      applied: Array<{ service: string; updated: string[] }>;
      identity: unknown;
      dns: Awaited<ReturnType<typeof applyDeployWizardDns>>;
      provisioned: string[];
      hint: string;
    }
  | { ok: false; error: string; plan: DeployWizardPlan; cli: string; applied?: Array<{ service: string; updated: string[] }> }
  | {
      ok: false;
      needsGithubApp: true;
      plan: DeployWizardPlan;
      cli: string;
      notes: string[];
    };

export function isDeployWizardApplyNeedGithubApp(
  result: DeployWizardApplyResult,
): result is Extract<DeployWizardApplyResult, { needsGithubApp: true }> {
  return !result.ok && 'needsGithubApp' in result && result.needsGithubApp === true;
}

export function planFromGithubAppApply(apply: DeployWizardGithubAppApplyBody): DeployWizardPlan {
  const features = apply.features.filter((f): f is FeatureId => FEATURE_ID_SET.has(f));
  const extras = apply.extras.filter((e): e is DeployWizardExtraId => isDeployWizardExtraId(e));
  return buildDeployWizardPlan({
    features,
    extras,
    appService: apply.appService,
    installSlug: apply.installSlug,
    siteDomain: apply.siteDomain,
    postAlias: apply.postAlias,
    companyName: apply.companyName,
    adminUsername: apply.adminUsername,
    timezone: apply.timezone,
  });
}

export async function executeDeployWizardApply(opts: {
  plan: DeployWizardPlan;
  values: Record<string, string>;
  project: string;
  environment: string;
  request: Request;
  githubApp?: DeployWizardGithubAppCredentials;
}): Promise<DeployWizardApplyResult> {
  const cli = formatDeployWizardCli(opts.plan, opts.values);
  const resolved = await resolveDeployWizardApply(opts.plan, opts.values, {
    githubApp: opts.githubApp,
  });

  if (isDeployWizardNeedGithubApp(resolved)) {
    return {
      ok: false,
      needsGithubApp: true,
      plan: opts.plan,
      cli,
      notes: resolved.notes,
    };
  }
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, plan: opts.plan, cli };
  }

  const applied: Array<{ service: string; updated: string[] }> = [];
  for (const [service, variables] of resolved.byService) {
    const result = await railwaySetVariables({
      project: opts.project,
      environment: opts.environment,
      service: service === 'shared' ? undefined : service,
      variables,
      skip_deploys: true,
    });
    if (!result.ok) {
      return { ok: false, error: `${service}: ${result.error}`, plan: opts.plan, cli, applied };
    }
    applied.push({ service, updated: result.updated });
  }

  const identity = opts.plan.features.includes('scheduling')
    ? await syncCalcomIdentityFromReave({
        force: true,
        request: opts.request,
        project: opts.project,
      }).catch((e) => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }))
    : undefined;

  const dns = await applyDeployWizardDns({
    plan: opts.plan,
    project: opts.project,
    environment: opts.environment,
  }).catch((e) => ({
    ok: false,
    configured: isCloudflareConfigured(),
    rows: [],
    leftover: [e instanceof Error ? e.message : String(e)],
    summary: e instanceof Error ? e.message : String(e),
  }));

  const provisioned = resolved.notes;
  return {
    ok: true,
    plan: opts.plan,
    cli,
    applied,
    identity,
    dns,
    provisioned,
    hint: [provisioned.join(' '), dns.summary || 'Variables saved without an automatic redeploy. Redeploy each service when you are ready.']
      .filter(Boolean)
      .join(' '),
  };
}
