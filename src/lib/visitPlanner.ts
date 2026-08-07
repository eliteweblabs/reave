/**
 * Door-knock route planner for inquiries.
 *
 * Turns the open inquiry list into a day-by-day walking/driving plan for a
 * fixed amount of time per day, respecting each business's opening hours and
 * keeping each day geographically tight.
 *
 * The shape of the problem: there are far more inquiries than fit into a couple
 * of hours a day, so this is a selection problem as much as a routing one. The
 * planner clusters by location, schedules each cluster into one day, and
 * reports what did not fit rather than silently dropping it.
 */

import {
  formatDayHours,
  formatMinutes,
  hasAnyHours,
  openWindowsWithin,
  parseHoursText,
  WEEKDAY_LABELS,
  type BusinessHours,
  type HoursInterval,
} from './businessHours';
import type { WorkJobSummary } from './workStore';

// Contact/geo modules are imported lazily inside the data-gathering functions so
// the scheduling core stays free of I/O and can be exercised on its own.

// ---------------------------------------------------------------------------
// Options + result types
// ---------------------------------------------------------------------------

export type VisitPlanOptions = {
  /** First day of the plan, `YYYY-MM-DD`. Defaults to the coming Monday. */
  startDate?: string;
  /** How many consecutive dated days to plan. Default 5 (Mon–Fri). */
  dayCount?: number;
  /** Minutes of field time per day, travel included. Default 120. */
  minutesPerDay?: number;
  /** Minutes spent at each stop. Default 12. */
  visitMinutes?: number;
  /** Earliest minute past midnight a day may start. Default 9:00. */
  dayStartMinutes?: number;
  /** Latest minute past midnight a day may end. Default 17:00. */
  dayEndMinutes?: number;
  /** Longest acceptable idle wait for a business to open, in minutes. Default 15. */
  maxWaitMinutes?: number;
  /** Average driving speed for travel estimates, mph. Default 26. */
  averageSpeedMph?: number;
  /** Skip weekend days when stepping through dates. Default true. */
  skipWeekends?: boolean;
  /** Trip origin. Falls back to the company/office address. */
  origin?: { lat: number; lng: number; label?: string } | null;
  /** Treat businesses with unknown hours as visitable during a default window. */
  assumeHoursWhenUnknown?: boolean;
};

export type VisitCandidate = {
  slug: string;
  uid: string;
  /** Business name. */
  name: string;
  title: string;
  address: string;
  /** "Somerville, MA" when parseable from the address. */
  area: string;
  lat: number | null;
  lng: number | null;
  hours: BusinessHours | null;
  /** True when hours are assumed rather than known. */
  hoursAssumed: boolean;
  phone: string;
  website: string;
  priorityScore: number;
  scoreReasons: string[];
  tags: string[];
  created: string;
};

export type VisitStop = {
  slug: string;
  uid: string;
  name: string;
  address: string;
  area: string;
  lat: number;
  lng: number;
  phone: string;
  website: string;
  /** Minutes past midnight. */
  arriveMinutes: number;
  departMinutes: number;
  arriveLabel: string;
  departLabel: string;
  travelMinutesFromPrev: number;
  travelMilesFromPrev: number;
  waitMinutes: number;
  hoursLabel: string;
  hoursAssumed: boolean;
  priorityScore: number;
  scoreReasons: string[];
};

export type VisitDay = {
  date: string;
  weekday: number;
  weekdayLabel: string;
  /** "Mon, Aug 10" */
  dateLabel: string;
  /** Dominant area(s) for the day, for at-a-glance scanning. */
  areaLabel: string;
  stops: VisitStop[];
  startMinutes: number | null;
  endMinutes: number | null;
  startLabel: string;
  endLabel: string;
  travelMinutes: number;
  travelMiles: number;
  onSiteMinutes: number;
  totalMinutes: number;
  budgetMinutes: number;
};

export type VisitPlanBlocker = {
  slug: string;
  uid: string;
  name: string;
  /** Why this inquiry could not be routed or scheduled. */
  reason: string;
};

