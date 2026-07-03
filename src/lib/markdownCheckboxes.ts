/**
 * Parse and toggle GitHub-flavored markdown checkboxes in free-form markdown bodies.
 */

export const CHECKBOX_ITEM_RE = /^- \[([ xX])\] (.+)$/;

export interface MarkdownCheckboxItem {
  lineIndex: number;
  text: string;
  checked: boolean;
}

export function parseMarkdownCheckboxes(body: string): MarkdownCheckboxItem[] {
  const lines = body.split('\n');
  const items: MarkdownCheckboxItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(CHECKBOX_ITEM_RE);
    if (!match) continue;
    items.push({
      lineIndex: i,
      text: match[2].trim(),
      checked: match[1].toLowerCase() === 'x',
    });
  }
  return items;
}

export function getCheckedCheckboxTexts(body: string): string[] {
  return parseMarkdownCheckboxes(body)
    .filter((i) => i.checked)
    .map((i) => i.text);
}

/** Toggle one checkbox line; returns updated body or null if invalid. */
export function toggleCheckboxLine(body: string, lineIndex: number, checked: boolean): string | null {
  const lines = body.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return null;
  const line = lines[lineIndex];
  if (!CHECKBOX_ITEM_RE.test(line)) return null;

  lines[lineIndex] = checked
    ? line.replace('[ ]', '[x]')
    : line.replace(/\[x\]/i, '[ ]');

  return lines.join('\n');
}

/** Find a checkbox by case-insensitive substring match on item text. */
export function findCheckboxByText(
  body: string,
  query: string,
): MarkdownCheckboxItem | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const items = parseMarkdownCheckboxes(body);
  const exact = items.find((i) => i.text.toLowerCase() === q);
  if (exact) return exact;
  const partial = items.filter((i) => i.text.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0]!;
  return null;
}
