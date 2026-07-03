/**
 * Project checklist helpers — completed items → Crater invoice line descriptions.
 */

import {
  getCheckedCheckboxTexts,
  parseMarkdownCheckboxes,
  type MarkdownCheckboxItem,
} from './markdownCheckboxes';

export type { MarkdownCheckboxItem };

export { parseMarkdownCheckboxes, getCheckedCheckboxTexts };

export interface InvoiceLineSuggestion {
  /** Short line-item title for Crater (≤ ~60 chars). */
  name: string;
  /** Work performed — use as the line item description field. */
  description: string;
  lineIndex: number;
  checklist_text: string;
}

function shortLineName(text: string, max = 58): string {
  const t = text.trim();
  if (t.length <= max) return t || 'Services rendered';
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Map checked project checklist items to Crater invoice line-item suggestions. */
export function completedItemsToInvoiceSuggestions(
  body: string,
  projectTitle?: string,
): InvoiceLineSuggestion[] {
  const prefix = projectTitle?.trim() ? `${projectTitle.trim()} — ` : '';
  return parseMarkdownCheckboxes(body)
    .filter((i) => i.checked)
    .map((i) => {
      const description = i.text.trim();
      const name = shortLineName(`${prefix}${description}`);
      return {
        name,
        description,
        lineIndex: i.lineIndex,
        checklist_text: i.text,
      };
    });
}

/** One grouped line item when billing several completed tasks together. */
export function groupedInvoiceDescription(
  body: string,
  projectTitle?: string,
): { name: string; description: string } | null {
  const done = getCheckedCheckboxTexts(body);
  if (!done.length) return null;
  const title = projectTitle?.trim() || 'Project work';
  const description = done.map((t) => `• ${t}`).join('\n');
  return { name: title, description };
}