export type VisitPlan = {
  startDate: string;
  days: VisitDay[];
  /** Routable candidates that did not fit the week, best-first. */
  unscheduled: VisitCandidate[];
  /** Inquiries missing the data needed to route them. */
  missingLocation: VisitPlanBlocker[];
  /** Routable inquiries with no known hours. */
  missingHours: VisitPlanBlocker[];
  origin: { lat: number; lng: number; label: string } | null;
  stats: {
    inquiriesConsidered: number;
    routable: number;
    scheduled: number;
    unscheduled: number;
    missingLocation: number;
    missingHours: number;
    totalTravelMiles: number;
    totalMinutes: number;
  };
  /** Non-fatal problems worth surfacing (unconfigured contact API, no origin…). */
  warnings: string[];
  options: Required<
    Pick<
      VisitPlanOptions,
      | 'dayCount'
      | 'minutesPerDay'
      | 'visitMinutes'
      | 'dayStartMinutes'
      | 'dayEndMinutes'
      | 'maxWaitMinutes'
      | 'averageSpeedMph'
      | 'assumeHoursWhenUnknown'
      | 'skipWeekends'
    >
  >;
};

const DEFAULTS = {
  dayCount: 5,
  minutesPerDay: 120,
  visitMinutes: 12,
  dayStartMinutes: 9 * 60,
  dayEndMinutes: 17 * 60,
  maxWaitMinutes: 15,
  averageSpeedMph: 26,
  assumeHoursWhenUnknown: true,
  skipWeekends: true,
} as const;

/** Weekday window used when a business's real hours are unknown. */
const ASSUMED_WINDOW: HoursInterval = { start: 10 * 60, end: 16 * 60 };

/** Straight-line miles get inflated by this to approximate road distance. */
const ROAD_DETOUR_FACTOR = 1.35;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The next Monday strictly after `from` (or `from` itself when it is Monday). */
export function nextMondayIso(from: Date = new Date()): string {
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const day = base.getUTCDay();
  const delta = day === 1 ? 0 : (8 - day) % 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return isoDate(base);
}

