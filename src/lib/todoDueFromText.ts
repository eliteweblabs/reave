/**
 * Pull a due date/time out of a spoken to-do title (Siri Shortcuts).
 * "Call the plumber tomorrow at 3" → title "Call the plumber", due tomorrow 3pm.
 */

const DEFAULT_TZ = 'America/New_York';

export type ExtractedTodoDue = {
  title: string;
  /** YYYY-MM-DD when no time; ISO timestamptz when a time was stated or implied. */
  due_date: string | null;
  hasTime: boolean;
  matched: boolean;
};

export type ExtractTodoDueOpts = {
  now?: Date;
  timeZone?: string;
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const WEEKDAY_RE = WEEKDAYS.join('|');

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const PERIOD: Record<string, { hour: number; minute: number }> = {
  morning: { hour: 9, minute: 0 },
  afternoon: { hour: 14, minute: 0 },
  evening: { hour: 18, minute: 0 },
  night: { hour: 20, minute: 0 },
};

const LEADING_PREP_RE = /(?:^|\s)((?:due\s+(?:on|by)|due|on|at|by|for)\s+)$/i;

type CivilDate = { y: number; m: number; d: number };
type CivilDateTime = CivilDate & { h: number; min: number; dow: number };

type DateHit = {
  kind: 'date';
  start: number;
  end: number;
  date: CivilDate;
  impliedHour?: number;
  impliedMin?: number;
};

type TimeHit = {
  kind: 'time';
  start: number;
  end: number;
  hour: number;
  minute: number;
  relativeMs?: number;
};

type Hit = DateHit | TimeHit;

function zonedNow(now: Date, timeZone: string): CivilDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  let h = Number(get('hour'));
  if (h === 24) h = 0;
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h,
    min: Number(get('minute')),
    dow: weekdayMap[get('weekday')] ?? 0,
  };
}

function addDays(date: CivilDate, days: number): CivilDate {
  const dt = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function weekdayOnOrAfter(from: CivilDateTime, targetDow: number, skipToday: boolean): CivilDate {
  let delta = (targetDow - from.dow + 7) % 7;
  if (delta === 0 && skipToday) delta = 7;
  return addDays(from, delta);
}

/** Convert a civil local time in `timeZone` to an ISO UTC string. */
export function zonedLocalToIso(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
): string {
  const desired = Date.UTC(y, m - 1, d, h, min, 0);
  const utcGuess = desired;
  const shown = zonedNow(new Date(utcGuess), timeZone);
  const shownAsUtc = Date.UTC(shown.y, shown.m - 1, shown.d, shown.h, shown.min, 0);
  let instant = utcGuess - (shownAsUtc - utcGuess);
  const shown2 = zonedNow(new Date(instant), timeZone);
  if (shown2.y !== y || shown2.m !== m || shown2.d !== d || shown2.h !== h || shown2.min !== min) {
    const shown2AsUtc = Date.UTC(shown2.y, shown2.m - 1, shown2.d, shown2.h, shown2.min, 0);
    instant -= shown2AsUtc - desired;
  }
  return new Date(instant).toISOString();
}

function ymd(date: CivilDate): string {
  return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
}

/** Owner-local calendar date for Siri defaults (dashboard "Today" list requires a due date). */
export function todayYmdInTimeZone(timeZone: string, now = new Date()): string {
  return ymd(zonedNow(now, timeZone.trim() || DEFAULT_TZ));
}

function monthNumber(raw: string): number | null {
  const n = MONTHS[raw.toLowerCase().replace(/\.$/, '')];
  return n ?? null;
}

function parsePeriod(raw: string | undefined): { hour: number; minute: number } | null {
  if (!raw) return null;
  return PERIOD[raw.toLowerCase()] ?? null;
}

function parseHourMinute(
  hourRaw: string,
  minuteRaw: string | undefined,
  ampmRaw: string | undefined,
): { hour: number; minute: number } | null {
  let hour = Number(hourRaw);
  const minute = minuteRaw != null && minuteRaw !== '' ? Number(minuteRaw) : 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  const ampm = (ampmRaw ?? '').toLowerCase().replace(/[\s.]/g, '');
  if (ampm === 'am' || ampm === 'a') {
    if (hour === 12) hour = 0;
    else if (hour > 12) return null;
  } else if (ampm === 'pm' || ampm === 'p') {
    if (hour < 12) hour += 12;
    else if (hour > 12) return null;
  } else if (hour <= 7 && hour > 0) {
    // Bare "at 3" — treat 1–7 as afternoon/evening.
    hour += 12;
  }
  return { hour, minute };
}

function nextMonthDate(from: CivilDateTime, month: number, day: number, year?: number): CivilDate | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (year && year < 100) year += 2000;
  if (year) {
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCMonth() !== month - 1) return null;
    return { y: year, m: month, d: day };
  }
  let candidate: CivilDate = { y: from.y, m: month, d: day };
  const probe = new Date(Date.UTC(candidate.y, month - 1, day));
  if (probe.getUTCMonth() !== month - 1) return null;
  const fromOrd = Date.UTC(from.y, from.m - 1, from.d);
  const candOrd = Date.UTC(candidate.y, candidate.m - 1, candidate.d);
  if (candOrd < fromOrd) candidate = { y: from.y + 1, m: month, d: day };
  return candidate;
}

