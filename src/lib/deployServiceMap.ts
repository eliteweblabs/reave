/**
 * Map Railway project/service names to GitHub repos and health URLs.
 * Used by deploy-incident dedup (one active repair per repo) and status checks.
 */
import { serverEnv } from './serverEnv';

export type DeployServiceTarget = {
  /** GitHub owner/repo — also used as dedup_key for incident blocking. */
  repo: string;
  /** Optional health ping URL for sibling services (defaults to this Astro service). */
  healthUrl?: string;
};

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * Resolve which GitHub repo a Railway deploy failure belongs to.
 * Falls back to GITHUB_REPO / eliteweblabs/reave for the main Astro service.
 */
export function resolveDeployTarget(opts: {
  project?: string;
  service?: string;
  subject?: string;
  body?: string;
}): DeployServiceTarget {
  const proj = norm(opts.project);
  const svc = norm(opts.service);
  const blob = `${norm(opts.subject)} ${norm(opts.body)} ${proj} ${svc}`;

  if (proj.includes('paulino') || svc.includes('paulino') || blob.includes('paulino-wizard')) {
    return {
      repo: 'eliteweblabs/paulino-wizard',
      healthUrl: serverEnv('PAULINO_WIZARD_API_BASE_URL')?.trim()?.replace(/\/?$/, '/') ||
        'https://paulino-wizard-production.up.railway.app/',
    };
  }

  if (svc.includes('materials-api') || svc.includes('materials_api') || blob.includes('materials-api')) {
    const base = serverEnv('MATERIALS_API_BASE_URL')?.trim();
    return {
      repo: 'eliteweblabs/materials-api',
      healthUrl: base ? base.replace(/\/?$/, '/') + 'health' : undefined,
    };
  }

  if (svc.includes('fleet-api') || svc.includes('fleet_api') || blob.includes('fleet-api')) {
    const base = serverEnv('FLEET_API_BASE_URL')?.trim();
    return {
      repo: 'eliteweblabs/fleet-api',
      healthUrl: base ? base.replace(/\/?$/, '/') + 'health' : undefined,
    };
  }

  if (svc.includes('inventory-api') || svc.includes('inventory_api') || blob.includes('inventory-api')) {
    const base = serverEnv('INVENTORY_API_BASE_URL')?.trim();
    return {
      repo: 'eliteweblabs/inventory-api',
      healthUrl: base ? base.replace(/\/?$/, '/') + 'health' : undefined,
    };
  }

  if (svc.includes('contact-api') || svc.includes('contact_api') || blob.includes('contact-api')) {
    const base = serverEnv('CONTACT_API_BASE_URL')?.trim();
    return {
      repo: 'eliteweblabs/contact-api',
      healthUrl: base ? base.replace(/\/?$/, '/') + 'health' : undefined,
    };
  }

  if (svc.includes('crater') || blob.includes('ap.reave.app')) {
    return {
      repo: 'eliteweblabs/crater',
      healthUrl: 'https://ap.reave.app/',
    };
  }

  const explicit = serverEnv('GITHUB_REPO')?.trim();
  const health = serverEnv('DEPLOY_HEALTH_URL')?.trim();
  return {
    repo: explicit || 'eliteweblabs/reave',
    healthUrl: health ? health.replace(/\/?$/, '/') : undefined,
  };
}

/** dedup_key for incident blocking — one active incident per repo. */
export function deployDedupKey(target: DeployServiceTarget): string {
  return target.repo.toLowerCase();
}
