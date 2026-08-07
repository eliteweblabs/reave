/**
 * Railway deploy vs GitHub latest — cached for deploy banners in agent replies.
 */

import { serverEnv } from './serverEnv';
import {
  githubGetCommit,
  githubGetDefaultBranch,
  githubListCommits,
  isGithubConfigured,
  type GithubCommit,
} from './githubClient';

export type DeployState = 'live' | 'deploying' | 'stale' | 'failed' | 'unknown';

export type DeployStatusSnapshot = {
  on_railway: boolean;
  deployed_sha: string | null;
  deployed_short: string | null;
  /** ISO timestamp when the deployed commit landed on GitHub (committer date). */
  deployed_at: string | null;
  latest_commit: GithubCommit | null;
  up_to_date: boolean | null;
  state: DeployState;
  failed_reason: string | null;
  /** Minutes since latest GitHub commit was pushed (when behind deploy). */
  minutes_since_push: number | null;
};

const CACHE_MS_LIVE = 15_000;
const CACHE_MS_ACTIVE = 5_000;
const CACHE_MS_GITHUB_ERROR = 5 * 60_000;
const STALE_AFTER_MS = 10 * 60_000;
const DEPLOYING_OVERRIDE_MS = 15 * 60_000;

let cache: { at: number; data: DeployStatusSnapshot | null } = { at: 0, data: null };
let failedOverride: { reason: string; until: number; failed_sha: string | null } | null = null;
let deployingOverride: {
  commit_sha: string | null;
  commit_message: string | null;
  started_at: string;
  until: number;
} | null = null;
/** Pause GitHub lookups when the API is rate-limited or otherwise failing. */
let githubBackoffUntil = 0;
let githubLastError: string | null = null;
let previousState: DeployState | null = null;
let showLiveBannerOnce = false;

function isGithubRateLimitError(error: string | null | undefined): boolean {
  return Boolean(error && /rate limit/i.test(error));
}

function noteGithubError(error: string | null | undefined): void {
  if (!error) return;
  githubLastError = error.trim() || null;
  if (isGithubRateLimitError(error)) {
    const match = error.match(/~(\d+)\s*m/i);
    const minutes = match ? Number(match[1]) : 15;
    const waitMs = Math.min(
      60 * 60_000,
      Math.max(CACHE_MS_GITHUB_ERROR, (Number.isFinite(minutes) ? minutes : 15) * 60_000),
    );
    githubBackoffUntil = Math.max(githubBackoffUntil, Date.now() + waitMs);
  } else {
    githubBackoffUntil = Math.max(githubBackoffUntil, Date.now() + CACHE_MS_GITHUB_ERROR);
  }
}

function clearGithubError(): void {
  githubLastError = null;
  githubBackoffUntil = 0;
}

