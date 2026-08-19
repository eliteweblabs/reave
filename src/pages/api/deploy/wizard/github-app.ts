/**
 * GitHub App manifest + install callbacks for deploy-wizard Apply.
 *
 * 1. GitHub redirects here with ?code= after the owner creates the App
 * 2. We convert the code, then send them to the install page
 * 3. GitHub redirects here with ?installation_id= after they install
 * 4. We finish Apply (create repo attach + Railway vars)
 */
import type { APIContext } from 'astro';
import {
  executeDeployWizardApply,
  isDeployWizardApplyNeedGithubApp,
  planFromGithubAppApply,
} from '../../../../lib/deployWizardApply';
import {
  clearGithubAppCookieHeader,
  convertGithubAppManifest,
  deleteGithubAppPending,
  getGithubAppPending,
  githubAppInstallUrl,
  pendingToCredentials,
  readGithubAppCookie,
  saveGithubAppPending,
} from '../../../../lib/deployWizardGithubApp';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { hasFeature } from '../../../../lib/features';
import { isCanonicalReaveInstall } from '../../../../lib/installConfig';

export const prerender = false;

function denyHost(): Response | null {
  if (isCanonicalReaveInstall() && hasFeature('deploy_wizard')) return null;
  return new Response('Not found', { status: 404 });
}

function redirectToDeploy(origin: string, query: Record<string, string>, extraHeaders?: Record<string, string>): Response {
  const params = new URLSearchParams(query);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin.replace(/\/+$/, '')}/deploy?${params.toString()}`,
      ...extraHeaders,
    },
  });
}

function pendingState(context: APIContext): string {
  const fromQuery = context.url.searchParams.get('state')?.trim() || '';
  if (fromQuery) return fromQuery;
  return readGithubAppCookie(context.request.headers.get('cookie'));
}

export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = denyHost();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) {
    if (auth.status === 401) {
      const next = encodeURIComponent(context.url.pathname + context.url.search);
      return new Response(null, {
        status: 302,
        headers: { Location: `/admin/?auth=sign-in&returnTo=${next}` },
      });
    }
    return auth;
  }

  const origin = context.url.origin;
  const state = pendingState(context);
  const code = context.url.searchParams.get('code')?.trim() || '';
  const installationId = context.url.searchParams.get('installation_id')?.trim() || '';

  if (code) {
    const row = getGithubAppPending(state);
    if (!row) {
      return redirectToDeploy(origin, {
        github: 'error',
        message: 'GitHub App session expired. Click Apply again.',
      });
    }
    const converted = await convertGithubAppManifest(code);
    if (!converted.ok) {
      return redirectToDeploy(origin, { github: 'error', message: converted.error });
    }
    saveGithubAppPending(state, {
      ...row,
      appId: converted.appId,
      appSlug: converted.appSlug,
      privateKey: converted.privateKey,
    });
    const install = converted.appSlug
      ? githubAppInstallUrl(converted.appSlug)
      : `https://github.com/settings/apps`;
    return new Response(null, { status: 302, headers: { Location: install } });
  }

  if (installationId) {
    const row = getGithubAppPending(state);
    if (!row?.appId || !row.privateKey) {
      return redirectToDeploy(origin, {
        github: 'error',
        message: 'GitHub App was installed but the wizard session expired. Click Apply again.',
      });
    }
    saveGithubAppPending(state, { ...row, installationId });
    const credentials = pendingToCredentials({ ...row, installationId });
    if (!credentials) {
      return redirectToDeploy(origin, {
        github: 'error',
        message: 'GitHub App credentials were incomplete. Click Apply again.',
      });
    }

    const plan = planFromGithubAppApply(row.apply);
    const executed = await executeDeployWizardApply({
      plan,
      values: row.apply.values,
      project: row.apply.project,
      environment: row.apply.environment,
      request: context.request,
      githubApp: credentials,
    });
    deleteGithubAppPending(state);

    if (!executed.ok) {
      const message = isDeployWizardApplyNeedGithubApp(executed)
        ? 'GitHub App was created but Apply still needs an installation. Click Apply again.'
        : executed.error;
      return redirectToDeploy(origin, { github: 'error', message }, { 'Set-Cookie': clearGithubAppCookieHeader() });
    }

    return redirectToDeploy(
      origin,
      { github: 'ok' },
      { 'Set-Cookie': clearGithubAppCookieHeader() },
    );
  }

  return redirectToDeploy(origin, {
    github: 'error',
    message: 'GitHub did not return an App code or installation. Click Apply again.',
  });
}
