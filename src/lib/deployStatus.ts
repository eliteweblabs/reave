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

export type DeployState = 'live' | 'deploying' | 'failed' | 'unknown';

export type DeployStatusSnapshot = {
  on_railway: boolean;
  deployed_sha: string | null;
  deployed_short: string | null;
  latest_commit: GithubCommit | null;
  up_to_date: boolean | null;
  state: DeployState;
  failed_reason: string | null;
};

const CACHE_MS = 60_000;
let cache: { at: number; data: DeployStatusSnapshot | null } = { at: 0, data: null };
let failedOverride: { reason: string; until: number } | null = null;

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
    };
  }

  if (failedOverride) {
    return {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      latest_commit: null,
      up_to_date: false,
      state: 'failed',
      failed_reason: failedOverride.reason,
    };
  }

  if (!isGithubConfigured()) {
    return {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: null,
    };
  }

  const defRes = await githubGetDefaultBranch();
  if (!defRes.ok) {
    return {
      on_railway: true,
      deployed_sha: deployed,
      deployed_short: deployed?.slice(0, 7) ?? null,
      latest_commit: null,
      up_to_date: null,
      state: 'unknown',
      failed_reason: null,
    };
  }

  const commitsRes = await githubListCommits({ branch: defRes.data, perPage: 1 });
  const latest = commitsRes.ok ? (commitsRes.data[0] ?? null) : null;
  const upToDate = latest && deployed ? deployed === latest.sha : null;

  if (upToDate) {
    failedOverride = null;
  }

  return {
    on_railway: true,
    deployed_sha: deployed,
    deployed_short: deployed?.slice(0, 7) ?? null,
    latest_commit: latest,
    up_to_date: upToDate,
    state: upToDate ? 'live' : latest ? 'deploying' : 'unknown',
    failed_reason: null,
  };
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

/** One-line header for agent replies (Option A). */
export function deployBanner(snapshot: DeployStatusSnapshot): string | null {
  if (snapshot.state === 'failed') {
    return `🔴 ${snapshot.failed_reason ?? 'Deploy failed — check Railway logs'}`;
  }
  if (snapshot.state === 'live' && snapshot.deployed_short) {
    return `✅ Live: ${snapshot.deployed_short} — up to date`;
  }
  if (snapshot.state === 'deploying' && snapshot.latest_commit) {
    const msg = truncateMessage(snapshot.latest_commit.message);
    const bit = msg ? ` "${msg}"` : '';
    return `🔨 Deploying: ${snapshot.latest_commit.short_sha}${bit} — not yet live`;
  }
  return null;
}

/** Multi-line text for pinned status message (Option C). */
export function deployPinText(snapshot: DeployStatusSnapshot): string {
  const lines = ['Reave deploy status', ''];

  if (snapshot.state === 'failed') {
    lines.push(`🔴 ${snapshot.failed_reason ?? 'Deploy failed — check Railway logs'}`);
    if (snapshot.deployed_short) lines.push(`Running: ${snapshot.deployed_short}`);
    return lines.join('\n');
  }

  if (snapshot.state === 'live') {
    const age = relativeAge(snapshot.latest_commit?.date);
    lines.push(`🟢 Live — ${snapshot.deployed_short ?? '?'} — up to date`);
    if (age) lines.push(`Latest commit pushed ${age}`);
    return lines.join('\n');
  }

  if (snapshot.state === 'deploying' && snapshot.latest_commit) {
    const msg = truncateMessage(snapshot.latest_commit.message, 80);
    const age = relativeAge(snapshot.latest_commit.date);
    lines.push(`🟡 Building — ${snapshot.latest_commit.short_sha}${msg ? ` "${msg}"` : ''}`);
    lines.push('Not live yet on Railway.');
    if (snapshot.deployed_short) lines.push(`Currently running: ${snapshot.deployed_short}`);
    if (age) lines.push(`Pushed ${age}`);
    return lines.join('\n');
  }

  lines.push('🟡 Status unknown (GitHub or deploy SHA unavailable)');
  if (snapshot.deployed_short) lines.push(`Running: ${snapshot.deployed_short}`);
  return lines.join('\n');
}

export async function getDeployBanner(): Promise<string | null> {
  const status = await getDeployStatus();
  if (!status) return null;
  return deployBanner(status);
}

export async function getDeployPinText(): Promise<string | null> {
  const status = await getDeployStatus();
  if (!status) return null;
  return deployPinText(status);
}

/** Prepend banner to an agent reply when on Railway. */
export async function prependDeployBanner(text: string): Promise<string> {
  const banner = await getDeployBanner();
  if (!banner) return text;
  if (text.startsWith(banner) || text.startsWith('✅ Live:') || text.startsWith('🔨 Deploying:') || text.startsWith('🔴')) {
    return text;
  }
  return `${banner}\n\n${text}`;
}
