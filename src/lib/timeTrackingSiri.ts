/**
 * Siri time-tracking helpers — resolve projects from voice and start/stop timers.
 */

import { findClientStrictForSiri, searchClientsEnhanced } from './clientSearch';
import {
  compareWorkByRecency,
  isSafeWorkSlug,
  slugFromTitle,
  sortWorkJobsForSidebar,
  storeListWork,
  storeReadWork,
  storeWriteWork,
  type WorkJobSummary,
} from './workStore';
import {
  clearActiveTimer,
  formatElapsedDuration,
  getActiveTimer,
  setActiveTimer,
  stopActiveTimerAndLog,
} from './activeTimers';

const YES_RE =
  /^(yes|yeah|yep|yup|sure|ok|okay|correct|that's right|that one|go ahead|start|y)$/i;

export function isAffirmativeVoiceReply(query: string): boolean {
  const normalized = query.trim().replace(/[.!?]+$/g, '');
  return YES_RE.test(normalized);
}

export function projectVoiceLabel(job: WorkJobSummary): string {
  if (job.client && job.client !== job.title) {
    return `${job.title} for ${job.client}`;
  }
  return job.title;
}

export async function getMostRecentActiveProject(): Promise<WorkJobSummary | null> {
  const active = await storeListWork({ status: 'active' });
  if (active.length) return sortWorkJobsForSidebar(active)[0] ?? null;

  const all = await storeListWork();
  if (!all.length) return null;
  return sortWorkJobsForSidebar(all)[0] ?? null;
}

function scoreProjectMatch(job: WorkJobSummary, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const slug = job.slug.toLowerCase();
  const title = job.title.toLowerCase();
  const client = job.client.toLowerCase();
  const haystack = `${title} ${client} ${slug}`;

  if (slug === q) return 100;
  if (title === q) return 95;
  if (`${client} ${title}` === q || `${title} ${client}` === q) return 90;
  if (haystack.includes(q)) return 70;

  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const matched = words.filter((w) => haystack.includes(w)).length;
  if (matched === words.length) return 50 + matched;
  return 0;
}

async function findProjectByVoiceQuery(query: string): Promise<WorkJobSummary | null> {
  const q = query.trim();
  if (!q) return null;

  const slugCandidate = q.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  if (isSafeWorkSlug(slugCandidate)) {
    const bySlug = await storeReadWork(slugCandidate);
    if (bySlug) return bySlug;
  }

  const fromSearch = await storeListWork({ q });
  const ranked = [...fromSearch].sort(
    (a, b) => scoreProjectMatch(b, q) - scoreProjectMatch(a, q) || compareWorkByRecency(a, b),
  );
  if (ranked[0] && scoreProjectMatch(ranked[0], q) >= 50) return ranked[0];

  const all = await storeListWork();
  const fallback = [...all].sort(
    (a, b) => scoreProjectMatch(b, q) - scoreProjectMatch(a, q) || compareWorkByRecency(a, b),
  );
  if (fallback[0] && scoreProjectMatch(fallback[0], q) >= 50) return fallback[0];

  return null;
}

function titleCaseWords(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function resolveClientFromQuery(query: string): Promise<
  | { ok: true; uid: string; name: string }
  | { ok: false; error: string }
> {
  const q = query.trim();
  if (!q) return { ok: false, error: 'Project name is required' };

  const strict = await findClientStrictForSiri(q);
  if (strict.ok && strict.found) {
    return { ok: true, uid: strict.contact.uid, name: strict.contact.name.trim() };
  }

  const words = q.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (word.length < 3) continue;
    const byWord = await findClientStrictForSiri(word);
    if (byWord.ok && byWord.found) {
      return { ok: true, uid: byWord.contact.uid, name: byWord.contact.name.trim() };
    }
  }

  const search = await searchClientsEnhanced(q, 5);
  if (search.ok && search.data.contacts.length === 1) {
    const contact = search.data.contacts[0];
    return { ok: true, uid: contact.uid, name: contact.name.trim() };
  }

  if (search.ok && search.data.contacts.length > 1) {
    const names = search.data.contacts.map((c) => c.name).join(', ');
    return { ok: false, error: `Multiple contacts match "${q}": ${names}. Please be more specific.` };
  }

  return { ok: false, error: `No client found for "${q}". Add the client first or say the full project name.` };
}

async function createProjectFromVoiceQuery(query: string): Promise<
  | { ok: true; job: WorkJobSummary; created: boolean }
  | { ok: false; error: string }
> {
  const client = await resolveClientFromQuery(query);
  if (!client.ok) return client;

  const title = titleCaseWords(query);
  const slug = slugFromTitle(title);
  if (!slug || !isSafeWorkSlug(slug)) {
    return { ok: false, error: 'Could not derive a project slug from that name' };
  }

  const existing = await storeReadWork(slug);
  if (existing) return { ok: true, job: existing, created: false };

  let attempt = slug;
  let suffix = 2;
  while (await storeReadWork(attempt)) {
    attempt = `${slug}-${suffix}`;
    suffix += 1;
    if (suffix > 20) return { ok: false, error: 'Could not create a unique project slug' };
  }

  const result = await storeWriteWork(attempt, {
    title,
    contact_uid: client.uid,
    contact_name: client.name,
    client: client.name,
    status: 'active',
    record_origin: 'siri',
    body: 'Created from Siri time tracking.',
  });
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, job: result.doc, created: true };
}

