/**
 * GET /api/documents/shortcodes
 *
 * Returns the list of available document shortcodes, sourced from the
 * SHORTCODES registry in documentTemplates.ts (the authoritative list of what
 * fillTemplate() resolves). If the contact-api is reachable, the response is
 * live-enriched with any additional fields present on a real contact record so
 * that new DB columns appear in the directory automatically.
 */
import type { APIRoute } from 'astro';
import { SHORTCODES, type Shortcode } from '../../../lib/documentTemplates';
import { listContacts, isContactApiConfigured } from '../../../lib/contactApi';

export const prerender = false;

// Fields that are structural / internal and shouldn't become template tokens.
const SKIP_FIELDS = new Set(['uid', 'archived', 'links', 'createdAt', 'updatedAt', 'notes']);

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase();
}
function camelToWords(s: string): string {
  return s
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export const GET: APIRoute = async () => {
  const shortcodes: Shortcode[] = [...SHORTCODES];

  if (isContactApiConfigured()) {
    try {
      const res = await listContacts({ limit: 1 });
      if (res.ok && res.data.contacts.length > 0) {
        const contact = res.data.contacts[0];
        const knownCodes = new Set(shortcodes.map((s) => s.code));

        for (const rawKey of Object.keys(contact)) {
          if (SKIP_FIELDS.has(rawKey)) continue;
          const snakeKey = camelToSnake(rawKey);
          const code = `client.${snakeKey}`;
          if (knownCodes.has(code)) continue;
          // Also skip if we already have client.<rawKey>
          if (knownCodes.has(`client.${rawKey}`)) continue;
          shortcodes.push({
            code,
            token: `{${code}}`,
            label: camelToWords(rawKey),
            description: `Contact's ${camelToWords(rawKey).toLowerCase()} (from DB)`,
            category: 'Client',
          });
        }
      }
    } catch {
      // Fall back to base list silently
    }
  }

  return new Response(JSON.stringify(shortcodes), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
