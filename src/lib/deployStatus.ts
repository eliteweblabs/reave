/**
 * Railway deploy vs GitHub latest — cached for Telegram banners and pinned status.
 */

import { serverEnv } from './serverEnv';
import {
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
  latest_commit: GithubCommit | null;
  up_to_date: boolean | null;
  state: DeployState;
  failed_reason: string | null;
  /** Minutes since latest GitHub commit was pushed (when behind deploy). */
  minutes_since_push: number | null;
};

const CACHE_MS = 60_000;
const STALE_AFTER_MS = 10 * 60_000;

let cache: { at: number; data: DeployStatusSnapshot | null } = { at: 0, data: null };
let failedOverride: { reason: string; until: number } | null = null;
let previousState: DeployState | null = null;
let showLiveBannerOnce = false;

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

function noteStateTransition(state: DeployState): void {
  if ((previousState === 'deploying' || previousState === 'stale') && state === 'live') {
    showLiveBannerOnce = true;
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

/** Called from Railway deploy-failure webhook — surfaces until live again or TTL. */
export function markDeployFailed(reason?: string): void {
  failedOverride = {
    reason: reason?.trim() || 'Deploy failed — check Railway logs',
    until: Date.now() + 30 * 60_000,
  };
  cache = { at: 0, data: null };
}

async function fetchDeployStatusUncached(): Promise<DeployStatusSnapshot> {
  const deployed = deployedSha() ?? null;
  const onRailway = Boolean(deployed);

  if (failedOverride && Date.now() > failedOverride.until) {
    failedOverride = null;
  }

  if (!onRailway) {
    return {
      on_railway: false,
      deployed_sha: null,
      deployed_short: null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: null,
      minutes_since_push: null,
    };
  }

  if (failedOverride) {
    const snap: DeployStatusSnapshot = {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      latest_commit: null,
      up_to_date: false,
      state: 'failed',
      failed_reason: failedOverride.reason,
      minutes_since_push: null,
    };
    noteStateTransition(snap.state);
    return snap;
  }

  if (!isGithubConfigured()) {
    const snap: DeployStatusSnapshot = {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: null,
      minutes_since_push: null,
    };
    noteStateTransition(snap.state);
    return snap;
  }

  const defRes = await githubGetDefaultBranch();
  if (!defRes.ok) {
    const snap: DeployStatusSnapshot = {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: null,
      minutes_since_push: null,
    };
    noteStateTransition(snap.state);
    return snap;
  }

  const commitsRes = await githubListCommits({ branch: defRes.data, perPage: 1 });
  const latest = commitsRes.ok ? (commitsRes.data[0] ?? null) : null;
  const upToDate = latest && deployed ? deployed === latest.sha : null;
  const minutesSincePush = !upToDate && latest ? minutesSince(latest.date) : null;

  if (upToDate) {
    failedOverride = null;
  }

  let state: DeployState = 'unknown';
  if (upToDate) {
    state = 'live';
  } else if (latest) {
    const stale =
      minutesSincePush != null && minutesSincePush * 60_000 >= STALE_AFTER_MS;
    state = stale ? 'stale' : 'deploying';
  }

  const snap: DeployStatusSnapshot = {
    on_railway: true,
    deployed_sha: deployed,
    deployed_short: deployed?.slice(0, 7) ?? null,
    latest_commit: latest,
    up_to_date: upToDate,
    state,
    failed_reason: null,
    minutes_since_push: minutesSincePush,
  };
  noteStateTransition(snap.state);
  return snap;
}

/** Cached deploy snapshot (60s). Returns null when not running on Railway. */
export async function getDeployStatus(): Promise<DeployStatusSnapshot | null> {
  const now = Date.now();
  if (now - cache.at < CACHE_MS && cache.data !== null) {
    return cache.data.on_railway ? cache.data : null;
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
    const min = snapshot.minutes_since_push ?? minutesSince(snapshot.latest_commit.date) ?? '?';
    return `🔴 Deploy stale: ${snapshot.latest_commit.short_sha} pushed ${min} min ago — not yet live, check Railway logs`;
  }

  if (snapshot.state === 'deploying' && snapshot.latest_commit) {
    const msg = truncateMessage(snapshot.latest_commit.message);
    const bit = msg ? ` "${msg}"` : '';
    return `🚀 Deploying: ${snapshot.latest_commit.short_sha}${bit} — not yet live`;
  }

  if (snapshot.state === 'live' && opts?.includeLive && snapshot.deployed_short) {
    return `🟢 Live: ${snapshot.deployed_short} — up to date`;
  }

  return null;
}

/** Text for pinned deploy-status message. */
export function deployPinText(snapshot: DeployStatusSnapshot): string {
  if (snapshot.state === 'failed') {
    const lines = [`🔴 Deploy failed — check Railway logs`];
    if (snapshot.failed_reason && !snapshot.failed_reason.startsWith('Deploy failed')) {
      lines[0] = `🔴 ${snapshot.failed_reason}`;
    }
    if (snapshot.deployed_short) lines.push(`Running: ${snapshot.deployed_short}`);
    return lines.join('\n');
  }

  if (snapshot.state === 'live') {
    const age = relativeAge(snapshot.latest_commit?.date);
    const lines = [`🟢 Live — ${snapshot.deployed_short ?? '?'} — up to date`];
    if (age) lines.push(`Latest commit pushed ${age}`);
    return lines.join('\n');
  }

  if (snapshot.state === 'stale' && snapshot.latest_commit) {
    const min = snapshot.minutes_since_push ?? minutesSince(snapshot.latest_commit.date) ?? '?';
    const msg = truncateMessage(snapshot.latest_commit.message, 80);
    const lines = [
      `🔴 Deploy stale — check Railway logs`,
      `${snapshot.latest_commit.short_sha}${msg ? ` "${msg}"` : ''} — pushed ${min} min ago, not live`,
    ];
    if (snapshot.deployed_short) lines.push(`Currently running: ${snapshot.deployed_short}`);
    return lines.join('\n');
  }

  if (snapshot.state === 'deploying' && snapshot.latest_commit) {
    const msg = truncateMessage(snapshot.latest_commit.message, 80);
    const age = relativeAge(snapshot.latest_commit.date);
    const lines = [
      `🚀 Building — ${snapshot.latest_commit.short_sha}${msg ? ` "${msg}"` : ''}`,
      'Not live yet on Railway.',
    ];
    if (snapshot.deployed_short) lines.push(`Currently running: ${snapshot.deployed_short}`);
    if (age) lines.push(`Pushed ${age}`);
    return lines.join('\n');
  }

  const lines = ['Status unknown (GitHub or deploy SHA unavailable)'];
  if (snapshot.deployed_short) lines.push(`Running: ${snapshot.deployed_short}`);
  return lines.join('\n');
}

export async function getDeployBanner(opts?: { includeLive?: boolean }): Promise<string | null> {
  const status = await getDeployStatus();
  if (!status) return null;
  return deployBanner(status, opts);
}

export async function getDeployPinText(): Promise<string | null> {
  const status = await getDeployStatus();
  if (!status) return null;
  return deployPinText(status);
}

const BANNER_PREFIXES = ['🚀 Deploying:', '🟢 Live:', '🔴 Deploy stale:', '🔴 Deploy failed', '🔴 '];

function alreadyHasBanner(text: string): boolean {
  return BANNER_PREFIXES.some((p) => text.startsWith(p));
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
