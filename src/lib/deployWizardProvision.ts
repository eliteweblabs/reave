/**
 * Deploy wizard → create the Railway project and missing services on Apply.
 * Existing projects / services are reused. GitHub App leftovers stay on the
 * review step — this only stands up the stack the variable plan names.
 */
import { randomBytes } from 'node:crypto';
import {
  deployWizardDesiredProjectName,
  isDeployWizardNewProjectRef,
  type DeployWizardPlan,
  type DeployWizardService,
} from './deployWizardCatalog';
import { railwaySetVariables } from './railwayAgentApi';
import {
  RAILWAY_POSTGRES_IMAGE,
  RAILWAY_POSTGRES_VOLUME,
  createRailwayEmptyProject,
  isRailwayUuid,
  pickRailwayEnvironment,
  railwayConnectServiceSource,
  railwayCreateService,
  railwayCreateVolume,
  railwayEnsurePublicDomain,
  railwayListProjects,
  railwayResolveProject,
  railwayServiceInstanceSource,
} from './railwayClient';

export {
  DEPLOY_WIZARD_NEW_PROJECT,
  deployWizardDesiredProjectName,
  isDeployWizardNewProjectRef,
} from './deployWizardCatalog';

function findProjectByName(
  projects: { id: string; name: string }[],
  name: string,
): { id: string; name: string } | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    projects.find((p) => p.name.toLowerCase() === needle) ??
    projects.find((p) => p.name.toLowerCase().replace(/\s+/g, '-') === needle.replace(/\s+/g, '-'))
  );
}

export type DeployWizardProvisionResult = {
  ok: true;
  projectId: string;
  projectName: string;
  createdProject: boolean;
  createdServices: string[];
  connectedServices: string[];
  notes: string[];
};

