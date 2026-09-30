import type { APIContext } from 'astro';
import { createContact, isContactApiConfigured } from '../../../lib/contactApi';
import { parseVCard } from '../../../lib/carddav/vcard';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { isRequestBodyTooLarge, jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

/** Cap import uploads — keeps memory bounded on large vCard exports. */
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_IMPORT_ROWS = 500;

type ImportContactRow = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
};

/**
 * Parse CSV format: name,email,phone,company,notes
 * First line can be header (skipped if it contains "name" or "email").
 */
function parseCSV(content: string): ImportContactRow[] {
  const lines = content.trim().split(/\r?\n/);
  const contacts: ImportContactRow[] = [];

  let startIdx = 0;
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('name') || firstLine.includes('email')) {
      startIdx = 1;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
    const [name, email, phone, company, notes] = parts;

    if (!name && !email && !phone) continue;

    contacts.push({
      name: name || undefined,
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
      notes: notes || undefined,
    });
  }

  return contacts;
}

/**
 * Parse vCard file(s). Multiple vCards can be concatenated in a single file.
 */
function parseVCards(content: string): ImportContactRow[] {
  const contacts: ImportContactRow[] = [];
  const vcards = content.split(/BEGIN:VCARD/i).slice(1);

  for (const vcard of vcards) {
    const vcardText = 'BEGIN:VCARD' + vcard;
    const parsed = parseVCard(vcardText);
    if (!parsed) continue;

    contacts.push({
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      company: parsed.company,
      notes: parsed.notes,
    });
  }

  return contacts;
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  if (isRequestBodyTooLarge(context.request, MAX_IMPORT_FILE_BYTES)) {
    return jsonResponse({ ok: false, error: 'Import file too large (max 2 MiB)' }, 413);
  }

  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid form data' }, 400);
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return jsonResponse({ ok: false, error: 'file is required' }, 400);
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return jsonResponse({ ok: false, error: 'Import file too large (max 2 MiB)' }, 413);
  }

  const updateExisting = formData.get('updateExisting') === 'true';

  let content: string;
  try {
    content = await file.text();
  } catch {
    return jsonResponse({ ok: false, error: 'Failed to read file' }, 400);
  }

  if (content.length > MAX_IMPORT_FILE_BYTES) {
    return jsonResponse({ ok: false, error: 'Import file too large (max 2 MiB)' }, 413);
  }

  let parsedContacts: ImportContactRow[];

  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.vcf') || fileName.endsWith('.vcard')) {
    parsedContacts = parseVCards(content);
  } else if (fileName.endsWith('.csv')) {
    parsedContacts = parseCSV(content);
  } else {
    return jsonResponse({ ok: false, error: 'Unsupported file type. Use .vcf or .csv files.' }, 400);
  }

  if (parsedContacts.length === 0) {
    return jsonResponse({ ok: false, error: 'No valid contacts found in file' }, 400);
  }

  if (parsedContacts.length > MAX_IMPORT_ROWS) {
    return jsonResponse(
      { ok: false, error: `Too many contacts in file (max ${MAX_IMPORT_ROWS})` },
      400,
    );
  }

  const results = {
    total: parsedContacts.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const contact of parsedContacts) {
    const name = contact.name?.trim();
    if (!name && !contact.email && !contact.phone) {
      results.skipped++;
      continue;
    }

    const displayName = name || contact.email || contact.phone || 'Unknown';

    try {
      const createResult = await createContact({
        name: displayName,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        notes: contact.notes,
      });

      if (createResult.ok) {
        results.created++;
      } else {
        results.errors.push(`${displayName}: ${createResult.error}`);
      }
    } catch (e) {
      results.errors.push(`${displayName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return jsonResponse({ ok: true, results }, 200);
}
