/**
 * Fill every deploy-wizard value that can be copied, derived, rolled, or
 * provisioned — nothing is typed on the Variables step.
 */
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
import {
  DEPLOY_WIZARD_GITHUB_APP_VARS,
  deployWizardInboundWebhookUrl,
  type DeployWizardPlan,
  type DeployWizardPlanVariable,
} from './deployWizardCatalog';
import { isProvisionNeedGithubApp, provisionClientWebsiteGitHub } from './deployWizardGithub';
import type { DeployWizardGithubAppCredentials } from './deployWizardGithubApp';
import { resendEnsureInboundWebhook } from './resendDnsSync';
import { serverEnv } from './serverEnv';

export function generateDeployWizardSecret(name: string): string {
  if (name === 'NEXTAUTH_SECRET') {
    return randomBytes(32).toString('base64');
  }
  if (name === 'CALENDSO_ENCRYPTION_KEY' || name === 'CALENDAR_ENCRYPTION_KEY') {
    // AES-256 needs exactly 32 chars. base64(32 bytes) is 44 and crashes Cal.com.
    return randomBytes(24).toString('base64');
  }
  return randomBytes(24).toString('hex');
}

export type DeployWizardApplyNotes = string[];

export type DeployWizardResolveNeedGithubApp = {
  ok: false;
  needsGithubApp: true;
  repo: string;
  notes: DeployWizardApplyNotes;
};

export function isDeployWizardNeedGithubApp(
  result: { ok: true } | { ok: false; error: string } | DeployWizardResolveNeedGithubApp,
): result is DeployWizardResolveNeedGithubApp {
  return !result.ok && 'needsGithubApp' in result && result.needsGithubApp === true;
}

export async function resolveDeployWizardApply(
  plan: DeployWizardPlan,
  values: Record<string, string>,
  opts?: { githubApp?: DeployWizardGithubAppCredentials },
): Promise<
  | { ok: true; byService: Map<string, Record<string, string>>; notes: DeployWizardApplyNotes }
  | { ok: false; error: string }
  | DeployWizardResolveNeedGithubApp
> {
  const notes: DeployWizardApplyNotes = [];
  const byService = new Map<string, Record<string, string>>();

  const needsVapid = plan.variables.some(
    (variable) => variable.name === 'VAPID_PUBLIC_KEY' || variable.name === 'VAPID_PRIVATE_KEY',
  );
  const vapid = needsVapid ? webpush.generateVAPIDKeys() : null;

  let webhookSecret = '';
  const needsWebhook = plan.variables.some((variable) => variable.provisionedOnApply && variable.name === 'RESEND_WEBHOOK_SECRET');
  if (needsWebhook) {
    const endpoint = deployWizardInboundWebhookUrl(plan.siteDomain);
    if (!endpoint) {
      return { ok: false, error: 'Enter a site domain so Apply can create the Resend inbound webhook.' };
    }
    const hook = await resendEnsureInboundWebhook(endpoint);
    if (!hook.ok) return { ok: false, error: `Resend webhook: ${hook.error}` };
    webhookSecret = hook.signingSecret;
    notes.push(hook.created ? `Created Resend inbound webhook ${endpoint}` : `Reused Resend inbound webhook ${endpoint}`);
  }

  let githubApp = opts?.githubApp;
  const needsWebsiteRepo = plan.features.includes('website') || plan.features.includes('content_management');
  if (needsWebsiteRepo) {
    const site = await provisionClientWebsiteGitHub({
      installSlug: plan.installSlug,
      credentials: githubApp,
    });
    if (isProvisionNeedGithubApp(site)) {
      notes.push(...site.notes);
      return { ok: false, needsGithubApp: true, repo: site.repo, notes };
    }
    if (!site.ok) {
      return { ok: false, error: site.error };
    }
    githubApp = site.credentials;
    notes.push(...site.notes);
  }

  for (const variable of plan.variables) {
    const value = resolveOne(variable, values, { vapid, webhookSecret, githubApp });
    if (!value) {
      if (variable.required && variable.kind === 'secret') {
        return {
          ok: false,
          error: variable.inheritFromHost
            ? `${variable.name} is not set on this host`
            : `Missing value for ${variable.service}.${variable.name}`,
        };
      }
      continue;
    }
    const bucket = byService.get(variable.service) ?? {};
    bucket[variable.name] = value;
    byService.set(variable.service, bucket);
  }

  const anthropicVar = plan.variables.find((variable) => variable.name === 'ANTHROPIC_API_KEY');
  if (anthropicVar) {
    const bucket = byService.get(anthropicVar.service);
    if (bucket?.ANTHROPIC_API_KEY) {
      const typed = (values[`${anthropicVar.service}:ANTHROPIC_API_KEY`] ?? '').trim();
      const source = anthropicKeySourceForApply(typed, serverEnv('ANTHROPIC_API_KEY') || '');
      if (source) bucket.ANTHROPIC_KEY_SOURCE = source;
    }
  }

  return { ok: true, byService, notes };
}

/** Typed client key wins; otherwise the copied REΛVE host key. */
export function anthropicKeySourceForApply(typedValue: string, inheritedValue: string): 'client' | 'reave' | '' {
  if (typedValue.trim()) return 'client';
  if (inheritedValue.trim()) return 'reave';
  return '';
}

function resolveOne(
  variable: DeployWizardPlanVariable,
  values: Record<string, string>,
  extras: {
    vapid: { publicKey: string; privateKey: string } | null;
    webhookSecret: string;
    githubApp?: DeployWizardGithubAppCredentials;
  },
): string {
  const key = `${variable.service}:${variable.name}`;
  const typed = (values[key] ?? '').trim();
  if (variable.inheritFromHost) return typed || serverEnv(variable.name)?.trim() || '';
  if (variable.provisionedOnApply && variable.name === 'RESEND_WEBHOOK_SECRET') return extras.webhookSecret;
  if (variable.provisionedOnApply && DEPLOY_WIZARD_GITHUB_APP_VARS.has(variable.name)) {
    return extras.githubApp?.[variable.name as keyof DeployWizardGithubAppCredentials] || '';
  }
  if (variable.kind === 'generated') {
    if (variable.name === 'VAPID_PUBLIC_KEY') return extras.vapid?.publicKey ?? '';
    if (variable.name === 'VAPID_PRIVATE_KEY') return extras.vapid?.privateKey ?? '';
    return generateDeployWizardSecret(variable.name);
  }
  return typed || (variable.filled ?? '').trim();
}
