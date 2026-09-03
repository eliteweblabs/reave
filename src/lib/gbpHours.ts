/**
 * Convert Reave BusinessHours → Google Business Profile regularHours.periods.
 *
 * Day indexes match Google Places / GBP: 0 = Sunday … 6 = Saturday.
 */
import {
  type BusinessHours,
  MINUTES_PER_DAY,
  WEEKDAY_LABELS,
  hasAnyHours,
} from './businessHours';

export const GBP_WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export type GbpTimeOfDay = { hours: number; minutes: number };

export type GbpHoursPeriod = {
  openDay: (typeof GBP_WEEKDAYS)[number];
  openTime: GbpTimeOfDay;
  closeDay: (typeof GBP_WEEKDAYS)[number];
  closeTime: GbpTimeOfDay;
};

export type GbpRegularHours = {
  periods: GbpHoursPeriod[];
};

function minutesToTime(minutes: number): GbpTimeOfDay {
  const total = Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY);
  if (total >= MINUTES_PER_DAY) return { hours: 24, minutes: 0 };
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Map weekly hours to GBP regularHours. Returns null when nothing to push. */
export function businessHoursToGbpRegularHours(
  hours: BusinessHours | null | undefined,
): GbpRegularHours | null {
  if (!hasAnyHours(hours) || !hours) return null;

  if (hours.alwaysOpen) {
    return {
      periods: [
        {
          openDay: 'SUNDAY',
          openTime: { hours: 0, minutes: 0 },
          closeDay: 'SATURDAY',
          closeTime: { hours: 24, minutes: 0 },
        },
      ],
    };
  }

  const periods: GbpHoursPeriod[] = [];
  for (let day = 0; day < 7; day += 1) {
    const intervals = hours.days[day] ?? [];
    const dayName = GBP_WEEKDAYS[day];
    for (const interval of intervals) {
      if (interval.end <= interval.start) continue;
      periods.push({
        openDay: dayName,
        openTime: minutesToTime(interval.start),
        closeDay: dayName,
        closeTime: minutesToTime(interval.end),
      });
    }
  }

  return periods.length ? { periods } : null;
}

/** Human summary for admin status surfaces. */
export function describeGbpHoursPreview(hours: BusinessHours | null | undefined): string[] {
  if (!hours || !hasAnyHours(hours)) return ['No hours configured'];
  if (hours.alwaysOpen) return ['Open 24 hours'];
  const lines: string[] = [];
  for (let day = 0; day < 7; day += 1) {
    const intervals = hours.days[day] ?? [];
    if (!intervals.length) continue;
    const label = WEEKDAY_LABELS[day];
    const chunks = intervals.map((i) => {
      const open = minutesToTime(i.start);
      const close = minutesToTime(i.end);
      const fmt = (t: GbpTimeOfDay) =>
        `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
      return `${fmt(open)}–${fmt(close)}`;
    });
    lines.push(`${label}: ${chunks.join(', ')}`);
  }
  return lines.length ? lines : ['No hours configured'];
}
