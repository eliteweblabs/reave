/**
 * Railway deploy status — cached for the header bulb and agent reply banners.
 * Source of truth: Railway webhooks + optional GraphQL (not GitHub).
 */

import { isRailwayConfigured } from './railwayClient';
import { railwayListDeployments, type RailwayDeploymentRow } from './railwayAgentApi';
import {
  getDeployFlight,
  setDeployFlightDeploying,
  setDeployFlightFailed,
  setDeployFlightIdle,
} from './pgDeployFlight';
import { serverEnv } from './serverEnv';

export type DeployState = 'live' | 'deploying' | 'stale' | 'failed' | 'unknown';

/** Commit-ish info for tooltips (from Railway env, webhook, or GraphQL meta). */
export type DeployCommitInfo = {
  sha: string;
  short_sha: string;
  message: string;
  author: string;
  date: string;
  pushed_at: string;
  url: string;
};

export type DeployStatusSnapshot = {
  on_railway: boolean;
  deployed_sha: string | null;
  deployed_short: string | null;
  /** ISO timestamp for the running deploy / in-flight commit when known. */
  deployed_at: string | null;
  latest_commit: DeployCommitInfo | null;
  /** Always true when live on Railway (no GitHub compare). */
  up_to_date: boolean | null;
  state: DeployState;
  failed_reason: string | null;
  minutes_since_push: number | null;
};

const CACHE_MS_LIVE = 15_000;
const CACHE_MS_ACTIVE = 5_000;
const DEPLOYING_OVERRIDE_MS = 15 * 60_000;

const IN_FLIGHT_STATUSES = new Set([
  'BUILDING',
  'DEPLOYING',
  'INITIALIZING',
  'QUEUED',
  'WAITING',
  'NEEDS_APPROVAL',
]);
const FAILED_STATUSES = new Set(['FAILED', 'CRASHED']);
const SUCCESS_STATUSES = new Set(['SUCCESS']);

let cache: { at: number; data: DeployStatusSnapshot | null } = { at: 0, data: null };
let failedOverride: {
  reason: string;
  until: number;
  failed_sha: string | null;
  set_at: string;
} | null = null;
let deployingOverride: {
  commit_sha: string | null;
  commit_message: string | null;
  started_at: string;
  until: number;
} | null = null;
let previousState: DeployState | null = null;
let showLiveBannerOnce = false;

function deployedSha(): string | undefined {
  return serverEnv('RAILWAY_GIT_COMMIT_SHA')?.trim() || serverEnv('GIT_COMMIT_SHA')?.trim();
}

function deployedCommitMessage(): string {
  return (
    serverEnv('RAILWAY_GIT_COMMIT_MESSAGE')?.trim() ||
    serverEnv('GIT_COMMIT_MESSAGE')?.trim() ||
    ''
  );
}

function truncateMessage(message: string | null | undefined, max = 60): string {
  const line = (message ?? '').split('\n')[0]?.trim() ?? '';
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function relativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 60_000));
}

const EASTERN_TZ = 'America/New_York';

/** Deploy/commit time in US Eastern (EST/EDT via IANA timezone). */
export function formatDeployDateEastern(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

function commitPushedAt(commit: DeployCommitInfo | null | undefined): string | null {
  if (!commit) return null;
  return commit.pushed_at || commit.date || null;
}

/** Insert "· 3m ago" after the first em dash segment so age is visible in the tooltip. */
function withInlineAge(text: string, iso: string | null | undefined): string {
  const age = relativeAge(iso);
  if (!age) return text;
  // "Live — abc1234 — msg" → "Live — abc1234 · 3m ago — msg"
  const parts = text.split(' — ');
  if (parts.length >= 2) {
    parts[1] = `${parts[1]} · ${age}`;
    return parts.join(' — ');
  }
  return `${text} · ${age}`;
}

function appendRelativeDeployLine(
  text: string,
  iso: string | null | undefined,
  label: 'Deployed' | 'Started' = 'Deployed',
): string {
  const age = relativeAge(iso);
  if (!age) return text;
  const eastern = formatDeployDateEastern(iso);
  const detail = eastern ? `${label} ${age} (${eastern})` : `${label} ${age}`;
  const head = label === 'Deployed' ? withInlineAge(text, iso) : text;
  return `${head}\n${detail}`;
}

function noteStateTransition(state: DeployState): void {
  if ((previousState === 'deploying' || previousState === 'stale' || previousState === 'failed') && state === 'live') {
    showLiveBannerOnce = true;
    import('./features')
      .then(({ hasFeature }) => {
        if (hasFeature('site_monitoring')) {
          return import('./siteMonitoring');
        }
        return null;
      })
      .then((mod) => mod?.markDeployActivity())
      .catch(() => undefined);
  }
  previousState = state;
}

/** User explicitly asking whether a deploy is live. */
export function isDeployStatusQuery(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(is it|are we|did it|has it)\b.*\b(deploy(ed|ing|ment)?|live|shipped|pushed)\b/.test(t) ||
    /\bdeploy(ment)?\s+status\b/.test(t) ||
    /\bcheck_deployment_status\b/.test(t) ||
    /\b(up to date|uptodate)\b/.test(t) ||
    /^(?:\/|!)deploy\b/.test(t.trim())
  );
}

