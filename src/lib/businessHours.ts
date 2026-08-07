/**
 * Normalized weekly business hours.
 *
 * Hours reach us from two very different places: Google Place Details returns
 * structured `regularOpeningHours.periods`, while older contact enrichment only
 * scraped a free-text blob into a portal field. Both are funneled into the same
 * `BusinessHours` shape here so scheduling code never has to care which.
 *
 * Day indexes follow Google Places: 0 = Sunday … 6 = Saturday.
 */

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const MINUTES_PER_DAY = 24 * 60;

/** A single open window on one weekday, in minutes from local midnight. */
export type HoursInterval = { start: number; end: number };

export type BusinessHoursSource = 'places' | 'text' | 'manual';

export type BusinessHours = {
  /** Open windows per weekday, index 0 = Sunday. Always length 7. */
  days: HoursInterval[][];
  /** True when the business reports being open continuously. */
  alwaysOpen?: boolean;
  /** Human-readable lines straight from the provider, for display. */
  displayLines?: string[];
  /** Minutes offset from UTC for the business's local time, when known. */
  utcOffsetMinutes?: number;
  source: BusinessHoursSource;
  /** ISO timestamp when these hours were resolved. */
  fetchedAt?: string;
};

/** Seven empty weekdays — the starting point for every parser here. */
export function emptyWeek(): HoursInterval[][] {
  return [[], [], [], [], [], [], []];
}

export function emptyBusinessHours(source: BusinessHoursSource = 'manual'): BusinessHours {
  return { days: emptyWeek(), source };
}

/** True when at least one weekday has an open window (or the place is 24/7). */
export function hasAnyHours(hours: BusinessHours | null | undefined): boolean {
  if (!hours) return false;
  if (hours.alwaysOpen) return true;
  return hours.days.some((day) => day.length > 0);
}

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), MINUTES_PER_DAY);
}

/**
 * Merge overlapping/adjacent windows and drop zero-length ones so downstream
 * scheduling can assume a clean, sorted, non-overlapping list.
 */
