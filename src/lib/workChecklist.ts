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

const PLAIN_BULLET_RE = /^[-*]\s+(?!\[[ xX]\])(.+)$/;
const PREVIEW_BULLET_MAX_LEN = 72;

function cleanPreviewLine(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function truncatePreview(text: string, max = PREVIEW_BULLET_MAX_LEN): string {
  const t = text.trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Short bullet lines for compact project tiles (checkboxes, then plain bullets, then tags). */
export function extractWorkPreviewBullets(
  body: string,
  opts?: { maxItems?: number; tags?: string[] },
): string[] {
  const max = opts?.maxItems ?? 3;
  const lines: string[] = [];

  for (const item of parseMarkdownCheckboxes(body)) {
    if (lines.length >= max) break;
    const text = truncatePreview(cleanPreviewLine(item.text));
    if (text) lines.push(text);
  }

  if (lines.length < max) {
    for (const line of body.split('\n')) {
      if (lines.length >= max) break;
      const match = line.match(PLAIN_BULLET_RE);
      if (!match) continue;
      const text = truncatePreview(cleanPreviewLine(match[1]));
      if (text && !lines.includes(text)) lines.push(text);
    }
  }

  if (lines.length < max && opts?.tags?.length) {
    for (const tag of opts.tags) {
      if (lines.length >= max) break;
      const text = truncatePreview(String(tag));
      if (text && !lines.includes(text)) lines.push(text);
    }
  }

  return lines.slice(0, max);
}

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