function bustDeployCache(): void {
  cache = { at: 0, data: null };
}

function expireDeployOverrides(): void {
  const now = Date.now();
  if (failedOverride && now > failedOverride.until) {
    failedOverride = null;
  }
  if (deployingOverride && now > deployingOverride.until) {
    deployingOverride = null;
  }
}

/** Pull shared webhook state so draining replicas clear the chat lock after success. */
async function hydrateOverridesFromFlight(): Promise<void> {
  const flight = await getDeployFlight().catch(() => null);
  if (!flight) return;

  if (flight.status === 'idle') {
    // Only clear local overrides when the shared row was updated *after* they started.
    // Avoids a race where markDeployStarted sets memory before the PG write lands.
    const flightAt = Date.parse(flight.updated_at);
    if (deployingOverride) {
      const startedAt = Date.parse(deployingOverride.started_at);
      if (Number.isFinite(flightAt) && Number.isFinite(startedAt) && flightAt >= startedAt) {
        deployingOverride = null;
      }
    }
    if (failedOverride) {
      const setAt = Date.parse(failedOverride.set_at);
      if (Number.isFinite(flightAt) && Number.isFinite(setAt) && flightAt >= setAt) {
        failedOverride = null;
      }
    }
    return;
  }

  if (flight.status === 'deploying') {
    failedOverride = null;
    const started = flight.started_at || new Date().toISOString();
    const ageMs = Date.now() - new Date(started).getTime();
    if (Number.isFinite(ageMs) && ageMs > DEPLOYING_OVERRIDE_MS) {
      deployingOverride = null;
      void setDeployFlightIdle();
      return;
    }
    deployingOverride = {
      commit_sha: flight.commit_sha,
      commit_message: flight.commit_message,
      started_at: started,
      until: Date.now() + Math.max(5_000, DEPLOYING_OVERRIDE_MS - Math.max(0, ageMs)),
    };
    return;
  }

  if (flight.status === 'failed') {
    deployingOverride = null;
    failedOverride = {
      reason: flight.failed_reason || 'Deploy failed — check Railway logs',
      until: Date.now() + 30 * 60_000,
      failed_sha: flight.failed_sha,
      set_at: flight.updated_at || new Date().toISOString(),
    };
  }
}

function commitInfo(
  hash: string,
  message?: string | null,
  timestamp?: string | null,
): DeployCommitInfo {
  const sha = hash.trim();
  const iso = timestamp?.trim() || new Date().toISOString();
  return {
    sha,
    short_sha: sha.slice(0, 7),
    message: message?.trim() || '',
    author: '',
    date: iso,
    pushed_at: iso,
    url: '',
  };
}

