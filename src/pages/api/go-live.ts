/**
 * GET  /api/go-live — catalog (Railway projects, capabilities).
 * POST /api/go-live — probe install context or run go-live (SSE progress).
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../lib/apiResponse';
import { requireDeploymentOwner } from '../../lib/deploymentOwner';
import { hasFeature } from '../../lib/features';
import { isCanonicalReaveInstall } from '../../lib/installConfig';
import { normalizeSiteDomain } from '../../lib/deployWizardCatalog';
import {
  executeGoLive,
  goLiveCapabilities,
  loadGoLiveInstallContext,
  type GoLiveRegistrar,
} from '../../lib/goLive';
import { isRailwayConfigured, railwayListProjects } from '../../lib/railwayClient';

export const prerender = false;

function requireCanonicalReaveHost(): Response | null {
  if (isCanonicalReaveInstall() && hasFeature('deploy_wizard')) return null;
  return jsonResponse({ ok: false, error: 'Not found' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = requireCanonicalReaveHost();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  let projects: { id: string; name: string }[] = [];
  if (isRailwayConfigured()) {
    const listed = await railwayListProjects();
    if (listed.ok) projects = listed.projects;
  }

  const project = context.url.searchParams.get('project')?.trim() || '';
  let install = null as Awaited<ReturnType<typeof loadGoLiveInstallContext>> | null;
  if (project) {
    install = await loadGoLiveInstallContext({
      project,
      environment: context.url.searchParams.get('environment')?.trim() || 'production',
    });
  }

  return jsonResponse({
    ok: true,
    capabilities: goLiveCapabilities(),
    railway: { configured: isRailwayConfigured(), projects },
    defaults: { environment: 'production' },
    install: install?.ok ? install.data : install && !install.ok ? { error: install.error } : null,
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const hostDenied = requireCanonicalReaveHost();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : 'apply';

  if (action === 'context') {
    const project = typeof body.project === 'string' ? body.project.trim() : '';
    if (!project) return jsonResponse({ ok: false, error: 'project is required' }, 400);
    const out = await loadGoLiveInstallContext({
      project,
      environment: typeof body.environment === 'string' ? body.environment : 'production',
    });
    if (!out.ok) return jsonResponse({ ok: false, error: out.error }, 400);
    return jsonResponse({ ok: true, install: out.data });
  }

  const project = typeof body.project === 'string' ? body.project.trim() : '';
  const domain = normalizeSiteDomain(typeof body.domain === 'string' ? body.domain : '');
  const environment = typeof body.environment === 'string' ? body.environment : 'production';
  const registrar = (body.registrar === 'namecom' ? 'namecom' : 'manual') as GoLiveRegistrar;
  const namecomUsername = typeof body.namecomUsername === 'string' ? body.namecomUsername.trim() : '';
  const namecomToken = typeof body.namecomToken === 'string' ? body.namecomToken.trim() : '';
  const stream = body.stream === true;

  if (!project) return jsonResponse({ ok: false, error: 'project is required' }, 400);
  if (!domain) return jsonResponse({ ok: false, error: 'domain is required' }, 400);

  if (!stream) {
    const result = await executeGoLive({
      project,
      environment,
      domain,
      registrar,
      namecomUsername: namecomUsername || undefined,
      namecomToken: namecomToken || undefined,
    });
    if (!result.ok) return jsonResponse({ ok: false, error: result.error, steps: result.steps }, 400);
    return jsonResponse({ ok: true, ...result });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send({ type: 'start' });
      const result = await executeGoLive({
        project,
        environment,
        domain,
        registrar,
        namecomUsername: namecomUsername || undefined,
        namecomToken: namecomToken || undefined,
        onProgress: (message) => send({ type: 'progress', message }),
      });
      send({ type: 'result', result });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
