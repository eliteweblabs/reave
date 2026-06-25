import type { ContactRecord } from '../contactApi';
import { clientPortalUrl } from '../contactApi';

/** Escape per RFC 6350 §3.4 (backslash, comma, semicolon, newline). */
export function escVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Fold long vCard lines per RFC 6350 (75 octets). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + 74)}`);
    i += 74;
  }
  return parts.join('\r\n');
}

export function contactToVCard(contact: ContactRecord, opts?: { includeNotes?: boolean }): string {
  const uid = contact.uid.trim();
  const first = (contact.firstName ?? '').trim();
  const last = (contact.lastName ?? '').trim();
  const full =
    (contact.name ?? '').trim() || [first, last].filter(Boolean).join(' ') || 'Contact';

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(foldLine(`UID:${escVCard(uid)}`));
  lines.push(foldLine(`N:${escVCard(last)};${escVCard(first)};;;`));
  lines.push(foldLine(`FN:${escVCard(full)}`));
  if (contact.company?.trim()) lines.push(foldLine(`ORG:${escVCard(contact.company.trim())}`));
  if (contact.phone?.trim()) lines.push(foldLine(`TEL;TYPE=CELL:${escVCard(contact.phone.trim())}`));
  if (contact.email?.trim()) lines.push(foldLine(`EMAIL;TYPE=INTERNET:${escVCard(contact.email.trim())}`));
  if (opts?.includeNotes && contact.notes?.trim()) {
    lines.push(foldLine(`NOTE:${escVCard(contact.notes.trim())}`));
  }
  lines.push(foldLine(`URL:${escVCard(clientPortalUrl(uid))}`));
  if (contact.updatedAt) {
    const rev = contact.updatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('Z', 'Z');
    lines.push(foldLine(`REV:${escVCard(rev)}`));
  }
  lines.push('END:VCARD');

  return lines.join('\r\n') + '\r\n';
}

export type ParsedVCard = {
  uid?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
};

function unfoldVCard(raw: string): string {
  return raw.replace(/\r?\n[ \t]/g, '');
}

function parseVCardLine(line: string): { key: string; params: string; value: string } {
  const colon = line.indexOf(':');
  if (colon < 0) return { key: line.toUpperCase(), params: '', value: '' };
  const left = line.slice(0, colon);
  const semi = left.indexOf(';');
  const key = (semi >= 0 ? left.slice(0, semi) : left).toUpperCase();
  const params = semi >= 0 ? left.slice(semi + 1) : '';
  let value = line.slice(colon + 1);
  value = value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  return { key, params, value };
}

/** Parse vCard 3.0 / 4.0 bodies from CardDAV PUT. */
export function parseVCard(raw: string): ParsedVCard | null {
  const text = unfoldVCard(raw.trim());
  if (!/BEGIN:VCARD/i.test(text)) return null;

  const out: ParsedVCard = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || /^BEGIN:VCARD/i.test(line) || /^END:VCARD/i.test(line) || /^VERSION:/i.test(line)) {
      continue;
    }
    const { key, value } = parseVCardLine(line);
    switch (key) {
      case 'UID':
        out.uid = value.trim();
        break;
      case 'FN':
        if (!out.name) out.name = value.trim();
        break;
      case 'N': {
        const parts = value.split(';');
        out.lastName = (parts[0] ?? '').trim();
        out.firstName = (parts[1] ?? '').trim();
        if (!out.name) out.name = [out.firstName, out.lastName].filter(Boolean).join(' ');
        break;
      }
      case 'EMAIL':
        if (!out.email) out.email = value.trim();
        break;
      case 'TEL':
        if (!out.phone) out.phone = value.trim();
        break;
      case 'ORG':
        if (!out.company) out.company = value.split(';')[0]?.trim() ?? value.trim();
        break;
      case 'NOTE':
        out.notes = value.trim();
        break;
      default:
        break;
    }
  }

  if (!out.name && (out.firstName || out.lastName)) {
    out.name = [out.firstName, out.lastName].filter(Boolean).join(' ');
  }
  return out.name || out.email || out.phone ? out : null;
}

export function contactEtag(contact: ContactRecord): string {
  const stamp = contact.updatedAt ?? contact.createdAt ?? contact.uid;
  return `"${stamp}"`;
}

export function collectionCtag(contacts: ContactRecord[]): string {
  let max = '';
  for (const c of contacts) {
    const t = c.updatedAt ?? c.createdAt ?? '';
    if (t > max) max = t;
  }
  return max || String(contacts.length);
}
