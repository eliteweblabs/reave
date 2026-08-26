/**
 * Fonts that render in Gmail, Apple Mail, and Outlook without @font-face.
 * Website webfonts (Space Grotesk, Inter, …) are stripped — clients fall
 * back to Times. This catalog is the faces that are actually installed.
 *
 * Sources: Campaign Monitor web-safe list + Litmus system-font stacks.
 */
export type EmailSafeFontCategory = 'sans' | 'serif' | 'mono';

export type EmailSafeFontOption = {
  id: string;
  label: string;
  category: EmailSafeFontCategory;
  /** Inline CSS font-family for every text node in the HTML email. */
  stack: string;
  /** Admin preview stack (same faces, double-quoted for the settings UI). */
  preview: string;
  /** Outlook Word engine ignores most stacks — use this named face. */
  msoFamily: string;
  note: string;
};

export const DEFAULT_EMAIL_FONT_ID = 'system';

export const EMAIL_SAFE_FONT_CATALOG: readonly EmailSafeFontOption[] = [
  {
    id: 'system',
    label: 'System UI',
    category: 'sans',
    stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    preview: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    msoFamily: 'Arial',
    note: 'SF Pro on Apple, Segoe UI on Windows, Roboto on Android',
  },
  {
    id: 'arial',
    label: 'Arial',
    category: 'sans',
    stack: 'Arial, Helvetica, sans-serif',
    preview: 'Arial, Helvetica, sans-serif',
    msoFamily: 'Arial',
    note: 'Most consistent across Outlook, Gmail, and Apple Mail',
  },
  {
    id: 'helvetica',
    label: 'Helvetica',
    category: 'sans',
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    preview: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    msoFamily: 'Arial',
    note: 'Native on Apple Mail; Arial on Windows',
  },
  {
    id: 'verdana',
    label: 'Verdana',
    category: 'sans',
    stack: 'Verdana, Geneva, sans-serif',
    preview: 'Verdana, Geneva, sans-serif',
    msoFamily: 'Verdana',
    note: 'Wide metrics — readable at small sizes',
  },
  {
    id: 'tahoma',
    label: 'Tahoma',
    category: 'sans',
    stack: 'Tahoma, Geneva, Verdana, sans-serif',
    preview: 'Tahoma, Geneva, Verdana, sans-serif',
    msoFamily: 'Tahoma',
    note: 'Compact Windows sans-serif',
  },
  {
    id: 'trebuchet',
    label: 'Trebuchet MS',
    category: 'sans',
    stack: "'Trebuchet MS', 'Lucida Grande', Helvetica, Arial, sans-serif",
    preview: '"Trebuchet MS", "Lucida Grande", Helvetica, Arial, sans-serif',
    msoFamily: 'Trebuchet MS',
    note: 'Slightly more character than Arial',
  },
  {
    id: 'segoe',
    label: 'Segoe UI',
    category: 'sans',
    stack: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    preview: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    msoFamily: 'Segoe UI',
    note: 'Windows / Outlook default',
  },
  {
    id: 'calibri',
    label: 'Calibri',
    category: 'sans',
    stack: "Calibri, Carlito, 'Segoe UI', Candara, Arial, sans-serif",
    preview: 'Calibri, Carlito, "Segoe UI", Candara, Arial, sans-serif',
    msoFamily: 'Calibri',
    note: 'Microsoft Office face; Carlito/Arial elsewhere',
  },
  {
    id: 'geneva',
    label: 'Geneva',
    category: 'sans',
    stack: 'Geneva, Verdana, Tahoma, sans-serif',
    preview: 'Geneva, Verdana, Tahoma, sans-serif',
    msoFamily: 'Verdana',
    note: 'Classic Mac sans-serif',
  },
  {
    id: 'lucida-sans',
    label: 'Lucida Sans',
    category: 'sans',
    stack: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif",
    preview: '"Lucida Sans Unicode", "Lucida Grande", sans-serif',
    msoFamily: 'Lucida Sans Unicode',
    note: 'Installed on Windows and macOS',
  },
  {
    id: 'century-gothic',
    label: 'Century Gothic',
    category: 'sans',
    stack: "'Century Gothic', AppleGothic, sans-serif",
    preview: '"Century Gothic", AppleGothic, sans-serif',
    msoFamily: 'Century Gothic',
    note: 'Geometric sans; AppleGothic on older Macs',
  },
  {
    id: 'roboto',
    label: 'Roboto',
    category: 'sans',
    stack: "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    preview: 'Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
    msoFamily: 'Arial',
    note: 'Android system face; Helvetica/Arial elsewhere',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    category: 'serif',
    stack: 'Georgia, Times, "Times New Roman", serif',
    preview: 'Georgia, Times, "Times New Roman", serif',
    msoFamily: 'Georgia',
    note: 'Screen-designed serif — the usual editorial choice',
  },
  {
    id: 'times',
    label: 'Times New Roman',
    category: 'serif',
    stack: "'Times New Roman', Times, serif",
    preview: '"Times New Roman", Times, serif',
    msoFamily: 'Times New Roman',
    note: 'Universal serif; Outlook default when no stack is set',
  },
  {
    id: 'palatino',
    label: 'Palatino',
    category: 'serif',
    stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
    preview: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    msoFamily: 'Palatino Linotype',
    note: 'Bookish serif on Windows and Mac',
  },
  {
    id: 'garamond',
    label: 'Garamond',
    category: 'serif',
    stack: "Garamond, Baskerville, 'Times New Roman', serif",
    preview: 'Garamond, Baskerville, "Times New Roman", serif',
    msoFamily: 'Garamond',
    note: 'Old-style serif; Times when Garamond is missing',
  },
  {
    id: 'book-antiqua',
    label: 'Book Antiqua',
    category: 'serif',
    stack: "'Book Antiqua', Palatino, 'Palatino Linotype', Georgia, serif",
    preview: '"Book Antiqua", Palatino, "Palatino Linotype", Georgia, serif',
    msoFamily: 'Book Antiqua',
    note: 'Palatino-adjacent serif bundled with Office',
  },
  {
    id: 'courier',
    label: 'Courier New',
    category: 'mono',
    stack: "'Courier New', Courier, monospace",
    preview: '"Courier New", Courier, monospace',
    msoFamily: 'Courier New',
    note: 'Universal monospaced face',
  },
  {
    id: 'lucida-console',
    label: 'Lucida Console',
    category: 'mono',
    stack: "'Lucida Console', Monaco, monospace",
    preview: '"Lucida Console", Monaco, monospace',
    msoFamily: 'Lucida Console',
    note: 'Windows console face; Monaco on Mac',
  },
  {
    id: 'monaco',
    label: 'Monaco',
    category: 'mono',
    stack: "Monaco, Consolas, 'Lucida Console', monospace",
    preview: 'Monaco, Consolas, "Lucida Console", monospace',
    msoFamily: 'Consolas',
    note: 'Mac monospace; Consolas on Windows',
  },
];

