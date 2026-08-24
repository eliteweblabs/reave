/**
 * Sanitize untrusted HTML fragments (email signatures, rich text) via rehype-sanitize.
 */
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Schema } from 'hast-util-sanitize';

/** Tags commonly used in email signatures — no scripts, iframes, or event handlers. */
const signatureSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'img',
    'table',
    'tbody',
    'thead',
    'tr',
    'td',
    'th',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'style', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    div: [...(defaultSchema.attributes?.div ?? []), 'style'],
    p: [...(defaultSchema.attributes?.p ?? []), 'style'],
    span: [...(defaultSchema.attributes?.span ?? []), 'style'],
    td: ['style', 'colspan', 'rowspan', 'align', 'valign'],
    th: ['style', 'colspan', 'rowspan', 'align', 'valign'],
    table: ['style', 'width', 'cellpadding', 'cellspacing', 'border'],
    '*': ['style', 'class'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
  },
};

const processor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, signatureSchema)
  .use(rehypeStringify);

/** Strip dangerous markup from an HTML fragment. Returns empty string on parse failure. */
export async function sanitizeHtmlFragment(html: string): Promise<string> {
  const trimmed = html.trim();
  if (!trimmed) return '';
  try {
    const file = await processor.process(trimmed);
    return String(file).trim();
  } catch {
    return '';
  }
}