function deployedSha(): string | undefined {
  return serverEnv('RAILWAY_GIT_COMMIT_SHA')?.trim() || serverEnv('GIT_COMMIT_SHA')?.trim();
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

function commitPushedAt(commit: GithubCommit | null | undefined): string | null {
  if (!commit) return null;
  return commit.pushed_at || commit.date || null;
}

function appendRelativeDeployLine(
  text: string,
  iso: string | null | undefined,
  label: 'Deployed' | 'Pushed' = 'Deployed',
): string {
  const age = relativeAge(iso);
  return age ? `${text}\n${label} ${age}` : text;
}

async function resolveDeployedAt(
  deployed: string | null,
  latest: GithubCommit | null,
): Promise<string | null> {
  if (!deployed) return null;
  if (latest && deployed === latest.sha) return commitPushedAt(latest);
  if (!isGithubConfigured()) return null;
  const commit = await githubGetCommit(deployed);
  return commit.ok ? commitPushedAt(commit.data) : null;
}

function noteStateTransition(state: DeployState): void {
  if ((previousState === 'deploying' || previousState === 'stale') && state === 'live') {
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

function commitFromWebhook(
  hash: string,
  message?: string | null,
  timestamp?: string | null,
): GithubCommit {
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

/** Called from Railway deploy-start webhook — instant yellow dot before GitHub/SHA drift is visible. */
export function markDeployStarted(opts?: {
  commitHash?: string | null;
  commitMessage?: string | null;
  timestamp?: string | null;
}): void {
  const commitSha = opts?.commitHash?.trim() || null;
  deployingOverride = {
    commit_sha: commitSha,
    commit_message: opts?.commitMessage?.trim() || null,
    started_at: opts?.timestamp?.trim() || new Date().toISOString(),
    until: Date.now() + DEPLOYING_OVERRIDE_MS,
  };
  bustDeployCache();
}

/** Called from Railway deploy-success webhook once the new version is live. */
export function clearDeployStarted(): void {
  deployingOverride = null;
  bustDeployCache();
}

/** Called from Railway deploy-failure webhook — surfaces until live again or TTL. */
export function markDeployFailed(reason?: string, failedSha?: string | null): void {
  deployingOverride = null;
  failedOverride = {
    reason: reason?.trim() || 'Deploy failed — check Railway logs',
    until: Date.now() + 30 * 60_000,
    failed_sha: failedSha?.trim() || null,
  };
  bustDeployCache();
}

function cacheTtl(snapshot: DeployStatusSnapshot | null): number {
  if (deployingOverride) return 0;
  if (Date.now() < githubBackoffUntil) return CACHE_MS_GITHUB_ERROR;
  if (!snapshot) return CACHE_MS_LIVE;
  if (snapshot.state === 'unknown' && githubLastError) return CACHE_MS_GITHUB_ERROR;
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
    return snapshot;
  }

  if (snapshot.state === 'failed' || snapshot.state === 'stale') {
    return snapshot;
  }

  let latestCommit = snapshot.latest_commit;
  if (overrideCommit && latestSha !== overrideCommit) {
    latestCommit = commitFromWebhook(
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

async function fetchDeployStatusUncached(): Promise<DeployStatusSnapshot> {
  const deployed = deployedSha() ?? null;
  const onRailway = Boolean(deployed);

  expireDeployOverrides();

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

  if (!isGithubConfigured()) {
    const snap: DeployStatusSnapshot = {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      deployed_at: null,
      latest_commit: null,
      up_to_date: null,
      state: failedOverride ? 'failed' : 'unknown',
      failed_reason: failedOverride?.reason ?? 'GitHub not configured (GITHUB_TOKEN missing)',
      minutes_since_push: null,
    };
    noteStateTransition(snap.state);
    return snap;
  }

  if (Date.now() < githubBackoffUntil) {
    const snap: DeployStatusSnapshot = {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      deployed_at: null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: githubLastError ?? 'GitHub temporarily unavailable',
      minutes_since_push: null,
    };
    noteStateTransition(snap.state);
    return snap;
  }

  const defRes = await githubGetDefaultBranch();
  if (!defRes.ok) {
    noteGithubError(defRes.error);
    const snap: DeployStatusSnapshot = {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      deployed_at: null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: githubLastError,
      minutes_since_push: null,
    };
    noteStateTransition(snap.state);
    return snap;
  }

  const commitsRes = await githubListCommits({ branch: defRes.data, perPage: 1 });
  if (!commitsRes.ok) {
    noteGithubError(commitsRes.error);
    const snap: DeployStatusSnapshot = {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      deployed_at: null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: githubLastError,
      minutes_since_push: null,
    };
    noteStateTransition(snap.state);
    return snap;
  }

  clearGithubError();
  const latest = commitsRes.data[0] ?? null;
  const upToDate = latest && deployed ? deployed === latest.sha : null;
  const minutesSincePush = !upToDate && latest ? minutesSince(commitPushedAt(latest)) : null;

  let state: DeployState = 'unknown';
  let failedReason: string | null = null;
  if (upToDate) {
    failedOverride = null;
    deployingOverride = null;
    state = 'live';
  } else if (latest) {
    const stale =
      minutesSincePush != null && minutesSincePush * 60_000 >= STALE_AFTER_MS;
    if (stale) {
      state = 'stale';
    } else {
      const failedSha = failedOverride?.failed_sha ?? null;
      if (failedOverride && failedSha && latest.sha === failedSha) {
        state = 'failed';
        failedReason = failedOverride.reason;
      } else {
        state = 'deploying';
        if (failedOverride && failedSha && latest.sha !== failedSha) {
          failedOverride = null;
        }
      }
    }
  } else if (failedOverride) {
    state = 'failed';
    failedReason = failedOverride.reason;
  }

  const deployedAt = await resolveDeployedAt(deployed, latest);

  const snap: DeployStatusSnapshot = {
    on_railway: true,
    deployed_sha: deployed,
    deployed_short: deployed?.slice(0, 7) ?? null,
    deployed_at: deployedAt,
    latest_commit: latest,
    up_to_date: upToDate,
    state,
    failed_reason: failedReason,
    minutes_since_push: minutesSincePush,
  };
  noteStateTransition(snap.state);
  return applyDeployingOverride(snap);
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

  if (snapshot.state === 'stale' && snapshot.latest_commit) {
    const min =
      snapshot.minutes_since_push ?? minutesSince(commitPushedAt(snapshot.latest_commit)) ?? '?';
    return `🔴 Deploy stale: ${snapshot.latest_commit.short_sha} pushed ${min} min ago — not yet live, check Railway logs`;
  }

  if (snapshot.state === 'deploying' && snapshot.latest_commit) {
    const msg = truncateMessage(snapshot.latest_commit.message);
    const bit = msg ? ` "${msg}"` : '';
    return `🚀 Deploying: ${snapshot.latest_commit.short_sha}${bit} — not yet live`;
  }

  if (snapshot.state === 'live' && opts?.includeLive && snapshot.deployed_short) {
    return appendRelativeDeployLine(
      `🟢 Live: ${snapshot.deployed_short} — up to date`,
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

  if (snapshot.state === 'stale' && snapshot.latest_commit) {
    const min =
      snapshot.minutes_since_push ?? minutesSince(commitPushedAt(snapshot.latest_commit)) ?? '?';
    return appendRelativeDeployLine(
      `Deploy stale — ${snapshot.latest_commit.short_sha} pushed ${min} min ago, not live yet. Check Railway logs.`,
      snapshot.deployed_at,
    );
  }

  if (snapshot.state === 'deploying' && snapshot.latest_commit) {
    const msg = truncateMessage(snapshot.latest_commit.message, 48);
    const bit = msg ? `: ${msg}` : '';
    return appendRelativeDeployLine(
      `Deploying ${snapshot.latest_commit.short_sha}${bit} — not live yet`,
      commitPushedAt(snapshot.latest_commit),
      'Pushed',
    );
  }

  if (snapshot.state === 'live' && snapshot.deployed_short) {
    return appendRelativeDeployLine(
      `Live — ${snapshot.deployed_short} up to date`,
      snapshot.deployed_at,
    );
  }

  if (snapshot.state === 'unknown') {
    if (snapshot.failed_reason) {
      return appendRelativeDeployLine(snapshot.failed_reason, snapshot.deployed_at);
    }
    return 'Deploy status unknown — check Railway or GitHub connection';
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

const CHAT_LOCK_STATES = new Set<DeployState>(['deploying', 'stale', 'failed']);

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
  if (snapshot.state === 'stale' && snapshot.latest_commit) {
    const min =
      snapshot.minutes_since_push ?? minutesSince(commitPushedAt(snapshot.latest_commit)) ?? '?';
    return `Deploy stale (${snapshot.latest_commit.short_sha} pushed ${min} min ago) — new messages are paused until the website is live again.`;
  }
  if (snapshot.state === 'deploying' && snapshot.latest_commit) {
    const msg = truncateMessage(snapshot.latest_commit.message, 48);
    const bit = msg ? `: ${msg}` : '';
    return `Deploying ${snapshot.latest_commit.short_sha}${bit} — new messages are paused until the new version is live.`;
  }
  return 'Deploy in progress — new messages are paused until the new version is live.';
}

/** Prepend deploy banner to an agent reply when deploying, stale, failed, or explicitly live. */
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
