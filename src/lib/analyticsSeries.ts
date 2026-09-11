/** YYYY-MM-DD for "today" in an IANA timezone (UTC fallback). */
export function todayIsoDate(timezone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* invalid tz */
  }
  return new Date().toISOString().slice(0, 10);
}

/** Drop the in-progress today bucket so traffic charts end on complete days. */
export function dropIncompleteTodayFromSeries(
  series: Array<{ date: string; visitors: number; pageviews: number }>,
  timezone?: string,
): Array<{ date: string; visitors: number; pageviews: number }> {
  if (series.length < 2) return series;
  const today = todayIsoDate(timezone);
  const lastDate = String(series[series.length - 1]?.date ?? '').slice(0, 10);
  if (lastDate === today) return series.slice(0, -1);
  return series;
}
