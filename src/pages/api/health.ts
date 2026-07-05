import type { APIRoute } from 'astro';
import { getAgentModelSettings } from '../../lib/agentModel';
import { enabledFeatures, FEATURE_LABELS, hasFeature, type FeatureId } from '../../lib/features';
import { isChangeDetectionConfigured } from '../../lib/changedetectionClient';
import { isUptimeRobotConfigured } from '../../lib/uptimerobotClient';
import { bookingPing, calcomWebappUrl, isBookingConfigured } from '../../lib/bookingClient';
import { serverEnv } from '../../lib/serverEnv';

/**
 * Live health snapshot for the /admin/ "System" tab.
 *
 * Honest about what it can and can't verify:
 *  - `live`    — actually pinged the service this request (reachable / down).
 *  - `derived` — inferred from another live check (e.g. Postgres behind its API).
 *  - `config`  — only checked whether credentials/URL are present (external APIs
 *                we don't hammer on every poll).
 *  - `self`    — this app; if you got this response, it's up.
 */
export const prerender = false;

type Status =
  | 'up'
  | 'down'
  | 'degraded'
  | 'configured'
  | 'unconfigured'
  | 'unknown';

type Mode = 'live' | 'derived' | 'config' | 'self';

type Probe = { status: Status; mode: Mode; detail?: string; ms?: number };

const TIMEOUT_MS = 4500;

function trimBase(v?: string): string | null {
  const t = v?.trim().replace(/\/+$/, '');
  return t || null;
}

function unconfigured(detail: string): Probe {
  return { status: 'unconfigured', mode: 'config', detail };
}

function configured(detail: string): Probe {
  return { status: 'configured', mode: 'config', detail };
}

/** Generic reachability: any HTTP answer = reachable; 5xx = degraded; throw = down. */
async function reach(url: string): Promise<Probe> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'reave-os-map-health' },
    });
    const ms = Date.now() - started;
    if (res.status >= 500) {
      return { status: 'degraded', mode: 'live', detail: `HTTP ${res.status}`, ms };
    }
    return { status: 'up', mode: 'live', detail: `HTTP ${res.status}`, ms };
  } catch (e) {
    const ms = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 'down', mode: 'live', detail: msg.includes('aborted') ? 'timeout' : msg, ms };
  } finally {
    clearTimeout(timer);
  }
}

/** GitHub /rate_limit validates the token without consuming any quota. */
async function githubProbe(token: string): Promise<Probe> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'reave-os-map-health',
      },
      signal: ctrl.signal,
    });
    const ms = Date.now() - started;
    if (res.ok) return { status: 'up', mode: 'live', detail: 'token valid', ms };
    if (res.status === 401 || res.status === 403) {
      return { status: 'down', mode: 'live', detail: `HTTP ${res.status} (bad token)`, ms };
    }
    return { status: 'degraded', mode: 'live', detail: `HTTP ${res.status}`, ms };
  } catch (e) {
    const ms = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 'down', mode: 'live', detail: msg.includes('aborted') ? 'timeout' : msg, ms };
  } finally {
    clearTimeout(timer);
  }
}