async function ensurePostgresVars(opts: {
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
      // Volume mount is /var/lib/postgresql/data, which contains lost+found.
      // initdb refuses a non-empty mount point unless PGDATA is a subdirectory.
      PGDATA: '/var/lib/postgresql/data/pgdata',
      DATABASE_URL:
        'postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{POSTGRES_DB}}',
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

async function ensureService(opts: {
  service: DeployWizardService;
  projectId: string;
  environmentId: string;
  environmentName: string;
  existing: { id: string; name: string }[];
}): Promise<
  | { ok: true; created: boolean; connected: boolean; note: string }
  | { ok: false; error: string }
> {
  const { service, projectId, environmentId, environmentName, existing } = opts;
  const already = existing.find((s) => s.name.toLowerCase() === service.id.toLowerCase());
  const image = service.image || (service.kind === 'postgres' ? RAILWAY_POSTGRES_IMAGE : undefined);
  const volumeMount = service.volumeMount || (service.kind === 'postgres' ? RAILWAY_POSTGRES_VOLUME : undefined);
  const repo = service.repo;
  const needsPublic = service.kind === 'app' || service.kind === 'api';

  if (already) {
    const source = await railwayServiceInstanceSource({
      serviceId: already.id,
      environmentId,
    });
    const hasSource = source.ok && Boolean(source.repo || source.image);
    let connected = false;
    if (source.ok && !hasSource && (repo || image)) {
      const link = await railwayConnectServiceSource({
        serviceId: already.id,
        repo,
        image,
      });
      if (!link.ok) {
        return { ok: false, error: `${service.id}: ${link.error}` };
      }
      connected = true;
      if (service.kind === 'postgres') {
        const vars = await ensurePostgresVars({
          projectId,
          environment: environmentName,
          serviceName: service.id,
        });
        if (!vars.ok) return vars;
      }
    }
    if (needsPublic) {
      await railwayEnsurePublicDomain({
        projectId,
        environmentId,
        serviceId: already.id,
      });
    }
    return {
      ok: true,
      created: false,
      connected,
      note: connected
        ? `Connected ${service.id} to ${repo || image}`
        : `Railway already had ${service.id}`,
    };
  }

  let created = await railwayCreateService({
    projectId,
    name: service.id,
    repo,
    image,
    branch: repo ? 'main' : undefined,
  });
  let sourceNote = repo ? repo : image ? image : 'empty service';
  if (!created.ok && repo) {
    const sourceError = created.error;
    const empty = await railwayCreateService({ projectId, name: service.id });
    if (!empty.ok) return { ok: false, error: `${service.id}: ${sourceError}` };
    created = empty;
    sourceNote = `empty — GitHub ${repo} failed (${sourceError})`;
  }
  if (!created.ok) return { ok: false, error: `${service.id}: ${created.error}` };

  if (volumeMount) {
    const volume = await railwayCreateVolume({
      projectId,
      environmentId,
      serviceId: created.id,
      mountPath: volumeMount,
    });
    if (!volume.ok) return { ok: false, error: `${service.id} volume: ${volume.error}` };
  }

  if (service.kind === 'postgres') {
    const vars = await ensurePostgresVars({
      projectId,
      environment: environmentName,
      serviceName: service.id,
    });
    if (!vars.ok) return { ok: false, error: `${service.id}: ${vars.error}` };
  }

  if (needsPublic) {
    await railwayEnsurePublicDomain({
      projectId,
      environmentId,
      serviceId: created.id,
    });
  }

  return { ok: true, created: true, connected: false, note: `Created ${service.id} (${sourceNote})` };
}

export async function ensureDeployWizardStack(opts: {
  plan: DeployWizardPlan;
  project: string;
  projectName?: string;
  environment?: string;
  onProgress?: (message: string) => void;
}): Promise<DeployWizardProvisionResult | { ok: false; error: string }> {
  const notes: string[] = [];
  const say = (message: string) => {
    notes.push(message);
    opts.onProgress?.(message);
  };
  const createdServices: string[] = [];
  const connectedServices: string[] = [];
  const environmentName = opts.environment?.trim() || 'production';
  const desiredName = deployWizardDesiredProjectName({
    projectName: opts.projectName,
    companyName: opts.plan.companyName,
    installSlug: opts.plan.installSlug,
  });

  let projectId = '';
  let projectName = desiredName;
  let createdProject = false;

  if (isDeployWizardNewProjectRef(opts.project) || !isRailwayUuid(opts.project.trim())) {
    say(`Looking up Railway project ${desiredName}…`);
    const listed = await railwayListProjects();
    if (!listed.ok) return listed;
    const named = isDeployWizardNewProjectRef(opts.project) ? desiredName : opts.project.trim();
    const existing = findProjectByName(listed.projects, named);
    if (existing) {
      projectId = existing.id;
      projectName = existing.name;
      say(`Reused Railway project ${existing.name}`);
    } else {
      say(`Creating Railway project ${named}…`);
      const created = await createRailwayEmptyProject(named, {
        description: `${named} — reΛVe.app install ${opts.plan.installSlug} (via deploy wizard)`,
      });
      if (!created.ok) return { ok: false, error: created.message };
      projectId = created.id;
      projectName = created.name;
      createdProject = true;
      say(`Created Railway project ${created.name}`);
    }
  } else {
    projectId = opts.project.trim();
    say(`Using Railway project ${projectId}`);
  }

  const resolved = await railwayResolveProject(projectId);
  if (!resolved.ok) return resolved;
  projectId = resolved.project.id;
  projectName = resolved.project.name;

  const environment = pickRailwayEnvironment(resolved.environments, environmentName);
  if (!environment) {
    return { ok: false, error: `No Railway environment found on ${projectName}` };
  }

  let existing = resolved.services;
  for (const service of opts.plan.services) {
    say(`Checking service ${service.id}…`);
    const row = await ensureService({
      service,
      projectId,
      environmentId: environment.id,
      environmentName: environment.name,
      existing,
    });
    if (!row.ok) return row;
    say(row.note);
    if (row.created) {
      createdServices.push(service.id);
      existing = [...existing, { id: service.id, name: service.id }];
    }
    if (row.connected) connectedServices.push(service.id);
  }

  return {
    ok: true,
    projectId,
    projectName,
    createdProject,
    createdServices,
    connectedServices,
    notes,
  };
}
