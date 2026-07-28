/**
 * Project time entries → Crater invoice line suggestions.
 */

import type { InvoiceLineSuggestion } from './workChecklist';
import type { WorkTimeEntry } from './timeEntries';
import { sumTimeEntryHours } from './timeEntries';

export interface TimeInvoiceLineSuggestion extends InvoiceLineSuggestion {
  hours: number;
  /** Crater quantity — same as hours for time-based billing. */
  quantity: number;
}

function shortLineName(text: string, max = 58): string {
  const t = text.trim();
  if (t.length <= max) return t || 'Time worked';
  return `${t.slice(0, max - 1).trim()}…`;
}

export function formatBillableHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
}

/** Map time rows to Crater invoice line-item suggestions (quantity = hours). */
export function timeEntriesToInvoiceSuggestions(
  entries: WorkTimeEntry[],
  projectTitle?: string,
): TimeInvoiceLineSuggestion[] {
  const prefix = projectTitle?.trim() ? `${projectTitle.trim()} — ` : '';
  return entries
    .filter((e) => e.hours > 0)
    .map((e, index) => {
      const note = e.note.trim() || 'Time worked';
      const hoursLabel = formatBillableHours(e.hours);
      const description = `${hoursLabel} — ${note}`;
      return {
        name: shortLineName(`${prefix}${hoursLabel} — ${note}`),
        description,
        hours: e.hours,
        quantity: e.hours,
        lineIndex: index,
        checklist_text: description,
      };
    });
}

/** One grouped line item when billing several time rows together. */
export function groupedTimeInvoiceDescription(
  entries: WorkTimeEntry[],
  projectTitle?: string,
): { name: string; description: string; quantity: number } | null {
  const billable = entries.filter((e) => e.hours > 0);
  if (!billable.length) return null;
  const title = projectTitle?.trim() || 'Project time';
  const total = sumTimeEntryHours(billable);
  const description = billable
    .map((e) => {
      const note = e.note.trim() || 'Time worked';
      return `• ${formatBillableHours(e.hours)} — ${note}`;
    })
    .join('\n');
  return {
    name: `${title} (${formatBillableHours(total)} total)`,
    description,
    quantity: total,
  };
}