function formatDateLabel(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()]}, ${month} ${date.getUTCDate()}`;
}

/** `dayCount` dated days starting at `startDate`, optionally skipping weekends. */
function planDates(startDate: string, dayCount: number, skipWeekends: boolean): Date[] {
  const dates: Date[] = [];
  const cursor = utcDate(startDate);
  let guard = 0;
  while (dates.length < dayCount && guard < dayCount * 3 + 14) {
    const weekday = cursor.getUTCDay();
    if (!skipWeekends || (weekday !== 0 && weekday !== 6)) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle miles between two coordinates. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function roadMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMiles(a, b) * ROAD_DETOUR_FACTOR;
}

/**
 * Travel minutes between two points. Deliberately an estimate: routing 70
 * inquiries through a directions API on every plan render would be dozens of
 * billable calls for a number that only needs to be roughly right.
 */
function travelMinutes(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  speedMph: number,
): number {
  const miles = roadMiles(a, b);
  if (miles < 0.15) return 1;
  const minutes = (miles / Math.max(speedMph, 5)) * 60;
  // Every hop costs some parking / walk-up overhead.
  return Math.max(2, Math.round(minutes + 2));
}

// ---------------------------------------------------------------------------
// Candidate assembly
// ---------------------------------------------------------------------------

const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 30,
  high: 22,
  normal: 12,
  low: 4,
};

function scoreCandidate(job: WorkJobSummary): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const priority = String(job.priority ?? 'normal').toLowerCase();
  const priorityPoints = PRIORITY_WEIGHT[priority] ?? PRIORITY_WEIGHT.normal!;
  score += priorityPoints;
  if (priority === 'urgent' || priority === 'high') reasons.push(`${priority} priority`);

  const value = Number(job.value);
  if (Number.isFinite(value) && value > 0) {
    score += Math.min(25, Math.round(value / 400));
    reasons.push(`$${Math.round(value).toLocaleString()} est. value`);
  }

  const created = Date.parse(job.created ?? '');
  if (Number.isFinite(created)) {
    const ageDays = (Date.now() - created) / 86_400_000;
    if (ageDays <= 7) {
      score += 20;
      reasons.push('audited this week');
    } else if (ageDays <= 21) {
      score += 12;
      reasons.push('audited recently');
    } else if (ageDays <= 60) {
      score += 6;
    } else {
      reasons.push('going stale');
    }
  }

  const tags = (job.tags ?? []).map((t) => String(t).toLowerCase());
  if (tags.includes('full-audit')) {
    score += 10;
    reasons.push('full audit on file');
  }

  return { score, reasons };
}

/** Run an async mapper over items with bounded concurrency. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(Math.max(limit, 1), items.length || 1))
    .fill(null)
    .map(async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await fn(items[index]!, index);
      }
    });
  await Promise.all(workers);
  return results;
}

/**
 * Join inquiries with their contact's address, coordinates and hours.
 *
 * Hours come from the normalized `portal.hours` when present, and fall back to
 * parsing the legacy free-text `Hours` field so a plan is still possible before
 * the Places backfill has run.
 */
export async function buildVisitCandidates(jobs: WorkJobSummary[]): Promise<VisitCandidate[]> {
  const { extractPortal, getContact, isContactApiConfigured } = await import('./contactApi');
  const { hoursFieldText } = await import('./contactHoursFromPlaces');
  const { parseUsAddressLocation } = await import('./mapbox');

  const withUid = jobs.filter((job) => String(job.contact_uid ?? '').trim());
  const uids = [...new Set(withUid.map((job) => job.contact_uid.trim()))];

  const contactByUid = new Map<string, Awaited<ReturnType<typeof getContact>>>();
  if (isContactApiConfigured()) {
    const fetched = await mapLimit(uids, 6, async (uid) => ({ uid, res: await getContact(uid) }));
    for (const entry of fetched) contactByUid.set(entry.uid, entry.res);
  }

  const candidates: VisitCandidate[] = [];

  for (const job of withUid) {
    const uid = job.contact_uid.trim();
    const res = contactByUid.get(uid);
    const contact = res?.ok ? res.data : null;
    const portal = contact ? extractPortal(contact) : null;

    let hours = portal?.hours ?? null;
    if (!hasAnyHours(hours)) hours = parseHoursText(hoursFieldText(portal));

    const hoursAssumed = !hasAnyHours(hours);
    const address = String(portal?.address ?? '').trim();
    const parsedArea = address ? parseUsAddressLocation(address) : null;
    const { score, reasons } = scoreCandidate(job);

    candidates.push({
      slug: job.slug,
      uid,
      name: String(contact?.company ?? '').trim() || job.client || job.contact_name || uid,
      title: job.title,
      address,
      area: parsedArea ? `${parsedArea.city}, ${parsedArea.state}` : '',
      lat: Number.isFinite(portal?.geo?.lat) ? Number(portal!.geo!.lat) : null,
      lng: Number.isFinite(portal?.geo?.lng) ? Number(portal!.geo!.lng) : null,
      hours: hoursAssumed ? null : hours,
      hoursAssumed,
      phone: String(contact?.phone ?? '').trim(),
      website: String(portal?.website ?? '').trim(),
      priorityScore: score,
      scoreReasons: reasons,
      tags: job.tags ?? [],
      created: job.created,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

type Point = { lat: number; lng: number };
type Routable = VisitCandidate & { lat: number; lng: number };

/**
 * Project lat/lng to a local flat plane in miles so clustering treats a mile of
 * longitude the same as a mile of latitude.
 */
function projector(points: Point[]): (p: Point) => { x: number; y: number } {
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / (points.length || 1);
  const lngScale = Math.cos(toRadians(meanLat));
  return (p) => ({
    x: p.lng * lngScale * 69.172,
    y: p.lat * 69.172,
  });
}

/** Deterministic PRNG so the same inquiry set always yields the same plan. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/**
 * k-means with k-means++ seeding over the flat projection.
 *
 * Returns cluster index per input point. Small k and small n here, so plain
 * Lloyd iterations are plenty.
 */
function kMeansClusters(points: Point[], k: number, seed = 7): number[] {
  const n = points.length;
  const clusterCount = Math.max(1, Math.min(k, n));
  if (n === 0) return [];
  if (clusterCount === 1) return new Array(n).fill(0);

  const project = projector(points);
  const flat = points.map(project);
  const random = seededRandom(seed);

  const centroids: { x: number; y: number }[] = [flat[Math.floor(random() * n) % n]!];
  while (centroids.length < clusterCount) {
    const distances = flat.map((p) => {
      let best = Infinity;
      for (const c of centroids) {
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < best) best = d;
      }
      return best;
    });
    const total = distances.reduce((sum, d) => sum + d, 0);
    if (total <= 0) {
      centroids.push(flat[centroids.length % n]!);
      continue;
    }
    let threshold = random() * total;
    let picked = flat.length - 1;
    for (let i = 0; i < distances.length; i += 1) {
      threshold -= distances[i]!;
      if (threshold <= 0) {
        picked = i;
        break;
      }
    }
    centroids.push(flat[picked]!);
  }

  const assignment = new Array(n).fill(0);
  for (let iteration = 0; iteration < 50; iteration += 1) {
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = (flat[i]!.x - centroids[c]!.x) ** 2 + (flat[i]!.y - centroids[c]!.y) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        moved = true;
      }
    }

    for (let c = 0; c < centroids.length; c += 1) {
      const members = flat.filter((_, i) => assignment[i] === c);
      if (!members.length) continue;
      centroids[c] = {
        x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
        y: members.reduce((sum, p) => sum + p.y, 0) / members.length,
      };
    }

    if (!moved) break;
  }

  return assignment;
}

function centroidOf(points: Point[]): Point {
  if (!points.length) return { lat: 0, lng: 0 };
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/** Open windows for a candidate on a weekday, honoring the assumed fallback. */
function windowsFor(
  candidate: VisitCandidate,
  weekday: number,
  dayWindow: HoursInterval,
  assumeWhenUnknown: boolean,
): HoursInterval[] {
  if (candidate.hoursAssumed || !hasAnyHours(candidate.hours)) {
    if (!assumeWhenUnknown) return [];
    const start = Math.max(dayWindow.start, ASSUMED_WINDOW.start);
    const end = Math.min(dayWindow.end, ASSUMED_WINDOW.end);
    return end > start ? [{ start, end }] : [];
  }
  return openWindowsWithin(candidate.hours, weekday, dayWindow);
}

/** Earliest minute ≥ `notBefore` inside any open window, or null. */
function earliestEntry(
  windows: HoursInterval[],
  notBefore: number,
  visitMinutes: number,
): number | null {
  let best: number | null = null;
  for (const window of windows) {
    const start = Math.max(window.start, notBefore);
    if (start + visitMinutes > window.end) continue;
    if (best == null || start < best) best = start;
  }
  return best;
}

type DayContext = {
  date: Date;
  weekday: number;
  window: HoursInterval;
};

type ScheduleResult = { stops: VisitStop[]; used: Set<string> };

/**
 * Greedily build one day's route.
 *
 * At each step it picks the candidate that costs the least time to add (drive
 * time plus any wait for the door to open), lightly discounted by how valuable
 * the inquiry is. Choosing by cost-to-add rather than pre-computing an order is
 * what lets opening hours steer the route instead of breaking it.
 */
function scheduleDay(
  candidates: Routable[],
  day: DayContext,
  origin: Point | null,
  options: Required<
    Pick<
      VisitPlanOptions,
      'minutesPerDay' | 'visitMinutes' | 'maxWaitMinutes' | 'averageSpeedMph' | 'assumeHoursWhenUnknown'
    >
  >,
): ScheduleResult {
  const stops: VisitStop[] = [];
  const used = new Set<string>();
  const remaining = [...candidates];

  let position: Point | null = origin;
  let clock = day.window.start;
  let spent = 0;

  for (;;) {
    let bestIndex = -1;
    let bestEntry = 0;
    let bestTravel = 0;
    let bestMiles = 0;
    let bestCost = Infinity;

    // Waiting for the first door to open just means the outing starts later, so
    // it is neither capped nor charged against the day's field-time budget.
    const isFirstStop = stops.length === 0;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]!;
      const drive = position ? travelMinutes(position, candidate, options.averageSpeedMph) : 0;
      const miles = position ? roadMiles(position, candidate) : 0;

      const windows = windowsFor(
        candidate,
        day.weekday,
        day.window,
        options.assumeHoursWhenUnknown,
      );
      if (!windows.length) continue;

      const entry = earliestEntry(windows, clock + drive, options.visitMinutes);
      if (entry == null) continue;

      const wait = entry - (clock + drive);
      if (!isFirstStop && wait > options.maxWaitMinutes) continue;
      if (entry + options.visitMinutes > day.window.end) continue;

      const added = drive + (isFirstStop ? 0 : wait) + options.visitMinutes;
      if (spent + added > options.minutesPerDay) continue;

      // Prefer cheap-to-reach stops, but let a strong lead justify a short detour.
      // A late opener is only mildly discouraged as an opening stop, since that
      // just shifts the whole outing later.
      const cost =
        drive + wait * (isFirstStop ? 0.15 : 1.5) - candidate.priorityScore * 0.12;
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = i;
        bestEntry = entry;
        bestTravel = drive;
        bestMiles = miles;
      }
    }

    if (bestIndex < 0) break;

    const candidate = remaining[bestIndex]!;
    // Absorbed into a later start rather than reported as idle time.
    const wait = isFirstStop ? 0 : bestEntry - (clock + bestTravel);
    const depart = bestEntry + options.visitMinutes;

    stops.push({
      slug: candidate.slug,
      uid: candidate.uid,
      name: candidate.name,
      address: candidate.address,
      area: candidate.area,
      lat: candidate.lat,
      lng: candidate.lng,
      phone: candidate.phone,
      website: candidate.website,
      arriveMinutes: bestEntry,
      departMinutes: depart,
      arriveLabel: formatMinutes(bestEntry),
      departLabel: formatMinutes(depart),
      travelMinutesFromPrev: bestTravel,
      travelMilesFromPrev: Math.round(bestMiles * 10) / 10,
      waitMinutes: wait,
      hoursLabel: candidate.hoursAssumed
        ? 'Hours unknown — assumed 10am–4pm'
        : formatDayHours(candidate.hours, day.weekday),
      hoursAssumed: candidate.hoursAssumed,
      priorityScore: candidate.priorityScore,
      scoreReasons: candidate.scoreReasons,
    });

    used.add(candidate.slug);
    spent += bestTravel + wait + options.visitMinutes;
    clock = depart;
    position = candidate;
    remaining.splice(bestIndex, 1);
  }

  return { stops, used };
}

function areaLabelFor(stops: VisitStop[]): string {
  const counts = new Map<string, number>();
  for (const stop of stops) {
    const area = stop.area || 'Unknown area';
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, 2).map(([area]) => area);
  if (!top.length) return '';
  return ranked.length > 2 ? `${top.join(' / ')} +${ranked.length - 2}` : top.join(' / ');
}

function emptyDay(day: DayContext, budgetMinutes: number): VisitDay {
  return {
    date: isoDate(day.date),
    weekday: day.weekday,
    weekdayLabel: WEEKDAY_LABELS[day.weekday]!,
    dateLabel: formatDateLabel(day.date),
    areaLabel: '',
    stops: [],
    startMinutes: null,
    endMinutes: null,
    startLabel: '',
    endLabel: '',
    travelMinutes: 0,
    travelMiles: 0,
    onSiteMinutes: 0,
    totalMinutes: 0,
    budgetMinutes,
  };
}

function finalizeDay(day: DayContext, stops: VisitStop[], budgetMinutes: number): VisitDay {
  const base = emptyDay(day, budgetMinutes);
  if (!stops.length) return base;

  const travel = stops.reduce((sum, s) => sum + s.travelMinutesFromPrev, 0);
  const miles = stops.reduce((sum, s) => sum + s.travelMilesFromPrev, 0);
  const onSite = stops.reduce((sum, s) => sum + (s.departMinutes - s.arriveMinutes), 0);
  const start = stops[0]!.arriveMinutes - stops[0]!.travelMinutesFromPrev;
  const end = stops[stops.length - 1]!.departMinutes;

  return {
    ...base,
    areaLabel: areaLabelFor(stops),
    stops,
    startMinutes: start,
    endMinutes: end,
    startLabel: formatMinutes(start),
    endLabel: formatMinutes(end),
    travelMinutes: travel,
    travelMiles: Math.round(miles * 10) / 10,
    onSiteMinutes: onSite,
    totalMinutes: end - start,
    budgetMinutes,
  };
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Build the week plan from pre-assembled candidates.
 *
 * Split from data loading so it can be unit-tested and re-run with different
 * options without re-fetching every contact.
 */
export function planVisitsFromCandidates(
  candidates: VisitCandidate[],
  opts: VisitPlanOptions = {},
): VisitPlan {
  const options = {
    dayCount: Math.max(1, Math.min(Number(opts.dayCount ?? DEFAULTS.dayCount), 14)),
    minutesPerDay: Math.max(30, Math.min(Number(opts.minutesPerDay ?? DEFAULTS.minutesPerDay), 600)),
    visitMinutes: Math.max(3, Math.min(Number(opts.visitMinutes ?? DEFAULTS.visitMinutes), 120)),
    dayStartMinutes: Math.max(0, Math.min(Number(opts.dayStartMinutes ?? DEFAULTS.dayStartMinutes), 1439)),
    dayEndMinutes: Math.max(1, Math.min(Number(opts.dayEndMinutes ?? DEFAULTS.dayEndMinutes), 1440)),
    maxWaitMinutes: Math.max(0, Math.min(Number(opts.maxWaitMinutes ?? DEFAULTS.maxWaitMinutes), 120)),
    averageSpeedMph: Math.max(5, Math.min(Number(opts.averageSpeedMph ?? DEFAULTS.averageSpeedMph), 80)),
    assumeHoursWhenUnknown: opts.assumeHoursWhenUnknown ?? DEFAULTS.assumeHoursWhenUnknown,
    skipWeekends: opts.skipWeekends ?? DEFAULTS.skipWeekends,
  };

  if (options.dayEndMinutes <= options.dayStartMinutes) {
    options.dayEndMinutes = Math.min(1440, options.dayStartMinutes + 60);
  }

  const startDate = opts.startDate?.trim() || nextMondayIso();
  const warnings: string[] = [];

  const missingLocation: VisitPlanBlocker[] = [];
  const missingHours: VisitPlanBlocker[] = [];
  const routable: Routable[] = [];

  for (const candidate of candidates) {
    if (candidate.lat == null || candidate.lng == null) {
      missingLocation.push({
        slug: candidate.slug,
        uid: candidate.uid,
        name: candidate.name,
        reason: candidate.address
          ? 'address on file but never geocoded'
          : 'no address on file',
      });
      continue;
    }
    if (candidate.hoursAssumed) {
      missingHours.push({
        slug: candidate.slug,
        uid: candidate.uid,
        name: candidate.name,
        reason: 'no opening hours on file',
      });
    }
    routable.push(candidate as Routable);
  }

  const dates = planDates(startDate, options.dayCount, options.skipWeekends);
  const dayWindow: HoursInterval = {
    start: options.dayStartMinutes,
    end: options.dayEndMinutes,
  };
  const dayContexts: DayContext[] = dates.map((date) => ({
    date,
    weekday: date.getUTCDay(),
    window: dayWindow,
  }));

  const origin = opts.origin ?? null;
  if (!origin) {
    warnings.push(
      'No trip origin available — each day starts at its first stop instead of your office.',
    );
  }

  // Cluster so each planned day covers one tight area.
  const clusterAssignment = kMeansClusters(routable, dayContexts.length);
  const clusters: Routable[][] = Array.from({ length: dayContexts.length }, () => []);
  routable.forEach((candidate, index) => {
    const cluster = clusterAssignment[index] ?? 0;
    (clusters[cluster] ?? clusters[0]!).push(candidate);
  });

  // Nearest cluster first so the week works outward from the office.
  const clusterOrder = clusters
    .map((members, index) => ({
      index,
      members,
      distance: origin && members.length ? haversineMiles(origin, centroidOf(members)) : Infinity,
    }))
    .sort((a, b) => {
      if (!a.members.length && !b.members.length) return a.index - b.index;
      if (!a.members.length) return 1;
      if (!b.members.length) return -1;
      if (a.distance === b.distance) return b.members.length - a.members.length;
      return a.distance - b.distance;
    });

  const scheduled = new Set<string>();
  const days: VisitDay[] = [];

  for (let i = 0; i < dayContexts.length; i += 1) {
    const day = dayContexts[i]!;
    const members = (clusterOrder[i]?.members ?? []).filter((c) => !scheduled.has(c.slug));
    const result = scheduleDay(members, day, origin, options);
    for (const slug of result.used) scheduled.add(slug);
    days.push(finalizeDay(day, result.stops, options.minutesPerDay));
  }

  // Repair pass: a cluster assigned to a day can strand businesses that are
  // closed that day. Offer leftovers to any day with slack, best leads first.
  const leftovers = routable
    .filter((c) => !scheduled.has(c.slug))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  if (leftovers.length) {
    for (let i = 0; i < days.length; i += 1) {
      const day = days[i]!;
      const spent = day.stops.reduce(
        (sum, s) => sum + s.travelMinutesFromPrev + s.waitMinutes + (s.departMinutes - s.arriveMinutes),
        0,
      );
      if (spent >= options.minutesPerDay - options.visitMinutes) continue;

      const pool = [
        ...day.stops
          .map((stop) => routable.find((c) => c.slug === stop.slug))
          .filter((c): c is Routable => c != null),
        ...leftovers.filter((c) => !scheduled.has(c.slug)),
      ];
      if (pool.length === day.stops.length) continue;

      const context = dayContexts[i]!;
      const rebuilt = scheduleDay(pool, context, origin, options);
      if (rebuilt.stops.length <= day.stops.length) continue;

      for (const stop of day.stops) scheduled.delete(stop.slug);
      for (const slug of rebuilt.used) scheduled.add(slug);
      days[i] = finalizeDay(context, rebuilt.stops, options.minutesPerDay);
    }
  }

  const unscheduled = routable
    .filter((c) => !scheduled.has(c.slug))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const totalTravelMiles = days.reduce((sum, d) => sum + d.travelMiles, 0);
  const totalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);

  if (!candidates.length) warnings.push('No open inquiries found to plan.');
  else if (!routable.length) {
    warnings.push(
      'None of your inquiries have coordinates yet — run the hours & location backfill first.',
    );
  }
  if (missingHours.length) {
    warnings.push(
      `${missingHours.length} ${missingHours.length === 1 ? 'inquiry has' : 'inquiries have'} no opening hours on file` +
        (options.assumeHoursWhenUnknown ? ' and were scheduled against an assumed 10am–4pm window.' : ' and were skipped.'),
    );
  }

  return {
    startDate,
    days,
    unscheduled,
    missingLocation,
    missingHours,
    origin: origin ? { lat: origin.lat, lng: origin.lng, label: origin.label ?? '' } : null,
    stats: {
      inquiriesConsidered: candidates.length,
      routable: routable.length,
      scheduled: scheduled.size,
      unscheduled: unscheduled.length,
      missingLocation: missingLocation.length,
      missingHours: missingHours.length,
      totalTravelMiles: Math.round(totalTravelMiles * 10) / 10,
      totalMinutes,
    },
    warnings,
    options,
  };
}

/**
 * Load open inquiries, join their location + hours, and build the week plan.
 */
export async function planInquiryVisits(opts: VisitPlanOptions = {}): Promise<VisitPlan> {
  const { storeListWork } = await import('./workStore');
  const jobs = await storeListWork({ status: 'inquiry' });

  const candidates = await buildVisitCandidates(jobs);

  let origin = opts.origin ?? null;
  if (origin === null && opts.origin === undefined) {
    const { getOfficeCoordinates } = await import('./mapbox');
    origin = await getOfficeCoordinates();
  }

  return planVisitsFromCandidates(candidates, { ...opts, origin });
}