function collectHits(text: string, from: CivilDateTime): Hit[] {
  const hits: Hit[] = [];

  const pushDate = (
    m: RegExpExecArray,
    date: CivilDate | null,
    implied?: { hour: number; minute: number } | null,
  ) => {
    if (!date || m.index == null) return;
    hits.push({
      kind: 'date',
      start: m.index,
      end: m.index + m[0].length,
      date,
      ...(implied ? { impliedHour: implied.hour, impliedMin: implied.minute } : {}),
    });
  };

  const pushTime = (
    m: RegExpExecArray,
    clock: { hour: number; minute: number } | null,
    relativeMs?: number,
  ) => {
    if ((!clock && relativeMs == null) || m.index == null) return;
    hits.push({
      kind: 'time',
      start: m.index,
      end: m.index + m[0].length,
      hour: clock?.hour ?? 0,
      minute: clock?.minute ?? 0,
      ...(relativeMs != null ? { relativeMs } : {}),
    });
  };

  const scan = (source: string, flags: string, fn: (m: RegExpExecArray) => void) => {
    const re = new RegExp(source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      fn(m);
      if (!re.global) break;
    }
  };

  scan(`\\b(tomorrow)(?:\\s+(morning|afternoon|evening|night))?\\b`, 'gi', (m) => {
    pushDate(m, addDays(from, 1), parsePeriod(m[2]));
  });

  scan(`\\b(today)\\b`, 'gi', (m) => {
    pushDate(m, { y: from.y, m: from.m, d: from.d });
  });

  scan(`\\b(tonight)\\b`, 'gi', (m) => {
    pushDate(m, { y: from.y, m: from.m, d: from.d }, PERIOD.night);
  });

  scan(`\\bthis\\s+(morning|afternoon|evening)\\b`, 'gi', (m) => {
    pushDate(m, { y: from.y, m: from.m, d: from.d }, parsePeriod(m[1]));
  });

  scan(`\\bnext\\s+week\\b`, 'gi', (m) => {
    pushDate(m, addDays(from, 7));
  });

  scan(`\\b(this|next)\\s+weekend\\b`, 'gi', (m) => {
    const thisSaturday = weekdayOnOrAfter(from, 6, false);
    pushDate(m, m[1].toLowerCase() === 'next' ? addDays(thisSaturday, 7) : thisSaturday);
  });

  scan(
    `\\b(?:(next|this|on|by)\\s+(${WEEKDAY_RE})(?:\\s+(morning|afternoon|evening|night))?|(${WEEKDAY_RE})(?:\\s+(morning|afternoon|evening|night))?(?=\\s+at\\b|[\\s,.;!?]*$))`,
    'gi',
    (m) => {
      const qualifier = (m[1] ?? '').toLowerCase();
      const dayWord = (m[2] || m[4] || '').toLowerCase();
      const periodWord = m[3] || m[5];
      const dow = WEEKDAYS.indexOf(dayWord as (typeof WEEKDAYS)[number]);
      if (dow < 0) return;
      pushDate(m, weekdayOnOrAfter(from, dow, qualifier === 'next'), parsePeriod(periodWord));
    },
  );

  scan(
    `\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
    'gi',
    (m) => {
      const month = monthNumber(m[1]);
      if (!month) return;
      pushDate(m, nextMonthDate(from, month, Number(m[2]), m[3] ? Number(m[3]) : undefined));
    },
  );

  scan(
    `\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})(?:,?\\s*(\\d{4}))?\\b`,
    'gi',
    (m) => {
      const month = monthNumber(m[2]);
      if (!month) return;
      pushDate(m, nextMonthDate(from, month, Number(m[1]), m[3] ? Number(m[3]) : undefined));
    },
  );

  scan(`\\b(?:on\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`, 'gi', (m) => {
    const day = Number(m[1]);
    if (day < 1 || day > 31) return;
    let date: CivilDate = { y: from.y, m: from.m, d: day };
    if (day < from.d) {
      const next = addDays({ y: from.y, m: from.m, d: 1 }, 32);
      date = { y: next.y, m: next.m, d: day };
    }
    pushDate(m, date);
  });

  scan(`\\b(\\d{1,2})[\\/\\-](\\d{1,2})(?:[\\/\\-](\\d{2,4}))?\\b`, 'gi', (m) => {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : undefined;
    if (!year && day < 10 && !/(?:^|[\s,])(?:on|due|by)\s+$/i.test(text.slice(0, m.index))) {
      return;
    }
    pushDate(m, nextMonthDate(from, month, day, year));
  });

  scan(`\\bin\\s+(\\d+)\\s+days?\\b`, 'gi', (m) => {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1 || n > 366) return;
    pushDate(m, addDays(from, n));
  });

  scan(`\\b(?:at\\s+)?(noon|midnight)\\b`, 'gi', (m) => {
    const word = m[1].toLowerCase();
    pushTime(m, word === 'noon' ? { hour: 12, minute: 0 } : { hour: 0, minute: 0 });
  });

  scan(
    `\\b(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(?:o['’]?clock\\s+)?([ap](?:\\.?\\s*m\\.?))\\b`,
    'gi',
    (m) => {
      pushTime(m, parseHourMinute(m[1], m[2], m[3]));
    },
  );

  scan(`\\b(\\d{1,2})\\s*o['’]?clock\\b`, 'gi', (m) => {
    pushTime(m, parseHourMinute(m[1], undefined, undefined));
  });

  scan(`\\bat\\s+(\\d{1,2})(?::(\\d{2}))?\\b`, 'gi', (m) => {
    pushTime(m, parseHourMinute(m[1], m[2], undefined));
  });

  scan(`\\bin\\s+(\\d+)\\s+(minutes?|mins?|hours?|hrs?)\\b`, 'gi', (m) => {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1 || n > 60 * 24) return;
    const unit = m[2].toLowerCase();
    const ms = /hour|hr/.test(unit) ? n * 60 * 60 * 1000 : n * 60 * 1000;
    pushTime(m, { hour: 0, minute: 0 }, ms);
  });

  return hits;
}

function pickHits(hits: Hit[]): { date: DateHit | null; time: TimeHit | null } {
  const dates = hits
    .filter((h): h is DateHit => h.kind === 'date')
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const times = hits
    .filter((h): h is TimeHit => h.kind === 'time')
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const date = dates[0] ?? null;
  const time =
    times.find((t) => !date || t.end <= date.start || t.start >= date.end) ?? null;
  return { date, time };
}

function expandSpan(text: string, start: number, end: number): { start: number; end: number } {
  const prefix = text.slice(0, start).match(LEADING_PREP_RE);
  if (prefix) start -= prefix[1].length;
  while (end < text.length && /[.,;!?]/.test(text[end] ?? '')) end += 1;
  return { start, end };
}

function stripSpans(text: string, spans: Array<{ start: number; end: number }>): string {
  if (!spans.length) return text.trim();
  const merged = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const span of merged) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start);
    out += ' ';
    cursor = span.end;
  }
  out += text.slice(cursor);
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/^[,.;!?\s]+|[,.;!?\s]+$/g, '')
    .trim();
}