export function normalizeIntervals(intervals: HoursInterval[]): HoursInterval[] {
  const cleaned = intervals
    .map((i) => ({ start: clampMinute(i.start), end: clampMinute(i.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: HoursInterval[] = [];
  for (const interval of cleaned) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
      continue;
    }
    merged.push({ ...interval });
  }
  return merged;
}

function normalizeWeek(days: HoursInterval[][]): HoursInterval[][] {
  const week = emptyWeek();
  for (let day = 0; day < 7; day += 1) {
    week[day] = normalizeIntervals(days[day] ?? []);
  }
  return week;
}

// ---------------------------------------------------------------------------
// Google Place Details → BusinessHours
// ---------------------------------------------------------------------------

export type PlacesOpeningPoint = { day?: number; hour?: number; minute?: number };
export type PlacesOpeningPeriod = { open?: PlacesOpeningPoint; close?: PlacesOpeningPoint };

function pointMinutes(point: PlacesOpeningPoint | undefined): number | null {
  if (!point) return null;
  const hour = Number(point.hour ?? 0);
  const minute = Number(point.minute ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return clampMinute(hour * 60 + minute);
}

function pointDay(point: PlacesOpeningPoint | undefined): number | null {
  const day = Number(point?.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  return day;
}

/**
 * Convert Google's `regularOpeningHours.periods` into weekly intervals.
 *
 * A period with an `open` point but no `close` is Google's encoding for "open
 * 24 hours". Periods that close on a later weekday than they open are split at
 * midnight so each weekday's list stays within 0…1440.
 */
export function hoursFromPlacesPeriods(
  periods: PlacesOpeningPeriod[] | null | undefined,
  opts: {
    displayLines?: string[];
    utcOffsetMinutes?: number;
    alwaysOpen?: boolean;
  } = {},
): BusinessHours {
  const days = emptyWeek();
  let sawOpenEnded = false;

  for (const period of periods ?? []) {
    const openDay = pointDay(period.open);
    const openMinutes = pointMinutes(period.open);
    if (openDay == null || openMinutes == null) continue;

    if (!period.close) {
      sawOpenEnded = true;
      days[openDay]!.push({ start: 0, end: MINUTES_PER_DAY });
      continue;
    }

    const closeDay = pointDay(period.close);
    const closeMinutes = pointMinutes(period.close);
    if (closeDay == null || closeMinutes == null) continue;

    if (closeDay === openDay && closeMinutes > openMinutes) {
      days[openDay]!.push({ start: openMinutes, end: closeMinutes });
      continue;
    }

    // Overnight (or multi-day) span: run to midnight, then fill whole days
    // until the closing weekday.
    days[openDay]!.push({ start: openMinutes, end: MINUTES_PER_DAY });
    let cursor = (openDay + 1) % 7;
    let guard = 0;
    while (cursor !== closeDay && guard < 7) {
      days[cursor]!.push({ start: 0, end: MINUTES_PER_DAY });
      cursor = (cursor + 1) % 7;
      guard += 1;
    }
    if (closeMinutes > 0) days[closeDay]!.push({ start: 0, end: closeMinutes });
  }

  const week = normalizeWeek(days);
  const alwaysOpen =
    opts.alwaysOpen ??
    (sawOpenEnded &&
      week.every((day) => day.length === 1 && day[0]!.start === 0 && day[0]!.end === MINUTES_PER_DAY));

  return {
    days: week,
    alwaysOpen: alwaysOpen || undefined,
    displayLines: opts.displayLines?.filter((line) => line.trim().length > 0),
    utcOffsetMinutes: Number.isFinite(opts.utcOffsetMinutes)
      ? Number(opts.utcOffsetMinutes)
      : undefined,
    source: 'places',
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Free text → BusinessHours
// ---------------------------------------------------------------------------

const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const DAY_TOKEN = '(?:sun|mon|tues?|weds?|thurs?|thu|fri|sat)(?:day)?';
const TIME_TOKEN = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?';

function dayIndexFromToken(token: string): number | null {
  const key = token.trim().toLowerCase().replace(/\./g, '');
  return DAY_ALIASES[key] ?? null;
}

/** Expand "mon-fri" / "mon, wed, fri" / "weekdays" into day indexes. */
function parseDaySpec(spec: string): number[] {
  const text = spec.trim().toLowerCase();
  if (!text) return [];

  if (/\b(?:every\s?day|daily|all\s?week|7\s?days)\b/.test(text)) return [0, 1, 2, 3, 4, 5, 6];
  if (/\bweekdays?\b/.test(text)) return [1, 2, 3, 4, 5];
  if (/\bweekends?\b/.test(text)) return [0, 6];

  const days = new Set<number>();
  const rangeRe = new RegExp(`(${DAY_TOKEN})\\s*(?:-|–|—|through|thru|to)\\s*(${DAY_TOKEN})`, 'gi');
  let consumed = text;
  let match: RegExpExecArray | null;
  while ((match = rangeRe.exec(text))) {
    const from = dayIndexFromToken(match[1]!);
    const to = dayIndexFromToken(match[2]!);
    if (from == null || to == null) continue;
    let cursor = from;
    for (let guard = 0; guard < 8; guard += 1) {
      days.add(cursor);
      if (cursor === to) break;
      cursor = (cursor + 1) % 7;
    }
    consumed = consumed.replace(match[0], ' ');
  }

  const singleRe = new RegExp(DAY_TOKEN, 'gi');
  while ((match = singleRe.exec(consumed))) {
    const day = dayIndexFromToken(match[0]!);
    if (day != null) days.add(day);
  }

  return [...days].sort((a, b) => a - b);
}

function minutesFromTimeParts(
  hourRaw: string,
  minuteRaw: string | undefined,
  meridiemRaw: string | undefined,
  fallbackMeridiem?: 'am' | 'pm',
): number | null {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour > 24 || minute > 59) return null;

  const meridiem = (meridiemRaw ?? '').replace(/\./g, '').toLowerCase() as 'am' | 'pm' | '';
  const effective = meridiem || fallbackMeridiem || '';

  if (effective === 'pm' && hour < 12) hour += 12;
  else if (effective === 'am' && hour === 12) hour = 0;
  else if (!effective && hour >= 1 && hour <= 6) {
    // Bare "9-5" almost always means 9am–5pm for a business.
    hour += 12;
  }

  return clampMinute(hour * 60 + minute);
}

/**
 * Best-effort parse of human-written hours ("Mon-Fri 9am-5pm, Sat 10-2").
 *
 * This exists to salvage the free-text `Hours` portal field written by older
 * contact enrichment. It is deliberately conservative: anything it cannot
 * confidently read is left out rather than guessed, so a partially parsed
 * result never invents an open window.
 */
export function parseHoursText(raw: string | null | undefined): BusinessHours | null {
  const text = String(raw ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  if (/\b24\s*\/\s*7\b|\b24\s*hours?\b|\balways\s+open\b|\bopen\s+24\b/i.test(text)) {
    return {
      days: emptyWeek().map(() => [{ start: 0, end: MINUTES_PER_DAY }]),
      alwaysOpen: true,
      displayLines: [text],
      source: 'text',
      fetchedAt: new Date().toISOString(),
    };
  }

  const days = emptyWeek();
  let matched = false;

  // Each segment is roughly "<day spec> <start>-<end>"; split on separators
  // that reliably end one segment without breaking a time range.
  const segments = text.split(/[;|\n]|,(?=\s*(?:sun|mon|tues?|weds?|thurs?|thu|fri|sat|every|daily|weekday|weekend))/i);

  const rangeRe = new RegExp(`${TIME_TOKEN}\\s*(?:-|to|until|till)\\s*${TIME_TOKEN}`, 'i');

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const timeMatch = rangeRe.exec(trimmed);
    if (!timeMatch) continue;

    const daySpec = trimmed.slice(0, timeMatch.index);
    // "Sun closed" carries no range for this segment; a trailing "Closed Sunday"
    // is handled by the closure pass below and must not void the range itself.
    if (/\bclosed\b/i.test(daySpec)) continue;

    let targetDays = parseDaySpec(daySpec);
    if (!targetDays.length) targetDays = parseDaySpec(trimmed.slice(timeMatch.index + timeMatch[0].length));
    if (!targetDays.length) continue;

    const endMeridiem = (timeMatch[6] ?? '').replace(/\./g, '').toLowerCase() as 'am' | 'pm' | '';
    const start = minutesFromTimeParts(
      timeMatch[1]!,
      timeMatch[2],
      timeMatch[3],
      // "9-5pm" → the 9 is am; only inherit pm when it keeps start before end.
      endMeridiem === 'pm' && Number(timeMatch[1]) >= 7 ? 'am' : undefined,
    );
    const end = minutesFromTimeParts(timeMatch[4]!, timeMatch[5], timeMatch[6]);
    if (start == null || end == null || end <= start) continue;

    for (const day of targetDays) days[day]!.push({ start, end });
    matched = true;
  }

  // Handle "closed <day>" so an explicit closure wins over a broad range.
  const closedRe = new RegExp(`closed\\s+((?:${DAY_TOKEN}|[,\\s-]|and|through|thru)+)`, 'gi');
  let closedMatch: RegExpExecArray | null;
  while ((closedMatch = closedRe.exec(text))) {
    for (const day of parseDaySpec(closedMatch[1]!)) days[day] = [];
  }

  if (!matched) return null;

  return {
    days: normalizeWeek(days),
    displayLines: [text],
    source: 'text',
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Open windows on one weekday (0 = Sunday). */
export function intervalsForDay(
  hours: BusinessHours | null | undefined,
  weekday: number,
): HoursInterval[] {
  if (!hours) return [];
  if (hours.alwaysOpen) return [{ start: 0, end: MINUTES_PER_DAY }];
  const day = ((weekday % 7) + 7) % 7;
  return hours.days[day] ?? [];
}

/** True when the business is open at `minutes` past midnight on `weekday`. */
export function isOpenAt(
  hours: BusinessHours | null | undefined,
  weekday: number,
  minutes: number,
): boolean {
  return intervalsForDay(hours, weekday).some((i) => minutes >= i.start && minutes < i.end);
}

/**
 * Intersect a weekday's open windows with an arbitrary window, returning the
 * sub-windows where a visit could actually happen.
 */
export function openWindowsWithin(
  hours: BusinessHours | null | undefined,
  weekday: number,
  window: HoursInterval,
): HoursInterval[] {
  const clipped: HoursInterval[] = [];
  for (const interval of intervalsForDay(hours, weekday)) {
    const start = Math.max(interval.start, window.start);
    const end = Math.min(interval.end, window.end);
    if (end > start) clipped.push({ start, end });
  }
  return clipped;
}

/** Weekdays (0–6) with at least one open window. */
export function openWeekdays(hours: BusinessHours | null | undefined): number[] {
  const result: number[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (intervalsForDay(hours, day).length) result.push(day);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 545 → "9:05am". */
export function formatMinutes(minutes: number): string {
  const total = clampMinute(minutes);
  if (total >= MINUTES_PER_DAY) return 'midnight';
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const meridiem = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0
    ? `${hour12}${meridiem}`
    : `${hour12}:${String(minute).padStart(2, '0')}${meridiem}`;
}

export function formatInterval(interval: HoursInterval): string {
  return `${formatMinutes(interval.start)}–${formatMinutes(interval.end)}`;
}

/** "Mon 9am–5pm" style summary for one weekday, or "Closed". */
export function formatDayHours(
  hours: BusinessHours | null | undefined,
  weekday: number,
): string {
  const intervals = intervalsForDay(hours, weekday);
  if (!intervals.length) return 'Closed';
  if (hours?.alwaysOpen) return 'Open 24 hours';
  return intervals.map(formatInterval).join(', ');
}

/** Compact week summary, collapsing consecutive days that share hours. */
export function formatWeekHours(hours: BusinessHours | null | undefined): string[] {
  if (!hasAnyHours(hours)) return [];
  if (hours?.alwaysOpen) return ['Open 24 hours daily'];

  const lines: string[] = [];
  let runStart = 0;
  const signature = (day: number) => formatDayHours(hours, day);

  for (let day = 1; day <= 7; day += 1) {
    const sameAsRun = day < 7 && signature(day) === signature(runStart);
    if (sameAsRun) continue;
    const runEnd = day - 1;
    const label =
      runStart === runEnd
        ? WEEKDAY_SHORT[runStart]
        : `${WEEKDAY_SHORT[runStart]}–${WEEKDAY_SHORT[runEnd]}`;
    lines.push(`${label} ${signature(runStart)}`);
    runStart = day;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Serialization (portal JSONB round-trip)
// ---------------------------------------------------------------------------

/** Re-hydrate hours from portal metadata, tolerating partial/legacy shapes. */
export function parseStoredBusinessHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<BusinessHours> & { days?: unknown };
  if (!Array.isArray(obj.days)) return null;

  const days = emptyWeek();
  for (let day = 0; day < 7; day += 1) {
    const entry = (obj.days as unknown[])[day];
    if (!Array.isArray(entry)) continue;
    days[day] = normalizeIntervals(
      entry
        .map((i) => {
          const start = Number((i as HoursInterval | undefined)?.start);
          const end = Number((i as HoursInterval | undefined)?.end);
          if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
          return { start, end };
        })
        .filter((i): i is HoursInterval => i != null),
    );
  }

  const source: BusinessHoursSource =
    obj.source === 'places' || obj.source === 'text' || obj.source === 'manual'
      ? obj.source
      : 'manual';

  const hours: BusinessHours = { days, source };
  if (obj.alwaysOpen === true) hours.alwaysOpen = true;
  if (Array.isArray(obj.displayLines)) {
    const lines = obj.displayLines
      .map((line) => String(line ?? '').trim())
      .filter((line) => line.length > 0);
    if (lines.length) hours.displayLines = lines;
  }
  if (Number.isFinite(Number(obj.utcOffsetMinutes))) {
    hours.utcOffsetMinutes = Number(obj.utcOffsetMinutes);
  }
  const fetchedAt = String(obj.fetchedAt ?? '').trim();
  if (fetchedAt) hours.fetchedAt = fetchedAt;

  if (!hasAnyHours(hours)) return null;
  return hours;
}