export async function resolveProjectForTimeTracking(
  query: string,
  suggestedSlug?: string,
): Promise<
  | { ok: true; job: WorkJobSummary; created: boolean }
  | { ok: false; error: string }
> {
  const q = query.trim();

  if (isAffirmativeVoiceReply(q)) {
    const slug = suggestedSlug?.trim();
    if (slug && isSafeWorkSlug(slug)) {
      const job = await storeReadWork(slug);
      if (job) return { ok: true, job, created: false };
    }
    const recent = await getMostRecentActiveProject();
    if (!recent) return { ok: false, error: 'No recent project to use. Say a project or client name.' };
    return { ok: true, job: recent, created: false };
  }

  const existing = await findProjectByVoiceQuery(q);
  if (existing) return { ok: true, job: existing, created: false };

  const created = await createProjectFromVoiceQuery(q);
  if (!created.ok) return created;
  return { ok: true, job: created.job, created: created.created };
}

export async function startTimeTrackingOnProject(
  job: WorkJobSummary,
): Promise<
  | { ok: true; text: string; timer: { jobSlug: string; startedAt: string }; switched: boolean }
  | { ok: false; error: string }
> {
  const active = await getActiveTimer();
  let switched = false;

  if (active) {
    if (active.jobSlug === job.slug) {
      const elapsed = formatElapsedDuration(active.startedAt);
      return {
        ok: true,
        text: `Already tracking time on ${projectVoiceLabel(job)} — ${elapsed}.`,
        timer: { jobSlug: active.jobSlug, startedAt: active.startedAt },
        switched: false,
      };
    }
    await clearActiveTimer();
    switched = true;
  }

  const timer = await setActiveTimer(job.slug);
  if ('error' in timer) return { ok: false, error: timer.error };

  const prefix = switched ? `Switched to ${projectVoiceLabel(job)}.` : `Tracking time on ${projectVoiceLabel(job)}.`;
  return {
    ok: true,
    text: prefix,
    timer: { jobSlug: timer.jobSlug, startedAt: timer.startedAt },
    switched,
  };
}

export async function getTimeTrackingPrompt(): Promise<{
  text: string;
  suggested: WorkJobSummary | null;
  running: Awaited<ReturnType<typeof getActiveTimer>>;
}> {
  const running = await getActiveTimer();
  if (running) {
    const job = await storeReadWork(running.jobSlug);
    const label = job ? projectVoiceLabel(job) : running.jobSlug;
    const elapsed = formatElapsedDuration(running.startedAt);
    return {
      text: `Already tracking time on ${label} — ${elapsed}. Say stop time tracking to finish, or name a different project.`,
      suggested: job,
      running,
    };
  }

  const recent = await getMostRecentActiveProject();
  if (!recent) {
    return {
      text: 'Which project? No recent projects found. Say a client and project name, like Cooper Website.',
      suggested: null,
      running: null,
    };
  }

  const label = projectVoiceLabel(recent);
  return {
    text: `Which project? ${label}? Say yes or name a different project.`,
    suggested: recent,
    running: null,
  };
}

export async function stopTimeTrackingWithMessage(): Promise<
  | { ok: true; text: string; hours: number; logged: boolean; jobSlug: string }
  | { ok: false; error: string; text?: string }
> {
  const timer = await getActiveTimer();
  if (!timer) {
    return { ok: false, error: 'No timer is running', text: 'No timer is running.' };
  }

  const job = await storeReadWork(timer.jobSlug);
  const label = job ? projectVoiceLabel(job) : timer.jobSlug;

  const result = await stopActiveTimerAndLog();
  if (!result.ok) return result;

  if (!result.logged) {
    return {
      ok: true,
      text: `Stopped tracking on ${label} after ${result.elapsedLabel}. Less than a minute — not logged.`,
      hours: 0,
      logged: false,
      jobSlug: result.jobSlug,
    };
  }

  const hoursLabel = Number.isInteger(result.hours) ? String(result.hours) : result.hours.toFixed(2);
  return {
    ok: true,
    text: `Stopped tracking on ${label}. Logged ${hoursLabel} hours.`,
    hours: result.hours,
    logged: true,
    jobSlug: result.jobSlug,
  };
}