function looksLikeStructuredDue(raw: string): boolean {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s]\S+)?$/.test(v)) return true;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return true;
  return false;
}

/** True when `due` is already an ISO / YYYY-MM-DD value the store can parse. */
export function isStructuredTodoDue(raw: unknown): boolean {
  if (raw == null) return false;
  return looksLikeStructuredDue(String(raw));
}

export function extractTodoDueFromText(text: string, opts: ExtractTodoDueOpts = {}): ExtractedTodoDue {
  const titleIn = text.trim();
  if (!titleIn) return { title: '', due_date: null, hasTime: false, matched: false };

  const timeZone = opts.timeZone?.trim() || DEFAULT_TZ;
  const now = opts.now ?? new Date();
  const from = zonedNow(now, timeZone);
  const { date, time } = pickHits(collectHits(titleIn, from));

  if (!date && !time) {
    return { title: titleIn, due_date: null, hasTime: false, matched: false };
  }

  const spans = [date, time]
    .filter((h): h is Hit => Boolean(h))
    .map((h) => expandSpan(titleIn, h.start, h.end));
  const cleaned = stripSpans(titleIn, spans);
  const title = cleaned || titleIn;

  if (time?.relativeMs != null) {
    return {
      title,
      due_date: new Date(now.getTime() + time.relativeMs).toISOString(),
      hasTime: true,
      matched: true,
    };
  }

  let civil: CivilDate = date?.date ?? { y: from.y, m: from.m, d: from.d };
  const hour = time?.hour ?? date?.impliedHour;
  const minute = time?.minute ?? date?.impliedMin ?? 0;
  const hasTime = hour != null;

  if (hasTime && hour != null) {
    if (!date) {
      const todayMinutes = from.h * 60 + from.min;
      const dueMinutes = hour * 60 + minute;
      if (dueMinutes <= todayMinutes) civil = addDays(from, 1);
    }
    return {
      title,
      due_date: zonedLocalToIso(timeZone, civil.y, civil.m, civil.d, hour, minute),
      hasTime: true,
      matched: true,
    };
  }

  return { title, due_date: ymd(civil), hasTime: false, matched: true };
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatClock(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  if (minute === 0) return `${hour12} ${period}`;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/** Spoken-friendly due label for Siri, e.g. "due tomorrow at 3 PM". */
export function formatSiriTodoDue(
  due_date: string,
  opts: ExtractTodoDueOpts & { hasTime?: boolean } = {},
): string {
  const timeZone = opts.timeZone?.trim() || DEFAULT_TZ;
  const now = opts.now ?? new Date();
  const from = zonedNow(now, timeZone);
  const raw = due_date.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const instant = dateOnly
    ? null
    : (() => {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
      })();

  let y: number;
  let m: number;
  let d: number;
  let h: number | null = null;
  let min = 0;

  if (dateOnly) {
    const [yy, mm, dd] = raw.split('-').map(Number);
    y = yy;
    m = mm;
    d = dd;
  } else if (instant) {
    const z = zonedNow(instant, timeZone);
    y = z.y;
    m = z.m;
    d = z.d;
    const forceTime = opts.hasTime === true;
    const looksDateOnlyUtc =
      instant.getUTCHours() === 0 &&
      instant.getUTCMinutes() === 0 &&
      instant.getUTCSeconds() === 0 &&
      instant.getUTCMilliseconds() === 0 &&
      opts.hasTime !== true;
    if (forceTime || !looksDateOnlyUtc) {
      h = z.h;
      min = z.min;
    }
  } else {
    return `due ${raw.slice(0, 10)}`;
  }

  const today = ymd(from);
  const tomorrow = ymd(addDays(from, 1));
  const value = ymd({ y, m, d });
  let dayLabel = `${MONTH_SHORT[m - 1] ?? ''} ${d}`;
  if (value === today) dayLabel = 'today';
  else if (value === tomorrow) dayLabel = 'tomorrow';

  if (h != null) return `due ${dayLabel} at ${formatClock(h, min)}`;
  return `due ${dayLabel}`;
}
