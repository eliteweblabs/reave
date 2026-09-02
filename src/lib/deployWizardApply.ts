/**
 * Shared Apply executor — used by POST /api/deploy/wizard and the GitHub
 * App manifest callback after the owner confirms the restricted App.
 */
import {
  formatDeployWizardCli,
  isDeployWizardExtraId,
  isDeployWizardPublicHost,
  type DeployWizardExtraId,
  type DeployWizardPlan,
} from './deployWizardCatalog';
import { buildDeployWizardPlanResolved } from './deployWizardStaging';
import type { DeployWizardGithubAppApplyBody, DeployWizardGithubAppCredentials } from './deployWizardGithubApp';
import { applyDeployWizardDns } from './deployWizardDns';
import {
  applyDeployWizardPublicOrigin,
  provisionDeployWizardClientDomain,
} from './deployWizardStaging';
import { isDeployWizardNeedGithubApp, resolveDeployWizardApply } from './deployWizardResolve';
import { isCloudflareConfigured } from './cloudflareClient';
import { syncCalcomIdentityFromReave } from './calcomIdentitySync';
import { FEATURE_ID_SET, type FeatureId } from './featureCatalog';
import { railwaySetVariables } from './railwayAgentApi';
import { ensureDeployWizardStack } from './deployWizardProvision';

export type DeployWizardApplyProgress = (message: string) => void;

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
      projectId: string;
      projectName: string;
    };

export function isDeployWizardApplyNeedGithubApp(
  result: DeployWizardApplyResult,
): result is Extract<DeployWizardApplyResult, { needsGithubApp: true }> {
  return !result.ok && 'needsGithubApp' in result && result.needsGithubApp === true;
}

export async function planFromGithubAppApply(
  apply: DeployWizardGithubAppApplyBody,
): Promise<DeployWizardPlan> {
  const features = apply.features.filter((f): f is FeatureId => FEATURE_ID_SET.has(f));
  const extras = apply.extras.filter((e): e is DeployWizardExtraId => isDeployWizardExtraId(e));
  return buildDeployWizardPlanResolved({
    features,
    extras,
    appService: apply.appService,
    installSlug: apply.installSlug,
    siteDomain: apply.siteDomain,
    dnsAccess: apply.dnsAccess,
    namecomUsername: apply.namecomUsername,
    namecomToken: apply.namecomToken,
    godaddyToken: apply.godaddyToken,
    postAlias: apply.postAlias,
    companyName: apply.companyName,
    adminUsername: apply.adminUsername,
    ownerFirstName: apply.ownerFirstName,
    ownerLastName: apply.ownerLastName,
    ownerEmail: apply.ownerEmail,
    ownerPhone: apply.ownerPhone,
    timezone: apply.timezone,
    seed: apply.seed,
  });
}

export async function executeDeployWizardApply(opts: {
  plan: DeployWizardPlan;
  values: Record<string, string>;
  project: string;
  projectName?: string;
  environment: string;
  request: Request;
  githubApp?: DeployWizardGithubAppCredentials;
  namecomUsername?: string;
  namecomToken?: string;
  godaddyToken?: string;
  onProgress?: DeployWizardApplyProgress;
}): Promise<DeployWizardApplyResult> {
  const say = (message: string) => {
    opts.onProgress?.(message);
  };
  const cli = formatDeployWizardCli(opts.plan, opts.values);
  say('Standing up the Railway project and services…');
  const stack = await ensureDeployWizardStack({
    plan: opts.plan,
    project: opts.project,
    projectName: opts.projectName,
    environment: opts.environment,
    onProgress: say,
  });
  if (!stack.ok) {
    return { ok: false, error: stack.error, plan: opts.plan, cli };
  }
  const project = stack.projectId;

  say('Resolving variables and the website repo…');
  const resolved = await resolveDeployWizardApply(opts.plan, opts.values, {
    githubApp: opts.githubApp,
  });

  if (isDeployWizardNeedGithubApp(resolved)) {
    for (const note of resolved.notes) say(note);
    say('Next: confirm the restricted GitHub App in the browser (one step).');
    return {
      ok: false,
      needsGithubApp: true,
      plan: opts.plan,
      cli,
      notes: [...stack.notes, ...resolved.notes],
      projectId: project,
      projectName: stack.projectName,
    };
  }
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, plan: opts.plan, cli };
  }
  for (const note of resolved.notes) say(note);

  const applied: Array<{ service: string; updated: string[] }> = [];
  for (const [service, variables] of resolved.byService) {
    const names = Object.keys(variables);
    say(`Writing ${names.length} variable${names.length === 1 ? '' : 's'} on ${service === 'shared' ? 'shared' : service}…`);
    const result = await railwaySetVariables({
      project,
      environment: opts.environment,
      service: service === 'shared' ? undefined : service,
      variables,
      skip_deploys: true,
    });
    if (!result.ok) {
      return { ok: false, error: `${service}: ${result.error}`, plan: opts.plan, cli, applied };
    }
    applied.push({ service, updated: result.updated });
    say(`Saved ${result.updated.length} on ${service}.`);
  }

  if (opts.plan.features.includes('scheduling')) {
    say('Syncing Cal.com identity from company branding…');
  }
  const identity = opts.plan.features.includes('scheduling')
    ? await syncCalcomIdentityFromReave({
        force: true,
        request: opts.request,
        project,
      }).catch((e) => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }))
    : undefined;

  say('Applying DNS (Resend inbound and Cloudflare when configured)…');
  if (opts.plan.provisionOnApply) {
    const apex = opts.plan.plannedSiteDomain || opts.plan.siteDomain;
    say(`Provisioning ${apex} in Cloudflare before DNS…`);
    const provision = await provisionDeployWizardClientDomain({
      apex,
      dnsAccess: opts.plan.dnsAccess,
      namecomUsername: opts.namecomUsername,
      namecomToken: opts.namecomToken,
      godaddyToken: opts.godaddyToken,
      onProgress: say,
    });
    if (!provision.ok) {
      return { ok: false, error: provision.error, plan: opts.plan, cli, applied };
    }
  }
  const dns = await applyDeployWizardDns({
    plan: opts.plan,
    project,
    environment: opts.environment,
  }).catch((e) => ({
    ok: false,
    configured: isCloudflareConfigured(),
    rows: [],
    leftover: [e instanceof Error ? e.message : String(e)],
    summary: e instanceof Error ? e.message : String(e),
  }));
  if (dns.summary) say(dns.summary);

  if (opts.plan.siteDomain && isDeployWizardPublicHost(opts.plan.siteDomain)) {
    say(`Setting public URL to https://${opts.plan.siteDomain}…`);
    const origin = await applyDeployWizardPublicOrigin({
      project,
      environment: opts.environment,
      plan: opts.plan,
    });
    if (!origin.ok) {
      say(`Public URL: ${origin.error}`);
    } else if (origin.updated.length) {
      say(`Public URL updated (${origin.updated.join(', ')}).`);
    }
  }

  const provisioned = [...stack.notes, ...resolved.notes];
  say('Apply finished. Redeploy each service when you are ready.');
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