const EMAIL_SAFE_FONT_CATEGORY_LABELS: Record<EmailSafeFontCategory, string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  mono: 'Monospace',
};

const catalogById = new Map(EMAIL_SAFE_FONT_CATALOG.map((entry) => [entry.id, entry]));

export function emailSafeFontById(id: string | null | undefined): EmailSafeFontOption {
  const trimmed = (id ?? '').trim();
  return catalogById.get(trimmed) ?? catalogById.get(DEFAULT_EMAIL_FONT_ID)!;
}

export function normalizeEmailFontId(id: string | null | undefined): string {
  return emailSafeFontById(id).id;
}

export function emailFontStack(id: string | null | undefined): string {
  return emailSafeFontById(id).stack;
}

export function emailFontMsoFamily(id: string | null | undefined): string {
  return emailSafeFontById(id).msoFamily;
}

export type EmailSafeFontAdminOption = {
  id: string;
  label: string;
  category: EmailSafeFontCategory;
  categoryLabel: string;
  preview: string;
  note: string;
};

export function emailSafeFontCatalogForAdmin(): EmailSafeFontAdminOption[] {
  return EMAIL_SAFE_FONT_CATALOG.map((entry) => ({
    id: entry.id,
    label: entry.label,
    category: entry.category,
    categoryLabel: EMAIL_SAFE_FONT_CATEGORY_LABELS[entry.category],
    preview: entry.preview,
    note: entry.note,
  }));
}
