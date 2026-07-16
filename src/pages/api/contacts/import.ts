import type { APIRoute } from 'astro';
import { createContact, isContactApiConfigured, getContact, updateContact } from '../../../lib/contactApi';
import { parseVCard } from '../../../lib/carddav/vcard';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

function isDashboardAuthed(request: Request): boolean {
  const expected = serverEnv('DASHBOARD_KEY')?.trim();
  if (!expected) return false;
  const auth = request.headers.get('x-dashboard-key')?.trim();
  return auth === expected;
}

/**
 * Parse CSV format: name,email,phone,company,notes
 * First line can be header (skipped if it contains "name" or "email").
 */
function parseCSV(content: string): Array<{
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}> {
  const lines = content.trim().split(/\r?\n/);
  const contacts: Array<{
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  }> = [];

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

    const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
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
function parseVCards(content: string): Array<{
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}> {
  const contacts: Array<{
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  }> = [];

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

export const POST: APIRoute = async ({ request }) => {
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (!isDashboardAuthed(request)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, error: 'Invalid form data' }, 400);
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return json({ ok: false, error: 'file is required' }, 400);
  }

  const updateExisting = formData.get('updateExisting') === 'true';

  let content: string;
  try {
    content = await file.text();
  } catch {
    return json({ ok: false, error: 'Failed to read file' }, 400);
  }

  let parsedContacts: Array<{
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  }>;

  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.vcf') || fileName.endsWith('.vcard')) {
    parsedContacts = parseVCards(content);
  } else if (fileName.endsWith('.csv')) {
    parsedContacts = parseCSV(content);
  } else {
    return json({ ok: false, error: 'Unsupported file type. Use .vcf or .csv files.' }, 400);
  }

  if (parsedContacts.length === 0) {
    return json({ ok: false, error: 'No valid contacts found in file' }, 400);
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
      // Try to find existing contact by email or phone if update mode is enabled
      if (updateExisting && (contact.email || contact.phone)) {
        // Check if contact exists
        // For now, we'll just create new contacts, but this can be enhanced
        // to search for existing contacts and update them
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
      } else {
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
      }
    } catch (e) {
      results.errors.push(`${displayName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({ ok: true, results }, 200);
};