export const GET: APIRoute = async () => {
  const contactBase = trimBase(serverEnv('CONTACT_API_BASE_URL'));
  const craterBase = trimBase(serverEnv('CRATER_API_BASE_URL'));
  const ghToken = (serverEnv('GITHUB_TOKEN') || serverEnv('GH_TOKEN'))?.trim();

  // Run the network probes concurrently.
  const [contactProbe, craterProbe, ghProbe, cdProbe, bookingProbe, calWebProbe] =
    await Promise.all([
    contactBase ? reach(contactBase) : Promise.resolve(unconfigured('CONTACT_API_BASE_URL not set')),
    craterBase ? reach(craterBase) : Promise.resolve(unconfigured('CRATER_API_BASE_URL not set')),
    ghToken ? githubProbe(ghToken) : Promise.resolve(unconfigured('GITHUB_TOKEN not set')),
    isChangeDetectionConfigured()
      ? reach(trimBase(serverEnv('CHANGEDETECTION_BASE_URL'))!)
      : Promise.resolve(unconfigured('CHANGEDETECTION not configured')),
    isBookingConfigured()
      ? bookingPing().then((r) =>
          r.ok && r.data.reachable
            ? { status: 'up' as Status, mode: 'live' as Mode, detail: r.data.db ? `db ${r.data.db}` : 'reachable' }
            : { status: 'down' as Status, mode: 'live' as Mode, detail: r.ok ? 'unhealthy' : r.error },
        )
      : Promise.resolve(unconfigured('BOOKING_API_URL not set')),
    calcomWebappUrl()
      ? reach(calcomWebappUrl()!)
      : Promise.resolve(unconfigured('CALCOM_WEBAPP_URL not set')),
  ]);

  // contact-postgres sits behind contact-api on the private network — infer it.
  let contactPg: Probe;
  if (!contactBase) {
    contactPg = unconfigured('depends on contact-api');
  } else if (contactProbe.status === 'up') {
    contactPg = { status: 'up', mode: 'derived', detail: 'inferred via contact-api' };
  } else {
    contactPg = { status: 'unknown', mode: 'derived', detail: 'contact-api unreachable' };
  }

  const agentModel = await getAgentModelSettings();
  const anthropicDetail = serverEnv('ANTHROPIC_API_KEY')
    ? `model ${agentModel.model} (${agentModel.source})`
    : undefined;

  const pushConfigured =
    serverEnv('VAPID_PUBLIC_KEY')?.trim() && serverEnv('VAPID_PRIVATE_KEY')?.trim();
  const pushEnabled = serverEnv('PUSH_ENABLED') !== '0';

  const services: Record<string, Probe> = {
    astro: { status: 'up', mode: 'self', detail: 'serving this endpoint' },
    app_pg: serverEnv('DATABASE_URL')
      ? configured('DATABASE_URL set')
      : unconfigured('DATABASE_URL not set'),
    contact_api: contactProbe,
    contact_pg: contactPg,
    crater: craterProbe,
    anthropic: serverEnv('ANTHROPIC_API_KEY')
      ? configured(anthropicDetail ?? 'ANTHROPIC_API_KEY set')
      : unconfigured('ANTHROPIC_API_KEY not set'),
    railway_gql: serverEnv('RAILWAY_API_TOKEN')
      ? configured('RAILWAY_API_TOKEN set')
      : unconfigured('RAILWAY_API_TOKEN not set'),
    railway_webhook: serverEnv('RAILWAY_WEBHOOK_INGRESS_KEY')
      ? configured('RAILWAY_WEBHOOK_INGRESS_KEY set')
      : unconfigured('RAILWAY_WEBHOOK_INGRESS_KEY not set'),
    kinsta_api:
      serverEnv('KINSTA_API_KEY')?.trim() && serverEnv('KINSTA_COMPANY_ID')?.trim()
        ? configured('KINSTA_API_KEY + KINSTA_COMPANY_ID set')
        : unconfigured('KINSTA_API_KEY or KINSTA_COMPANY_ID not set'),
    resend: serverEnv('RESEND_API_KEY')
      ? configured('RESEND_API_KEY set')
      : unconfigured('RESEND_API_KEY not set'),
    github: ghProbe,
    telnyx: serverEnv('TELNYX_API_KEY')
      ? configured(`TELNYX_API_KEY set${serverEnv('VOICE_AGENT_ENABLED') === '1' ? ' · voice enabled' : ''}`)
      : unconfigured('TELNYX_API_KEY not set'),
    changedetection: cdProbe,
    uptimerobot: hasFeature('uptime_monitoring')
      ? isUptimeRobotConfigured()
        ? configured('UPTIMEROBOT_API_KEY set')
        : unconfigured('UPTIMEROBOT_API_KEY not set')
      : unconfigured('uptime_monitoring not in FEATURES'),
    calcom_booking: bookingProbe,
    calcom_web: calWebProbe,
    clerk: serverEnv('CLERK_SECRET_KEY')
      ? configured('CLERK_SECRET_KEY set')
      : unconfigured('CLERK_SECRET_KEY not set'),
    web_push: pushConfigured
      ? configured(pushEnabled ? 'VAPID keys set · enabled' : 'VAPID keys set · PUSH_ENABLED=0')
      : unconfigured('VAPID keys not set'),
    vapi:
      serverEnv('PUBLIC_VAPI_PUBLIC_KEY')?.trim() && serverEnv('PUBLIC_VAPI_ASSISTANT_ID')?.trim()
        ? configured('PUBLIC_VAPI_* set')
        : unconfigured('PUBLIC_VAPI_* not set'),
  };

  const features = [...enabledFeatures()].map((id: FeatureId) => ({
    id,
    label: FEATURE_LABELS[id],
  }));

  return new Response(JSON.stringify({ checkedAt: new Date().toISOString(), services, features }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
