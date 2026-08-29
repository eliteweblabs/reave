/**
 * Siri time-tracking helpers — resolve projects from voice and start/stop timers.
 *
 * Multi-project voice UX: list choices as "Project one: … Project two: …"
 * so the user can answer with "one", "two", "three", etc.
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
  elapsedHoursFromStartedAt,
  formatElapsedDuration,
  getActiveTimer,
  setActiveTimer,
  stopActiveTimerAndLog,
} from './activeTimers';

const YES_RE =
  /^(yes|yeah|yep|yup|sure|ok|okay|correct|that's right|that one|go ahead|start|y)$/i;

/** Cap spoken choice lists — Siri replies stay short. */
export const TIME_TRACKING_CHOICE_LIMIT = 5;

const ORDINAL_WORDS: Record<string, number> = {
  one: 1,
  first: 1,
  two: 2,
  second: 2,
  three: 3,
  third: 3,
  four: 4,
  fourth: 4,
  five: 5,
  fifth: 5,
  six: 6,
  sixth: 6,
  seven: 7,
  seventh: 7,
  eight: 8,
  eighth: 8,
  nine: 9,
  ninth: 9,
  ten: 10,
  tenth: 10,
};

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

export type TimerJobView = {
  slug: string;
  title: string;
  client: string;
  label: string;
};

export function jobChoiceView(job: WorkJobSummary): TimerJobView {
  return {
    slug: job.slug,
    title: job.title,
    client: job.client,
    label: projectVoiceLabel(job),
  };
}

/**
 * Parse "3", "three", "project two", "number one", "the third one" → 1-based index.
 * Returns null when the utterance is not a pure choice (so project-name search can run).
 */
export function parseVoiceChoiceIndex(query: string): number | null {
  const raw = query.trim().replace(/[.!?]+$/g, '').toLowerCase();
  if (!raw) return null;

  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 20 ? n : null;
  }

  const stripped = raw
    .replace(/^(project|option|number|choice|pick|select|the)\s+/i, '')
    .replace(/\s+(one|project|option|choice|please)$/i, '')
    .replace(/\s+one$/i, '')
    .trim();

  if (/^\d{1,2}$/.test(stripped)) {
    const n = Number(stripped);
    return n >= 1 && n <= 20 ? n : null;
  }

  const word = stripped.split(/\s+/)[0] ?? '';
  if (ORDINAL_WORDS[word]) return ORDINAL_WORDS[word];

  // "project three" / "the third"
  const projectMatch = raw.match(
    /(?:^|\b)(?:project|option|number|choice)?\s*(one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|\d{1,2})\b/i,
  );
  if (projectMatch) {
    const token = projectMatch[1].toLowerCase();
    if (ORDINAL_WORDS[token]) return ORDINAL_WORDS[token];
    const n = Number(token);
    if (Number.isInteger(n) && n >= 1 && n <= 20) return n;
  }

  return null;
}

const CARDINAL_WORDS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
};

export function formatNumberedProjectChoices(jobs: WorkJobSummary[]): string {
  const lines = jobs.map((job, i) => {
    const n = i + 1;
    const spoken = CARDINAL_WORDS[n] ?? String(n);
    return `Project ${spoken}: ${projectVoiceLabel(job)}.`;
  });

  const howTo =
    jobs.length === 2
      ? 'Say one or two.'
      : `Say a number from one to ${CARDINAL_WORDS[jobs.length] ?? jobs.length}.`;

  return `Which project?\n\n${lines.join('\n')}\n\n${howTo}`;
}

export async function listRecentProjectsForChoices(
  limit = TIME_TRACKING_CHOICE_LIMIT,
): Promise<WorkJobSummary[]> {
  const active = await storeListWork({ status: 'active' });
  const pool = active.length ? active : await storeListWork();
  return sortWorkJobsForSidebar(pool).slice(0, Math.max(1, Math.min(limit, 10)));
}

