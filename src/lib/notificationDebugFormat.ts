/**
 * Temporary debug format for alerts/notifications until source attribution is fixed.
 * Each line: `$varname : value`
 */

function stringifyDebugValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function formatNotificationDebugLines(record: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    const str = stringifyDebugValue(value);
    if (str == null) continue;
    lines.push(`${key} : ${str}`);
  }
  return lines;
}

export function formatNotificationDebugText(record: Record<string, unknown>): string {
  return formatNotificationDebugLines(record).join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatNotificationDebugHtml(record: Record<string, unknown>): string {
  return formatNotificationDebugLines(record)
    .map((line) => {
      const idx = line.indexOf(' : ');
      if (idx === -1) return escapeHtml(line);
      return `${escapeHtml(line.slice(0, idx))} : ${escapeHtml(line.slice(idx + 3))}`;
    })
    .join('<br>');
}

/** Split debug text into push notification title (first line) and body (rest). */
export function splitNotificationDebugForPush(record: Record<string, unknown>): {
  title: string;
  body: string;
  full: string;
} {
  const lines = formatNotificationDebugLines(record);
  const full = lines.join('\n');
  return {
    title: lines[0] ?? 'Alert',
    body: lines.slice(1).join('\n'),
    full,
  };
}
