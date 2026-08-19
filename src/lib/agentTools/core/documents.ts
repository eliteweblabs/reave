/**
 * Agent tool module: document templates (list / read / preview).
 *
 * Preview returns a `chat_preview` payload the chat UI renders as a thumbnail
 * that opens a full-page review modal. HTML stays out of the tool result so
 * the model does not burn tokens on markup.
 */
import { hasFeature } from '../../features';
import { fileListDocuments, fileReadDocument, isSafeDocumentSlug } from '../../documentStore';
import { resolvePreviewContact, titleFromDocumentMarkdown } from '../../documentTemplates';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

function handle_list_documents(): Promise<string> {
  const templates = fileListDocuments();
  return Promise.resolve(JSON.stringify({ count: templates.length, templates }));
}

function handle_read_document(args: Record<string, unknown>): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug) return Promise.resolve(JSON.stringify({ error: 'slug is required' }));
  if (!isSafeDocumentSlug(slug)) return Promise.resolve(JSON.stringify({ error: 'invalid slug' }));
  const doc = fileReadDocument(slug);
  if (!doc) return Promise.resolve(JSON.stringify({ error: `unknown document template: ${slug}` }));
  return Promise.resolve(JSON.stringify(doc));
}

async function handle_preview_document(args: Record<string, unknown>): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug) return JSON.stringify({ error: 'slug is required' });
  if (!isSafeDocumentSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
  const doc = fileReadDocument(slug);
  if (!doc) {
    const available = fileListDocuments().map((t) => t.slug);
    return JSON.stringify({
      error: `unknown document template: ${slug}`,
      available,
    });
  }

  const contactUid = typeof args.contact_uid === 'string' ? args.contact_uid.trim() : '';
  const contact = await resolvePreviewContact(contactUid || undefined);
  const title = titleFromDocumentMarkdown(doc.content, doc.slug);
  const chat_preview = {
    type: 'preview',
    kind: 'document',
    slug: doc.slug,
    title,
    ...(contactUid ? { contact_uid: contact.uid } : {}),
  };

  return JSON.stringify({
    ok: true,
    slug: doc.slug,
    title,
    contact: { uid: contact.uid, name: contact.name },
    preview_url: `/api/documents/${encodeURIComponent(doc.slug)}/preview`,
    chat_preview,
    instruction:
      'Append this exact fenced JSON in your reply so the owner sees a thumbnail they can open:\n```json\n' +
      JSON.stringify(chat_preview) +
      '\n```',
  });
}

export const documentsModule: AgentToolModule = {
  id: 'documents',
  enabled: () => hasFeature('documents'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_documents',
          description:
            'List markdown document templates (slug + title) from the Documents tab. Use this before preview_document or read_document when the owner asks to preview a template and the slug is unclear.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'read_document',
          description:
            'Read the full markdown source of a document template by slug. Use when editing or discussing the template text. For a visual page the owner can tap open, use preview_document instead.',
          parameters: {
            type: 'object',
            properties: {
              slug: { type: 'string', description: 'Template slug, e.g. "nda" or "contract" (no .md)' },
            },
            required: ['slug'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'preview_document',
          description:
            'Render a document template with sample (or named) contact shortcodes and return a chat_preview block. Always call this when the owner asks to preview, review, or see a template. Then append the chat_preview JSON fence in your reply so a thumbnail appears in chat — they tap it to review the full page. Do not paste the rendered HTML.',
          parameters: {
            type: 'object',
            properties: {
              slug: { type: 'string', description: 'Template slug from list_documents, e.g. "nda"' },
              contact_uid: {
                type: 'string',
                description:
                  'Optional contact uid to fill {client.*} shortcodes. Omit to use the sample/preview contact.',
              },
            },
            required: ['slug'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    list_documents: (_args, _ctx) => handle_list_documents(),
    read_document: (args) => handle_read_document(args),
    preview_document: (args) => handle_preview_document(args),
  },
};