export async function getMostRecentActiveProject(): Promise<WorkJobSummary | null> {
  const list = await listRecentProjectsForChoices(1);
  return list[0] ?? null;
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

async function findProjectsByVoiceQuery(query: string): Promise<WorkJobSummary[]> {
  const q = query.trim();
  if (!q) return [];

  const slugCandidate = q.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  if (isSafeWorkSlug(slugCandidate)) {
    const bySlug = await storeReadWork(slugCandidate);
    if (bySlug) return [bySlug];
  }

  const fromSearch = await storeListWork({ q });
  const ranked = [...fromSearch].sort(
    (a, b) => scoreProjectMatch(b, q) - scoreProjectMatch(a, q) || compareWorkByRecency(a, b),
  );
  const good = ranked.filter((j) => scoreProjectMatch(j, q) >= 50);
  if (good.length) return good;

  const all = await storeListWork();
  const fallback = [...all]
    .filter((j) => scoreProjectMatch(j, q) >= 50)
    .sort((a, b) => scoreProjectMatch(b, q) - scoreProjectMatch(a, q) || compareWorkByRecency(a, b));
  return fallback;
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
  | { ok: false; error: string; needs_choice?: false }
  | { ok: false; needs_choice: true; text: string; contacts: { uid: string; name: string }[] }
> {
  const q = query.trim();
  if (!q) return { ok: false, error: 'Project name is required' };

  const strict = await findClientStrictForSiri(q);
  if (strict.ok && strict.found) {
    return { ok: true, uid: strict.contact.uid, name: strict.contact.name.trim() };
  }

  if (strict.ok && !strict.found && strict.ambiguous?.length) {
    const contacts = strict.ambiguous.slice(0, TIME_TRACKING_CHOICE_LIMIT).map((c) => ({
      uid: c.uid,
      name: c.name.trim(),
    }));
    if (contacts.length > 1) {
      const lines = contacts.map((c, i) => {
        const spoken = CARDINAL_WORDS[i + 1] ?? String(i + 1);
        return `Client ${spoken}: ${c.name}.`;
      });
      return {
        ok: false,
        needs_choice: true,
        text: `Which client?\n\n${lines.join('\n')}\n\nSay a number.`,
        contacts,
      };
    }
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
    const contacts = search.data.contacts.slice(0, TIME_TRACKING_CHOICE_LIMIT).map((c) => ({
      uid: c.uid,
      name: c.name.trim(),
    }));
    const lines = contacts.map((c, i) => {
      const spoken = CARDINAL_WORDS[i + 1] ?? String(i + 1);
      return `Client ${spoken}: ${c.name}.`;
    });
    return {
      ok: false,
      needs_choice: true,
      text: `Which client?\n\n${lines.join('\n')}\n\nSay a number.`,
      contacts,
    };
  }

  return { ok: false, error: `No client found for "${q}". Add the client first or say the full project name.` };
}

async function createProjectFromVoiceQuery(query: string): Promise<
  | { ok: true; job: WorkJobSummary; created: boolean }
  | { ok: false; error: string }
  | { ok: false; needs_choice: true; text: string; contacts: { uid: string; name: string }[] }
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

/** Parse comma/space-separated slug list from Shortcuts follow-up. */
export function parseCandidateSlugs(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((s) => String(s ?? '').trim().toLowerCase())
      .filter((s) => s && isSafeWorkSlug(s));
  }
  const text = String(raw ?? '').trim();
  if (!text) return [];
  return text
    .split(/[,|\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && isSafeWorkSlug(s));
}

async function jobsFromCandidateSlugs(slugs: string[]): Promise<WorkJobSummary[]> {
  const out: WorkJobSummary[] = [];
  for (const slug of slugs.slice(0, 10)) {
    const job = await storeReadWork(slug);
    if (job) out.push(job);
  }
  return out;
}

export type ResolveProjectResult =
  | { ok: true; job: WorkJobSummary; created: boolean }
  | { ok: false; error: string; text?: string }
  | {
      ok: false;
      needs_choice: true;
      text: string;
      candidates: TimerJobView[];
    };

export async function resolveProjectForTimeTracking(
  query: string,
  suggestedSlug?: string,
  candidateSlugs?: string[],
): Promise<ResolveProjectResult> {
  const q = query.trim();

  if (isAffirmativeVoiceReply(q)) {
    const slug = suggestedSlug?.trim();
    if (slug && isSafeWorkSlug(slug)) {
      const job = await storeReadWork(slug);
      if (job) return { ok: true, job, created: false };
    }
    if (candidateSlugs?.length === 1) {
      const only = await storeReadWork(candidateSlugs[0]);
      if (only) return { ok: true, job: only, created: false };
    }
    const recent = await getMostRecentActiveProject();
    if (!recent) return { ok: false, error: 'No recent project to use. Say a project or client name.' };
    return { ok: true, job: recent, created: false };
  }

  const choiceIndex = parseVoiceChoiceIndex(q);
  if (choiceIndex != null) {
    let pool: WorkJobSummary[] = [];
    if (candidateSlugs?.length) {
      pool = await jobsFromCandidateSlugs(candidateSlugs);
    }
    if (!pool.length) {
      pool = await listRecentProjectsForChoices();
    }
    const picked = pool[choiceIndex - 1];
    if (!picked) {
      return {
        ok: false,
        error: `No project ${choiceIndex}. Say a number from the list, or name a project.`,
        text: `No project ${choiceIndex}. Say a number from the list, or name a project.`,
      };
    }
    return { ok: true, job: picked, created: false };
  }

  const matches = await findProjectsByVoiceQuery(q);
  if (matches.length === 1) return { ok: true, job: matches[0], created: false };
  if (matches.length > 1) {
    const candidates = matches.slice(0, TIME_TRACKING_CHOICE_LIMIT);
    return {
      ok: false,
      needs_choice: true,
      text: formatNumberedProjectChoices(candidates),
      candidates: candidates.map(jobChoiceView),
    };
  }

  const created = await createProjectFromVoiceQuery(q);
  if (!created.ok) {
    if ('needs_choice' in created && created.needs_choice) {
      // Client ambiguity — surface as speakable choice (no project candidates yet).
      return {
        ok: false,
        error: created.text,
        text: created.text,
      };
    }
    const err = 'error' in created ? created.error : 'Could not resolve project';
    return { ok: false, error: err, text: err };
  }
  return { ok: true, job: created.job, created: created.created };
}

export type TimerView = {
  running: boolean;
  timer: {
    job_slug: string;
    started_at: string;
    note: string;
    elapsed: string;
    elapsed_hours: number;
    job: TimerJobView | null;
  } | null;
};

function jobView(job: WorkJobSummary): TimerJobView {
  return jobChoiceView(job);
}

export async function getTimerStatusView(): Promise<TimerView> {
  const running = await getActiveTimer();
  if (!running) return { running: false, timer: null };

  const job = await storeReadWork(running.jobSlug);
  return {
    running: true,
    timer: {
      job_slug: running.jobSlug,
      started_at: running.startedAt,
      note: running.note,
      elapsed: formatElapsedDuration(running.startedAt),
      elapsed_hours: elapsedHoursFromStartedAt(running.startedAt),
      job: job ? jobView(job) : null,
    },
  };
}

export async function startTimeTrackingOnProject(
  job: WorkJobSummary,
  note = '',
): Promise<
  | {
      ok: true;
      text: string;
      timer: { jobSlug: string; startedAt: string };
      switched: boolean;
      previous: { jobSlug: string; hours: number; logged: boolean } | null;
    }
  | { ok: false; error: string }
> {
  const active = await getActiveTimer();
  let switched = false;
  let previous: { jobSlug: string; hours: number; logged: boolean } | null = null;

  if (active) {
    if (active.jobSlug === job.slug) {
      const elapsed = formatElapsedDuration(active.startedAt);
      return {
        ok: true,
        text: `Already tracking time on ${projectVoiceLabel(job)} — ${elapsed}.`,
        timer: { jobSlug: active.jobSlug, startedAt: active.startedAt },
        switched: false,
        previous: null,
      };
    }
    const stopped = await stopActiveTimerAndLog();
    if (!stopped.ok) return stopped;
    previous = { jobSlug: stopped.jobSlug, hours: stopped.hours, logged: stopped.logged };
    switched = true;
  }

  const timer = await setActiveTimer(job.slug, note);
  if ('error' in timer) return { ok: false, error: timer.error };

  const label = projectVoiceLabel(job);
  let prefix = `Tracking time on ${label}.`;
  if (switched && previous) {
    const prevJob = await storeReadWork(previous.jobSlug);
    const prevLabel = prevJob ? projectVoiceLabel(prevJob) : previous.jobSlug;
    if (previous.logged) {
      const hoursLabel = Number.isInteger(previous.hours)
        ? String(previous.hours)
        : previous.hours.toFixed(2);
      prefix = `Logged ${hoursLabel} hours on ${prevLabel}. Tracking ${label}.`;
    } else {
      prefix = `Stopped ${prevLabel}. Tracking ${label}.`;
    }
  }

  return {
    ok: true,
    text: prefix,
    timer: { jobSlug: timer.jobSlug, startedAt: timer.startedAt },
    switched,
    previous,
  };
}

export async function getTimeTrackingPrompt(): Promise<{
  text: string;
  suggested: WorkJobSummary | null;
  candidates: WorkJobSummary[];
  running: Awaited<ReturnType<typeof getActiveTimer>>;
}> {
  const running = await getActiveTimer();
  if (running) {
    const job = await storeReadWork(running.jobSlug);
    const label = job ? projectVoiceLabel(job) : running.jobSlug;
    const elapsed = formatElapsedDuration(running.startedAt);
    return {
      text: `Already tracking time on ${label} — ${elapsed}. Say stop timer to finish, or name a different project.`,
      suggested: job,
      candidates: job ? [job] : [],
      running,
    };
  }

  const candidates = await listRecentProjectsForChoices();
  if (!candidates.length) {
    return {
      text: 'Which project? No recent projects found. Say a client and project name, like Cooper Website.',
      suggested: null,
      candidates: [],
      running: null,
    };
  }

  if (candidates.length === 1) {
    const label = projectVoiceLabel(candidates[0]);
    return {
      text: `Which project? ${label}? Say yes or name a different project.`,
      suggested: candidates[0],
      candidates,
      running: null,
    };
  }

  return {
    text: formatNumberedProjectChoices(candidates),
    suggested: candidates[0],
    candidates,
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
