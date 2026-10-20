/**
 * Create install-scoped Clerk keys on Apply when the hub has CLERK_PLATFORM_KEY.
 */
import {
  clerkCreateApp,
  clerkGetAppKeys,
  isClerkPlatformConfigured,
} from './clerkClient';
import { normalizeSiteDomain, type DeployWizardPlan } from './deployWizardCatalog';

function clerkKeysPresent(plan: DeployWizardPlan, values: Record<string, string>): boolean {
  for (const service of ['shared', plan.appService]) {
    const pk = (values[`${service}:PUBLIC_CLERK_PUBLISHABLE_KEY`] ?? '').trim();
    const sk = (values[`${service}:CLERK_SECRET_KEY`] ?? '').trim();
    if (pk && sk) return true;
  }
  return false;
}

export async function provisionDeployWizardClerkKeys(opts: {
  plan: DeployWizardPlan;
  values: Record<string, string>;
}): Promise<
  | { ok: true; values: Record<string, string>; notes: string[]; created: boolean }
  | { ok: false; error: string }
> {
  if (clerkKeysPresent(opts.plan, opts.values)) {
    return { ok: true, values: opts.values, notes: [], created: false };
  }

  if (!isClerkPlatformConfigured()) {
    return {
      ok: false,
      error:
        'Clerk keys are missing on this install. Paste PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY on the Variables step, or run Apply from rekko.studio (CLERK_PLATFORM_KEY on the hub creates a Clerk app automatically).',
    };
  }

  const name = (opts.plan.companyName || opts.plan.installSlug || 'install').trim().slice(0, 256);
  const created = await clerkCreateApp(name);
  if (!created.ok || !created.app?.id) {
    return { ok: false, error: created.error || 'Clerk application create failed' };
  }

  let publishableKey = created.keys?.publishable_key?.trim() ?? '';
  let secretKey = created.keys?.secret_key?.trim() ?? '';
  if (!publishableKey || !secretKey) {
    const keys = await clerkGetAppKeys(created.app.id);
    if (!keys.ok) {
      return { ok: false, error: keys.error || 'Could not read Clerk API keys' };
    }
    publishableKey = keys.keys?.publishable_key?.trim() ?? '';
    secretKey = keys.keys?.secret_key?.trim() ?? '';
  }
  if (!publishableKey || !secretKey) {
    return { ok: false, error: 'Clerk returned no publishable/secret keys for the new application' };
  }

  const merged = { ...opts.values };
  for (const service of ['shared', opts.plan.appService]) {
    merged[`${service}:PUBLIC_CLERK_PUBLISHABLE_KEY`] = publishableKey;
    merged[`${service}:CLERK_SECRET_KEY`] = secretKey;
  }

  const siteDomain = normalizeSiteDomain(opts.plan.siteDomain);
  const notes = [
    `Created Clerk application “${name}” (${created.app.id}).`,
    siteDomain
      ? `Sign-in: https://${siteDomain}/admin — Go live migrates Clerk to the client apex.`
      : 'Redeploy the app service after Apply so Clerk keys are picked up.',
  ];

  return { ok: true, values: merged, notes, created: true };
}
