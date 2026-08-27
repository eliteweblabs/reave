/**
 * Compose shortcodes for branded outbound mail.
 * [center]…[/center] and [button title="" href=""/]
 */

export type EmailBodyAlign = 'left' | 'center';

export type EmailBodyBlock =
  | { type: 'p'; text: string; align?: EmailBodyAlign }
  | { type: 'button'; title: string; href: string; align?: EmailBodyAlign };

const TAG_RE =
  /\[center\]([\s\S]*?)\[\/center\]|\[button\b([\s\S]*?)\](?:\s*\[\/button\])?/gi;

export function sanitizeEmailHref(raw: string, baseUrl = ''): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(javascript|data|vbscript):/i.test(value)) return null;
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value) || /^tel:/i.test(value)) {
    return value;
  }
  if (value.startsWith('/') && baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}${value}`;
  }
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return null;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const cleaned = raw.replace(/\/\s*$/, '');
  const re = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

function flushParagraphs(text: string, align: EmailBodyAlign, out: EmailBodyBlock[]): void {
  for (const part of text.split(/\n\s*\n/)) {
    const trimmed = part.trim();
    if (trimmed) out.push({ type: 'p', text: trimmed, align });
  }
}

function parseChunk(input: string, align: EmailBodyAlign, baseUrl: string): EmailBodyBlock[] {
  const out: EmailBodyBlock[] = [];
  const source = String(input || '').replace(/\r\n/g, '\n');
  const re = new RegExp(TAG_RE.source, 'gi');
  let last = 0;
  for (const match of source.matchAll(re)) {
    flushParagraphs(source.slice(last, match.index), align, out);
    if (match[1] != null) {
      out.push(...parseChunk(match[1], 'center', baseUrl));
    } else {
      const attrs = parseAttrs(match[2] || '');
      const href = sanitizeEmailHref(attrs.href || attrs.url || '', baseUrl);
      const title = (attrs.title || attrs.label || '').trim();
      if (href) {
        out.push({
          type: 'button',
          title: title || 'Open',
          href,
          align,
        });
      } else if (title) {
        out.push({ type: 'p', text: title, align });
      }
    }
    last = (match.index ?? 0) + match[0].length;
  }
  flushParagraphs(source.slice(last), align, out);
  return out;
}

export function parseEmailShortcodes(
  raw: string,
  opts: { baseUrl?: string } = {},
): { blocks: EmailBodyBlock[]; plainText: string } {
  const blocks = parseChunk(raw, 'left', opts.baseUrl || '');
  const plainText = blocks
    .map((block) => (block.type === 'button' ? `${block.title}: ${block.href}` : block.text))
    .join('\n\n');
  return { blocks, plainText };
}

export function hasEmailShortcodes(raw: string): boolean {
  TAG_RE.lastIndex = 0;
  return TAG_RE.test(String(raw || ''));
}
