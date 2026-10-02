/**
 * Railway stack helpers shared by the deploy wizard and dev_infra agent tools.
 */
import { randomBytes } from 'node:crypto';
import { railwaySetVariables } from './railwayAgentApi';
import {
  RAILWAY_POSTGRES_IMAGE,
  RAILWAY_POSTGRES_VOLUME,
  pickRailwayEnvironment,
  railwayCreateService,
  railwayCreateVolume,
  railwayEnsurePublicDomain,
  railwayResolveProject,
  railwayResolveService,
} from './railwayClient';

export { RAILWAY_POSTGRES_IMAGE, RAILWAY_POSTGRES_VOLUME };

export async function railwayEnsurePostgresVariables(opts: {
  projectId: string;
  environment: string;
  serviceName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const password = randomBytes(24).toString('hex');
  const result = await railwaySetVariables({
    project: opts.projectId,
    environment: opts.environment,
    service: opts.serviceName,
    skip_deploys: true,
    variables: {
      POSTGRES_USER: 'postgres',
      POSTGRES_DB: 'railway',
      POSTGRES_PASSWORD: password,
      PGDATA: '/var/lib/postgresql/data/pgdata',
      DATABASE_URL:
        'postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{POSTGRES_DB}}',
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function railwayProvisionPostgresService(opts: {
  projectRef: string;
  name?: string;
  environment?: string;
}): Promise<
  | {
      ok: true;
      project: string;
      environment: string;
      serviceId: string;
      serviceName: string;
      volumeId: string;
    }
  | { ok: false; error: string }
> {
  const projectRef = opts.projectRef.trim();
  if (!projectRef) return { ok: false, error: 'project is required' };

  const serviceName = (opts.name?.trim() || 'Postgres').trim();
  const envName = (opts.environment?.trim() || 'production').toLowerCase();

  const resolved = await railwayResolveProject(projectRef);
  if (!resolved.ok) return resolved;

  const environment = pickRailwayEnvironment(resolved.environments, envName);
  if (!environment) {
    return { ok: false, error: `Environment "${envName}" not found in project ${resolved.project.name}` };
  }

  const existing = resolved.services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase());
  if (existing) {
    return {
      ok: false,
      error: `Service "${serviceName}" already exists in ${resolved.project.name}. Use connect or variables tools instead.`,
    };
  }

  const created = await railwayCreateService({
    projectId: resolved.project.id,
    name: serviceName,
    image: RAILWAY_POSTGRES_IMAGE,
  });
  if (!created.ok) return { ok: false, error: created.error };

  const volume = await railwayCreateVolume({
    projectId: resolved.project.id,
    environmentId: environment.id,
    serviceId: created.id,
    mountPath: RAILWAY_POSTGRES_VOLUME,
  });
  if (!volume.ok) return { ok: false, error: `${serviceName} volume: ${volume.error}` };

  const vars = await railwayEnsurePostgresVariables({
    projectId: resolved.project.id,
    environment: environment.name,
    serviceName,
  });
  if (!vars.ok) return { ok: false, error: `${serviceName} variables: ${vars.error}` };

  return {
    ok: true,
    project: resolved.project.name,
    environment: environment.name,
    serviceId: created.id,
    serviceName,
    volumeId: volume.id,
  };
}

export async function railwayEnsureServicePublicDomain(opts: {
  projectRef: string;
  service: string;
  environment?: string;
}): Promise<
  | { ok: true; project: string; service: string; domain?: string; created: boolean }
  | { ok: false; error: string }
> {
  const projectRef = opts.projectRef.trim();
  const serviceRef = opts.service.trim();
  if (!projectRef) return { ok: false, error: 'project is required' };
  if (!serviceRef) return { ok: false, error: 'service is required' };

  const envName = (opts.environment?.trim() || 'production').toLowerCase();
  const resolved = await railwayResolveProject(projectRef);
  if (!resolved.ok) return resolved;

  const environment = pickRailwayEnvironment(resolved.environments, envName);
  if (!environment) {
    return { ok: false, error: `Environment "${envName}" not found in project ${resolved.project.name}` };
  }

  const svcResult = railwayResolveService(resolved.services, serviceRef);
  if (!svcResult.ok) return svcResult;

  const pub = await railwayEnsurePublicDomain({
    projectId: resolved.project.id,
    environmentId: environment.id,
    serviceId: svcResult.service.id,
  });
  if (!pub.ok) return pub;

  return {
    ok: true,
    project: resolved.project.name,
    service: svcResult.service.name,
    domain: pub.domain,
    created: pub.created,
  };
}