function metaString(meta: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function commitFromDeployment(dep: RailwayDeploymentRow): DeployCommitInfo | null {
  const hash = metaString(dep.meta, 'commitHash', 'commitSha', 'commit_sha');
  if (!hash) return null;
  return commitInfo(
    hash,
    metaString(dep.meta, 'commitMessage', 'commit_message', 'message'),
    dep.created_at,
  );
}

/** Called from Railway deploy-start webhook — instant yellow dot. */
export async function markDeployStarted(opts?: {
  commitHash?: string | null;
  commitMessage?: string | null;
  timestamp?: string | null;
}): Promise<void> {
  const commitSha = opts?.commitHash?.trim() || null;
  deployingOverride = {
    commit_sha: commitSha,
    commit_message: opts?.commitMessage?.trim() || null,
    started_at: opts?.timestamp?.trim() || new Date().toISOString(),
    until: Date.now() + DEPLOYING_OVERRIDE_MS,
  };
  bustDeployCache();
  await setDeployFlightDeploying(opts);
}

/** Called from Railway deploy-success webhook once the new version is live. */
export async function clearDeployStarted(): Promise<void> {
  deployingOverride = null;
  failedOverride = null;
  bustDeployCache();
  await setDeployFlightIdle();
}

/** Called from Railway deploy-failure webhook — surfaces until live again or TTL. */
export async function markDeployFailed(reason?: string, failedSha?: string | null): Promise<void> {
  deployingOverride = null;
  failedOverride = {
    reason: reason?.trim() || 'Deploy failed — check Railway logs',
    until: Date.now() + 30 * 60_000,
    failed_sha: failedSha?.trim() || null,
    set_at: new Date().toISOString(),
  };
  bustDeployCache();
  await setDeployFlightFailed(reason, failedSha);
}

function cacheTtl(snapshot: DeployStatusSnapshot | null): number {
  if (deployingOverride) return 0;
  if (!snapshot) return CACHE_MS_LIVE;
  if (snapshot.state === 'live') return CACHE_MS_LIVE;
  return CACHE_MS_ACTIVE;
}

function applyDeployingOverride(snapshot: DeployStatusSnapshot): DeployStatusSnapshot {
  if (!deployingOverride) return snapshot;

  const overrideCommit = deployingOverride.commit_sha;
  const deployed = snapshot.deployed_sha;
  const latestSha = snapshot.latest_commit?.sha ?? null;

  if (
    snapshot.state === 'live' &&
    (!overrideCommit || overrideCommit === deployed || overrideCommit === latestSha)
  ) {
    deployingOverride = null;
    void setDeployFlightIdle();
    return snapshot;
  }

  if (snapshot.state === 'failed') {
    return snapshot;
  }

  let latestCommit = snapshot.latest_commit;
  if (overrideCommit && latestSha !== overrideCommit) {
    latestCommit = commitInfo(
      overrideCommit,
      deployingOverride.commit_message,
      deployingOverride.started_at,
    );
  }

  return {
    ...snapshot,
    state: 'deploying',
    up_to_date: false,
    latest_commit: latestCommit,
    minutes_since_push: latestCommit
      ? minutesSince(commitPushedAt(latestCommit))
      : snapshot.minutes_since_push,
  };
}

function applyFailedOverride(snapshot: DeployStatusSnapshot): DeployStatusSnapshot {
  if (!failedOverride) return snapshot;
  // In-flight deploy wins; success path clears failedOverride before we get here.
  if (snapshot.state === 'deploying') return snapshot;
  return {
    ...snapshot,
    state: 'failed',
    up_to_date: false,
    failed_reason: failedOverride.reason,
  };
}

async function railwayApiSnapshot(
  deployed: string,
): Promise<Partial<DeployStatusSnapshot> | null> {
  if (!isRailwayConfigured()) return null;

  const service =
    serverEnv('RAILWAY_SERVICE_ID')?.trim() ||
    serverEnv('RAILWAY_SERVICE_NAME')?.trim() ||
    undefined;
  const env =
    serverEnv('RAILWAY_ENVIRONMENT_NAME')?.trim() ||
    serverEnv('RAILWAY_ENVIRONMENT')?.trim() ||
    'production';

  const deps = await railwayListDeployments({
    service,
    environment: env,
    limit: 10,
  });
  if (!deps.ok || deps.deployments.length === 0) return null;

  const active = deps.deployments.filter((d) => d.status.toUpperCase() !== 'REMOVED');
  const latest = active[0] ?? deps.deployments[0];
  if (!latest) return null;

  const status = latest.status.toUpperCase();
  const commit = commitFromDeployment(latest);

  if (IN_FLIGHT_STATUSES.has(status)) {
    return {
      state: 'deploying',
      up_to_date: false,
      latest_commit: commit,
      deployed_at: latest.created_at,
      minutes_since_push: minutesSince(latest.created_at),
      failed_reason: null,
    };
  }

  if (FAILED_STATUSES.has(status)) {
    const svc = latest.service_name || 'service';
    return {
      state: 'failed',
      up_to_date: false,
      latest_commit: commit,
      deployed_at: latest.created_at,
      minutes_since_push: minutesSince(latest.created_at),
      failed_reason: `Deploy failed — ${svc} (${status.toLowerCase()})`,
    };
  }

  if (SUCCESS_STATUSES.has(status)) {
    failedOverride = null;
    deployingOverride = null;
    void setDeployFlightIdle();
    const running =
      commit && deployed && commit.sha.startsWith(deployed.slice(0, 7))
        ? commit
        : deployed
          ? commitInfo(deployed, deployedCommitMessage(), latest.created_at)
          : commit;
    return {
      state: 'live',
      up_to_date: true,
      latest_commit: running,
      deployed_at: latest.created_at,
      minutes_since_push: null,
      failed_reason: null,
    };
  }

  return null;
}

async function fetchDeployStatusUncached(): Promise<DeployStatusSnapshot> {
  const deployed = deployedSha() ?? null;
  const onRailway = Boolean(deployed);

  expireDeployOverrides();
  await hydrateOverridesFromFlight();

  if (!onRailway) {
    return {
      on_railway: false,
      deployed_sha: null,
      deployed_short: null,
      deployed_at: null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: null,
      minutes_since_push: null,
    };
  }

  const baseCommit = commitInfo(deployed!, deployedCommitMessage());
  let snap: DeployStatusSnapshot = {
    on_railway: true,
    deployed_sha: deployed,
    deployed_short: deployed!.slice(0, 7),
    deployed_at: null,
    latest_commit: baseCommit,
    up_to_date: true,
    state: 'live',
    failed_reason: null,
    minutes_since_push: null,
  };

  const api = await railwayApiSnapshot(deployed!).catch(() => null);
  if (api) {
    snap = {
      ...snap,
      ...api,
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed!.slice(0, 7),
      latest_commit: api.latest_commit ?? snap.latest_commit,
    };
  }

  if (failedOverride) {
    snap = applyFailedOverride(snap);
  }

  snap = applyDeployingOverride(snap);
  noteStateTransition(snap.state);
  return snap;
}

/** Cached deploy snapshot (15s live / 5s in-flight). Returns null when not running on Railway. */
export async function getDeployStatus(): Promise<DeployStatusSnapshot | null> {
  const now = Date.now();
  const cached = cache.data;
  const ttl = cacheTtl(cached?.on_railway ? cached : null);
  if (ttl > 0 && now - cache.at < ttl && cached !== null) {
    return cached.on_railway ? cached : null;
  }

  const data = await fetchDeployStatusUncached();
  cache = { at: now, data };
  return data.on_railway ? data : null;
}

/** One-line header prepended to bot replies when relevant. */
export function deployBanner(
  snapshot: DeployStatusSnapshot,
  opts?: { includeLive?: boolean },
): string | null {
  if (snapshot.state === 'failed') {
    return `🔴 ${snapshot.failed_reason ?? 'Deploy failed — check Railway logs'}`;
  }

  if (snapshot.state === 'deploying') {
    const c = snapshot.latest_commit;
    const short = c?.short_sha ?? snapshot.deployed_short ?? '';
    const msg = truncateMessage(c?.message);
    const bit = msg ? ` "${msg}"` : '';
    const who = short ? `${short}${bit}` : 'new version';
    return `🚀 Deploying: ${who} — not yet live`;
  }

  if (snapshot.state === 'live' && opts?.includeLive && snapshot.deployed_short) {
    const msg = truncateMessage(snapshot.latest_commit?.message, 48);
    const bit = msg ? ` — ${msg}` : '';
    return appendRelativeDeployLine(
      `🟢 Live: ${snapshot.deployed_short}${bit}`,
      snapshot.deployed_at,
    );
  }

  return null;
}

export type DeployIndicatorTone = 'live' | 'deploying' | 'alert';

/** CSS tone for the topbar deploy indicator dot. */
export function deployIndicatorTone(state: DeployState): DeployIndicatorTone {
  if (state === 'live') return 'live';
  if (state === 'deploying') return 'deploying';
  return 'alert';
}

/** Plain-text tooltip for the admin deploy indicator (no emoji). */
export function deployTooltip(snapshot: DeployStatusSnapshot): string {
  if (snapshot.state === 'failed') {
    return appendRelativeDeployLine(
      snapshot.failed_reason ?? 'Deploy failed — check Railway logs',
      snapshot.deployed_at,
    );
  }

  if (snapshot.state === 'deploying') {
    const c = snapshot.latest_commit;
    const short = c?.short_sha ?? snapshot.deployed_short ?? '';
    const msg = truncateMessage(c?.message, 48);
    const bit = msg ? `: ${msg}` : '';
    const who = short ? `${short}${bit}` : 'new version';
    return appendRelativeDeployLine(
      `Deploying ${who} — not live yet`,
      commitPushedAt(c) ?? snapshot.deployed_at,
      'Started',
    );
  }

  if (snapshot.state === 'live' && snapshot.deployed_short) {
    const msg = truncateMessage(snapshot.latest_commit?.message, 48);
    const bit = msg ? ` — ${msg}` : '';
    return appendRelativeDeployLine(
      `Live — ${snapshot.deployed_short}${bit}`,
      snapshot.deployed_at,
    );
  }

  if (snapshot.state === 'unknown') {
    return 'Deploy status unavailable — not running on Railway';
  }

  return 'Deploy status unavailable';
}

const BANNER_PREFIXES = ['🚀 Deploying:', '🟢 Live:', '🔴 Deploy stale:', '🔴 Deploy failed', '🔴 '];

function alreadyHasBanner(text: string): boolean {
  return BANNER_PREFIXES.some((p) => text.startsWith(p));
}

/** When true (default on Railway), block new admin chat sends while a deploy is in flight. */
export function isDeployChatLockEnabled(): boolean {
  const raw = serverEnv('DEPLOY_CHAT_LOCK')?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
  return Boolean(deployedSha());
}

const CHAT_LOCK_STATES = new Set<DeployState>(['deploying', 'failed']);

/** True when new user chat sends should be rejected until the deploy settles. */
export function isChatLockedForDeploy(snapshot: DeployStatusSnapshot | null | undefined): boolean {
  if (!snapshot || !isDeployChatLockEnabled()) return false;
  return CHAT_LOCK_STATES.has(snapshot.state);
}

/** User-facing reason for the chat lock (API + composer banner). */
export function chatDeployLockMessage(snapshot: DeployStatusSnapshot): string {
  if (snapshot.state === 'failed') {
    const reason = snapshot.failed_reason ?? 'Deploy failed';
    return `${reason} — new messages are paused until the website is live again.`;
  }
  if (snapshot.state === 'deploying') {
    const c = snapshot.latest_commit;
    const short = c?.short_sha ?? snapshot.deployed_short ?? '';
    const msg = truncateMessage(c?.message, 48);
    const bit = msg ? `: ${msg}` : '';
    const who = short ? `${short}${bit}` : 'new version';
    return `Deploying ${who} — new messages are paused until the new version is live.`;
  }
  return 'Deploy in progress — new messages are paused until the new version is live.';
}

/** Prepend deploy banner to an agent reply when deploying, failed, or explicitly live. */
export async function prependDeployBanner(
  text: string,
  opts?: { userText?: string },
): Promise<string> {
  const status = await getDeployStatus();
  if (!status) return text;

  const wantsLive = opts?.userText ? isDeployStatusQuery(opts.userText) : false;
  const includeLive = wantsLive || showLiveBannerOnce;
  if (showLiveBannerOnce && status.state === 'live') {
    showLiveBannerOnce = false;
  }

  const banner = deployBanner(status, { includeLive });
  if (!banner) return text;
  if (alreadyHasBanner(text)) return text;
  return `${banner}\n\n${text}`;
}
