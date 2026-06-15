import { runTelegramKnowledgeAgent } from './telegramAgent';
import { appendChatTurns, clearChatHistory, getChatHistory } from './telegramChatHistory';
import { listKnowledgeSlugs, readKnowledgeMarkdown } from './localKnowledge';
import { telegramSendMessage, telegramAnswerCallback, telegramSetMyCommands, telegramSendMenu, type MenuButton } from './telegramClient';
import { buildCommandList } from './telegramCommandList';
import { listTemplates } from './documentTemplates';
import { siteBaseUrl } from './contactApi';
import {
  isContactApiConfigured,
  resolveContact,
  listContacts,
  getContact,
  updateContact,
  extractPortal,
  setContactPortal,
  clientPortalUrl,
  formatResolveForTelegram,
  type ContactRecord,
  type ClientDataEntry,
} from './contactApi';
import {
  setPendingEdit,
  peekPendingEdit,
  takePendingEdit,
  clearPendingEdit,
  type MetaField,
} from './telegramPendingEdits';
import { createRailwayEmptyProject } from './railwayClient';
import {
  isCraterConfigured,
  craterListInvoices,
  craterSearchCustomers,
  craterCreateInvoice,
  craterAddInvoiceItems,
  craterGetInvoice,
  craterUpdateInvoice,
  formatCreatedInvoice,
  type CraterCustomer,
  type CraterInvoiceSummary,
} from './craterClient';
import { isEmailSendConfigured, isSmsSendConfigured, sendEmail, sendSms } from './outbound';
import { checkDeploymentStatus, getRecentCommits } from './devStatus';
import { serverEnv } from './serverEnv';
import {
  isVoiceAgentEnabled,
  setVoiceAgentEnabled,
  listActiveSessions,
} from './voiceSessionManager';
import { telnyxTransferCall, isTelnyxConfigured } from './telnyxClient';

function parseAllowedUserIds(raw: string | undefined): Set<number> | null {
  if (!raw?.trim()) return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return new Set(ids);
}

function isUserAllowed(userId: number, allowed: Set<number> | null, prod: boolean): boolean {
  if (!allowed) {
    if (prod) return false;
    console.warn('[telegram] TELEGRAM_ALLOWED_USER_IDS unset — allowing any user (dev only).');
    return true;
  }
  return allowed.has(userId);
}

// ─── formatting helpers ───────────────────────────────────────────────────────

function noApi(service = 'Contact API'): string {
  return `${service} not configured. Check your environment variables.`;
}

/**
 * Format a resolve-not-found response consistently across all commands.
 * One candidate → "Did you mean X?" with a corrected command suggestion.
 * Many candidates → list them and ask to be more specific.
 */
function fmtNoMatch(
  command: string,
  query: string,
  candidates: Array<{ name?: string; uid?: string }>
): string {
  if (candidates.length === 1) {
    const suggestion = candidates[0].name ?? candidates[0].uid ?? '?';
    return `Did you mean ${suggestion}?\n\nTry: /${command} ${suggestion}`;
  }
  if (candidates.length > 1) {
    const lines = [`Multiple matches for "${query}":`];
    for (const c of candidates.slice(0, 5)) lines.push(`- ${c.name ?? c.uid}`);
    lines.push('', `Be more specific: /${command} John Smith`);
    return lines.join('\n');
  }
  return `No contact found for "${query}".`;
}

function fmtMoney(n: number): string {
  return `$${Number(n).toFixed(2)}`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * The editable "Meta" fields for a contact, shown as buttons under the Meta
 * action. `current` reads the value off a loaded contact for display.
 */
const META_FIELDS: Array<{ key: MetaField; label: string; current: (c: ContactRecord) => string }> = [
  { key: 'firstname', label: 'First name', current: (c) => (c.firstName || c.name?.split(/\s+/)[0] || '').trim() },
  { key: 'lastname', label: 'Last name', current: (c) => (c.lastName || c.name?.split(/\s+/).slice(1).join(' ') || '').trim() },
  { key: 'company', label: 'Company', current: (c) => (c.company || '').trim() },
  { key: 'phone', label: 'Phone', current: (c) => (c.phone || '').trim() },
  { key: 'email', label: 'Email', current: (c) => (c.email || '').trim() },
];

function metaFieldLabel(key: MetaField): string {
  return META_FIELDS.find((f) => f.key === key)?.label ?? key;
}

/** Build the "pick a field to edit" menu shown after the Meta button. */
function buildMetaMenu(
  c: ContactRecord,
  uid: string
): { text: string; rows: Array<Array<{ text: string; data: string }>> } {
  const lines = [`Edit info — ${c.name}`, ''];
  for (const f of META_FIELDS) {
    const v = f.current(c);
    lines.push(`${f.label}: ${v || '—'}`);
  }
  lines.push('', 'Tap a field, then send the new value in the chat.');
  const rows: Array<Array<{ text: string; data: string }>> = [];
  for (let i = 0; i < META_FIELDS.length; i += 2) {
    rows.push(META_FIELDS.slice(i, i + 2).map((f) => ({ text: f.label, data: `qcmd:metaset:${f.key}:${uid}` })));
  }
  rows.push([{ text: '‹ Back', data: `qcmd:open:${uid}` }]);
  return { text: lines.join('\n'), rows };
}

/**
 * Tokens that strongly suggest a `name` actually holds a *business* name rather
 * than a person. The first/last-name editors rebuild the whole `name` from its
 * tokens (contact-api derives first/last by splitting `name`), so editing one
 * part of a business name silently corrupts it — e.g. setting first name
 * "Jayson" on "CAPCO Design Group" yields "Jayson Design Group". When this
 * matches and no Company is set, we ask the user what they meant instead.
 */
const BUSINESS_NAME_HINT =
  /\b(?:group|llc|l\.l\.c\.?|inc|incorporated|corp|corporation|co|company|ltd|limited|studios?|agency|labs?|designs?|solutions|services|systems|partners|associates|consulting|holdings|enterprises|media|digital|creative|ventures|capital|realty|properties|construction|builders|brands?|works|collective|industries|technologies|software|consultants?)\b/i;

function looksLikeBusinessName(name: string | null | undefined): boolean {
  return !!name && BUSINESS_NAME_HINT.test(name);
}

/**
 * Reconstruct the full `name` after editing one name part. contact-api has no
 * separate first/last write fields, so we rebuild `name` from the current
 * first/last and the new value.
 */
function reconstructName(c: ContactRecord, field: 'firstname' | 'lastname', value: string): string {
  const v = value.trim();
  const first = (c.firstName || c.name?.split(/\s+/)[0] || '').trim();
  const last = (c.lastName || c.name?.split(/\s+/).slice(1).join(' ') || '').trim();
  return field === 'firstname' ? [v, last].filter(Boolean).join(' ') : [first, v].filter(Boolean).join(' ');
}

/**
 * Apply a single Meta-field edit. First/last name are reconstructed into the
 * full `name` (the API derives first/last from it); other fields map directly.
 */
async function applyMetaEdit(
  uid: string,
  field: MetaField,
  value: string
): Promise<{ ok: true; data: ContactRecord } | { ok: false; error: string }> {
  const v = value.trim();
  if (field === 'firstname' || field === 'lastname') {
    const full = await getContact(uid);
    if (!full.ok) return { ok: false, error: full.error };
    const name = reconstructName(full.data, field, v);
    if (!name.trim()) return { ok: false, error: 'Name cannot be empty.' };
    return updateContact(uid, { name });
  }
  return updateContact(uid, { [field]: v });
}

/**
 * Stash a pending first/last-name edit and ask the user to disambiguate: is the
 * existing `name` actually a business (→ move it to Company, keep the typed
 * value as the person's name), or do they really want to rename the contact?
 */
async function promptBusinessNameConfirm(
  token: string,
  chatId: number,
  c: ContactRecord,
  field: 'firstname' | 'lastname',
  value: string
): Promise<void> {
  const v = value.trim();
  setPendingEdit(chatId, { kind: 'metaconfirm', uid: c.uid, name: c.name, field, value: v, currentName: c.name });
  const reconstructed = reconstructName(c, field, v);
  const label = metaFieldLabel(field).toLowerCase();
  const msg =
    `“${c.name}” looks like a business name, and no Company is set.\n\n` +
    `You set the ${label} to “${v}”. What did you mean?`;
  await telegramSendMenu(token, chatId, msg, [
    [{ text: `“${c.name}” is the company`, data: `qcmd:metafix:company:${c.uid}` }],
    [{ text: `Rename contact → “${reconstructed}”`, data: `qcmd:metafix:rename:${c.uid}` }],
    [{ text: 'Cancel', data: `qcmd:metafix:cancel:${c.uid}` }],
  ]);
}

/**
 * Append a note to a contact's portal Data tab. Merges with the existing portal
 * payload (setContactPortal replaces metadata wholesale) and returns the new
 * entry count for a friendly confirmation.
 */
async function addClientNote(
  uid: string,
  title: string,
  content: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const full = await getContact(uid);
  if (!full.ok) return { ok: false, error: full.error };
  const portal = extractPortal(full.data) ?? {};
  const entry: ClientDataEntry = { label: title.trim() || '(untitled)', value: content.trim() };
  const data = [...(portal.data ?? []), entry];
  const res = await setContactPortal(uid, { ...portal, data });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, count: data.length };
}

/** Notes action rows: Add Note + Back, shown below the inline notes list. */
function notesMenuRows(uid: string): Array<Array<MenuButton>> {
  return [
    [{ text: 'Add Note', data: `qcmd:notesadd:${uid}` }],
    [{ text: '‹ Back', data: `qcmd:open:${uid}` }],
  ];
}

/** Build the inline notes list text for a contact's portal data entries. */
function buildNotesText(c: ContactRecord): string {
  const entries = extractPortal(c)?.data ?? [];
  if (!entries.length) return `Notes — ${c.name}\n\nNo notes yet.`;
  const blocks = entries.map((e) => {
    const parts = [`• ${e.label || '(untitled)'}`];
    if (e.username) parts.push(`  user: ${e.username}`);
    if (e.password) parts.push(`  pass: ${e.password}`);
    if (e.url) parts.push(`  url: ${e.url}`);
    if (e.value) parts.push(`  ${e.value}`);
    return parts.join('\n');
  });
  return `Notes — ${c.name} (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})\n\n${blocks.join('\n\n')}`;
}

/** Prompt text for the "add to invoice" line-item capture. */
const LINE_ITEM_PROMPT =
  'Send the line item:\n\ndescription | amount | qty\n\n(amount in dollars; qty optional, defaults to 1. /cancel to stop.)';

/** Parse a "description | amount | qty" line into a Crater item. */
function parseLineItem(text: string): { name: string; quantity: number; price: number } | null {
  const parts = text.split('|').map((s) => s.trim());
  const name = parts[0] || '';
  const price = Number((parts[1] ?? '').replace(/[$,]/g, ''));
  const quantity = parts[2] ? Number(parts[2]) : 1;
  if (!name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
  return { name, quantity, price };
}

/** Best-effort resolve a contact to its Crater customer (email match, then name). */
async function resolveCraterCustomer(c: ContactRecord): Promise<CraterCustomer | null> {
  const q = (c.email || c.name || '').trim();
  if (!q) return null;
  const res = await craterSearchCustomers(q);
  if (!res.ok) return null;
  const customers = res.data.customers ?? [];
  const email = (c.email || '').trim().toLowerCase();
  const name = (c.name || '').trim().toLowerCase();
  return (
    (email ? customers.find((x) => (x.email ?? '').trim().toLowerCase() === email) : undefined) ||
    customers.find((x) => x.name.trim().toLowerCase() === name) ||
    customers[0] ||
    null
  );
}

/**
 * Send a client their portal link over a specific channel and report the
 * outcome back to the Telegram chat. Per-channel config + contact-field checks
 * live here so callers just pick 'email' or 'sms'.
 */
async function deliverPortal(
  token: string,
  chatId: number,
  c: ContactRecord,
  uid: string,
  channel: 'email' | 'sms'
): Promise<void> {
  const portal = extractPortal(c);
  if (portal?.enabled === false) {
    await sendResultWithBack(token, chatId, `${c.name}'s portal is hidden (revoked). Re-enable it before sending.`, uid);
    return;
  }
  const url = clientPortalUrl(uid);
  const firstName = (c.firstName || c.name || '').split(/\s+/)[0] || 'there';

  if (channel === 'email') {
    if (!isEmailSendConfigured()) {
      await sendResultWithBack(token, chatId, 'Email not configured. Set RESEND_API_KEY.', uid);
      return;
    }
    if (!c.email) {
      await sendResultWithBack(token, chatId, `${c.name} has no email on file. Add one first.`, uid);
      return;
    }
    const subject = c.company ? `Your client page - ${c.company}` : 'Your client page';
    const bodyText = `Hi ${firstName},\n\nHere's your client page:\n\n${url}\n\nTip: open on iPhone and tap Share -> Add to Home Screen.`;
    const r = await sendEmail({ to: c.email, subject, text: bodyText });
    if (!r.ok) {
      await sendResultWithBack(token, chatId, `Email failed: ${r.error}`, uid);
      return;
    }
    await sendResultWithBack(token, chatId, `Emailed to ${c.email}\n${url}`, uid);
    return;
  }

  if (!isSmsSendConfigured()) {
    await sendResultWithBack(token, chatId, 'SMS not configured. Set TELNYX_API_KEY + TELNYX_FROM_NUMBER.', uid);
    return;
  }
  if (!c.phone) {
    await sendResultWithBack(token, chatId, `${c.name} has no phone on file. Add one first.`, uid);
    return;
  }
  const r = await sendSms({ to: c.phone, body: `Hi ${firstName}, here's your client page: ${url}` });
  if (!r.ok) {
    await sendResultWithBack(token, chatId, `SMS failed: ${r.error}`, uid);
    return;
  }
  await sendResultWithBack(token, chatId, `Texted to ${c.phone}\n${url}`, uid);
}

/**
 * Send a client a document-signing link over a specific channel and report the
 * outcome back to the Telegram chat. Mirrors deliverPortal so "Send Document"
 * actually delivers (email/SMS) instead of just printing the link.
 */
async function deliverDocument(
  token: string,
  chatId: number,
  c: ContactRecord,
  uid: string,
  docUrl: string,
  docTitle: string,
  channel: 'email' | 'sms',
  messageId?: number | null
): Promise<void> {
  const firstName = (c.firstName || c.name || '').split(/\s+/)[0] || 'there';

  if (channel === 'email') {
    if (!isEmailSendConfigured()) {
      await sendResultWithBack(token, chatId, 'Email not configured. Set RESEND_API_KEY.', uid, messageId);
      return;
    }
    if (!c.email) {
      await sendResultWithBack(token, chatId, `${c.name} has no email on file. Add one first.`, uid, messageId);
      return;
    }
    const subject = `Please review and sign: ${docTitle}`;
    const bodyText = `Hi ${firstName},\n\nPlease review and sign this document:\n\n${docUrl}\n\nYou can read and sign it from any device. Once signed, it appears in your portal under Documents.`;
    const r = await sendEmail({ to: c.email, subject, text: bodyText });
    if (!r.ok) {
      await sendResultWithBack(token, chatId, `Email failed: ${r.error}`, uid, messageId);
      return;
    }
    await sendResultWithBack(token, chatId, `${docTitle} emailed to ${c.email}\n${docUrl}`, uid, messageId);
    return;
  }

  if (!isSmsSendConfigured()) {
    await sendResultWithBack(token, chatId, 'SMS not configured. Set TELNYX_API_KEY + TELNYX_FROM_NUMBER.', uid, messageId);
    return;
  }
  if (!c.phone) {
    await sendResultWithBack(token, chatId, `${c.name} has no phone on file. Add one first.`, uid, messageId);
    return;
  }
  const r = await sendSms({ to: c.phone, body: `Hi ${firstName}, please review and sign "${docTitle}": ${docUrl}` });
  if (!r.ok) {
    await sendResultWithBack(token, chatId, `SMS failed: ${r.error}`, uid, messageId);
    return;
  }
  await sendResultWithBack(token, chatId, `${docTitle} texted to ${c.phone}\n${docUrl}`, uid, messageId);
}

/**
 * Send a customer their invoice link over email/SMS and mark it SENT in Crater.
 * Mirrors deliverPortal/deliverDocument; pulls the recipient + public link from
 * the live invoice (so it works whether the invoice was just created or edited).
 */
async function deliverInvoice(
  token: string,
  chatId: number,
  invoiceId: number,
  uid: string,
  messageId?: number | null
): Promise<void> {
  const det = await craterGetInvoice(invoiceId);
  if (!det.ok) {
    await sendResultWithBack(token, chatId, `Couldn't load invoice: ${det.error}`, uid, messageId);
    return;
  }
  const inv = det.data;
  const link = inv.public_url || inv.payment_url || inv.pdf_url || '';
  if (!link) {
    await sendResultWithBack(token, chatId, `${inv.invoice_number} has no shareable link yet.`, uid, messageId);
    return;
  }
  const email = inv.customer?.email?.trim();
  const phone = inv.customer?.phone?.trim();
  const firstName = (inv.customer?.name || '').split(/\s+/)[0] || 'there';
  const amount = fmtMoney(Number(inv.total || 0));
  const useEmail = isEmailSendConfigured() && !!email;
  const useSms = !useEmail && isSmsSendConfigured() && !!phone;

  if (!useEmail && !useSms) {
    // No channel/recipient — surface the link so the user can share it manually.
    const why = !isEmailSendConfigured() && !isSmsSendConfigured()
      ? 'No send channel configured (set RESEND_API_KEY or TELNYX_API_KEY).'
      : `${inv.customer?.name || 'Customer'} has no email or phone on file.`;
    await sendResultWithBack(token, chatId, `${why}\n\n${inv.invoice_number} · ${amount}\n${link}`, uid, messageId);
    return;
  }

  if (useEmail) {
    const subject = `Invoice ${inv.invoice_number}`;
    const bodyText = `Hi ${firstName},\n\nHere's your invoice ${inv.invoice_number} for ${amount}:\n\n${link}\n\nThank you!`;
    const r = await sendEmail({ to: email!, subject, text: bodyText });
    if (!r.ok) {
      await sendResultWithBack(token, chatId, `Email failed: ${r.error}`, uid, messageId);
      return;
    }
  } else {
    const r = await sendSms({ to: phone!, body: `Hi ${firstName}, here's your invoice ${inv.invoice_number} for ${amount}: ${link}` });
    if (!r.ok) {
      await sendResultWithBack(token, chatId, `SMS failed: ${r.error}`, uid, messageId);
      return;
    }
  }

  // Best-effort: flip DRAFT → SENT so the invoice isn't re-treated as unsent.
  let statusNote = '';
  if (String(inv.status).toUpperCase() === 'DRAFT') {
    const upd = await craterUpdateInvoice(invoiceId, { status: 'SENT' });
    if (!upd.ok) statusNote = `\n(Note: couldn't mark as SENT: ${upd.error})`;
  }

  const dest = useEmail ? email : phone;
  const verb = useEmail ? 'Emailed' : 'Texted';
  await sendResultWithBack(token, chatId, `${verb} ${inv.invoice_number} to ${dest}\n${link}${statusNote}`, uid, messageId);
}

/** A single "‹ Back" row that reopens the contact's action card (qcmd:open). */
function backRows(uid: string): Array<Array<MenuButton>> {
  return [[{ text: '‹ Back', data: `qcmd:open:${uid}` }]];
}

/**
 * Send a terminal action result with a trailing "‹ Back" button so the user
 * can jump straight back to the contact card. Always sends a new message so
 * Telegram mobile auto-scrolls to the response instead of silently editing a
 * message that may be far above the fold.
 */
async function sendResultWithBack(
  token: string,
  chatId: number,
  text: string,
  uid: string,
  _messageId?: number | null
): Promise<void> {
  await telegramSendMenu(token, chatId, text, backRows(uid));
}

/** Portal-send buttons for a contact, gated on configured channel + contact field. */
function portalSendButtons(c: ContactRecord, uid: string): MenuButton[] {
  const btns: MenuButton[] = [];
  if (isEmailSendConfigured() && c.email) btns.push({ text: '✉︎ Portal', data: `qcmd:portalemail:${uid}` });
  if (isSmsSendConfigured() && c.phone) btns.push({ text: '🗨︎ Portal', data: `qcmd:portalsms:${uid}` });
  return btns;
}

/**
 * Build the contact "card" text + action-button rows shown once a client is
 * found. Every per-client action lives here as a button (no slash command
 * needed), so this is the single source for both the /contacts result and the
 * qcmd:open callback.
 */
function buildContactActionMenu(
  c: ContactRecord,
  uid: string
): { text: string; rows: Array<Array<MenuButton>> } {
  const infoLines = [c.name ?? uid];
  if (c.company) infoLines.push(c.company);
  if (c.email) infoLines.push(c.email);
  if (c.phone) infoLines.push(c.phone);
  if (c.notes?.trim()) infoLines.push('', c.notes.trim());
  const stamps: string[] = [];
  if (c.createdAt) stamps.push(`added ${timeAgo(c.createdAt)}`);
  if (c.updatedAt) stamps.push(`updated ${timeAgo(c.updatedAt)}`);
  if (stamps.length) infoLines.push('', stamps.join(' · '));
  const hasDoc = listTemplates().length > 0;
  // One button per row (full width) — easier to tap one-handed on mobile.
  const rows: Array<Array<MenuButton>> = [
    [{ text: '⧉ Portal', copy: clientPortalUrl(uid) }],
    ...portalSendButtons(c, uid).map((b) => [b]),
    ...(isCraterConfigured() ? [[{ text: 'Add to invoice', data: `qcmd:invoice:${uid}` }]] : []),
    [{ text: 'Notes', data: `qcmd:notes:${uid}` }],
    [{ text: 'Meta', data: `qcmd:meta:${uid}` }],
    ...(hasDoc ? [[{ text: '✎ Send Document', data: `qcmd:document:${uid}` }]] : []),
  ];
  return { text: infoLines.join('\n'), rows };
}

// ─── slash command handler ────────────────────────────────────────────────────

async function handleSlashCommand(text: string): Promise<string | null> {
  const t = text.trim();

  // ── /knowledge ───────────────────────────────────────────────────────────────
  if (t === '/knowledge' || t === '/start') {
    const slugs = listKnowledgeSlugs();
    return slugs.length ? `Knowledge slugs:\n${slugs.map((s) => `- ${s}`).join('\n')}` : 'No knowledge files bundled.';
  }

  // ── /get <slug> ────────────────────────────────────────────────────────────
  const getMatch = t.match(/^\/get\s+([a-z0-9._-]+)\s*$/i);
  if (getMatch) {
    const slug = getMatch[1].toLowerCase();
    const doc = readKnowledgeMarkdown(slug);
    if (!doc) return `Unknown slug "${slug}". Use /knowledge.`;
    const cap = 3500;
    return doc.content.length > cap ? `${doc.content.slice(0, cap)}\n...(truncated)` : doc.content;
  }

  // ── /contacts [query] ──────────────────────────────────────────────────────
  if (t === '/contacts') {
    if (!isContactApiConfigured()) return noApi();
    return '__CONTACTS_LIST__';
  }
  const contactsSearch = t.match(/^\/contacts\s+(.+)$/i);
  if (contactsSearch) {
    if (!isContactApiConfigured()) return noApi();
    const q = contactsSearch[1].trim();
    const res = await listContacts({ q, limit: 10 });
    if (!res.ok) return `contacts failed: ${res.error}`;
    const { contacts } = res.data;
    if (!contacts.length) return `No contacts found for "${q}".`;
    if (contacts.length === 1) {
      return `__CONTACTS_SINGLE__:${contacts[0].uid}`;
    }
    return `__CONTACTS_PICK__:${q}`;
  }

  // ── /portal <name> ─────────────────────────────────────────────────────────
  if (t === '/portal') return 'Usage: /portal <name>\nExample: /portal John Smith';
  const portalMatch = t.match(/^\/portal\s+(.+)$/i);
  if (portalMatch) {
    if (!isContactApiConfigured()) return noApi();
    const name = portalMatch[1].trim();
    const resolved = await resolveContact({ name });
    if (!resolved.ok) return `resolve failed: ${resolved.error}`;
    const d = resolved.data as { match?: string; contact?: { uid?: string; name?: string }; candidates?: Array<{ uid?: string; name?: string }> };
    if ((d.match === 'exact' || d.match === 'likely') && d.contact?.uid) {
      return `__PORTAL_RESULT__:${d.contact.uid}`;
    }
    const portalCands = d.candidates ?? [];
    if (portalCands.length === 1 && portalCands[0].uid) return `__CONFIRM__:portal:${portalCands[0].uid}`;
    return fmtNoMatch('portal', name, portalCands);
  }

  // ── /portalsend <name> ─────────────────────────────────────────────────────
  if (t === '/portalsend') return 'Usage: /portalsend <name>\nExample: /portalsend John Smith';
  const portalSendMatch = t.match(/^\/portalsend\s+(.+)$/i);
  if (portalSendMatch) {
    if (!isContactApiConfigured()) return noApi();
    if (!isEmailSendConfigured() && !isSmsSendConfigured()) {
      return 'No outbound channel configured. Set RESEND_API_KEY (email) or TELNYX_API_KEY + TELNYX_FROM_NUMBER (SMS).';
    }
    const name = portalSendMatch[1].trim();
    const resolved = await resolveContact({ name });
    if (!resolved.ok) return `resolve failed: ${resolved.error}`;
    const d = resolved.data as { match?: string; contact?: { uid?: string; name?: string }; candidates?: Array<{ name?: string }> };
    if ((d.match !== 'exact' && d.match !== 'likely') || !d.contact?.uid) {
      const psCands = (d.candidates ?? []) as Array<{ uid?: string; name?: string }>;
      if (psCands.length === 1 && psCands[0].uid) return `__CONFIRM__:portalsend:${psCands[0].uid}`;
      return fmtNoMatch('portalsend', name, psCands);
    }
    const uid = d.contact.uid;
    const full = await getContact(uid);
    if (!full.ok) return `Could not load contact: ${full.error}`;
    const c = full.data;
    const portal = extractPortal(c);
    if (portal?.enabled === false) return `${c.name}'s portal is hidden (revoked). Re-enable it before sending.`;
    const url = clientPortalUrl(uid);
    const firstName = (c.firstName || c.name || '').split(/\s+/)[0] || 'there';
    if (isEmailSendConfigured() && c.email) {
      const subject = c.company ? `Your client page - ${c.company}` : 'Your client page';
      const bodyText = `Hi ${firstName},\n\nHere's your client page:\n\n${url}\n\nTip: open on iPhone and tap Share -> Add to Home Screen.`;
      const r = await sendEmail({ to: c.email, subject, text: bodyText });
      if (!r.ok) return `Email failed: ${r.error}`;
      return `Sent to ${c.email}\n${url}`;
    }
    if (isSmsSendConfigured() && c.phone) {
      const r = await sendSms({ to: c.phone, body: `Hi ${firstName}, here's your client page: ${url}` });
      if (!r.ok) return `SMS failed: ${r.error}`;
      return `Sent to ${c.phone}\n${url}`;
    }
    return `${c.name} has no email or phone on file. Add one first.`;
  }

  // ── /notes <name> ──────────────────────────────────────────────────────────
  if (t === '/notes') return 'Usage: /notes <name>\nExample: /notes John Smith';
  const notesMatch = t.match(/^\/notes\s+(.+)$/i);
  if (notesMatch) {
    if (!isContactApiConfigured()) return noApi();
    const name = notesMatch[1].trim();
    const resolved = await resolveContact({ name });
    if (!resolved.ok) return `resolve failed: ${resolved.error}`;
    const d = resolved.data as { match?: string; contact?: { uid?: string; name?: string }; candidates?: Array<{ name?: string }> };
    if ((d.match === 'exact' || d.match === 'likely') && d.contact?.uid) {
      return `__NOTES_MENU__:${d.contact.uid}`;
    }
    const slCands = (d.candidates ?? []) as Array<{ uid?: string; name?: string }>;
    if (slCands.length === 1 && slCands[0].uid) return `__CONFIRM__:notes:${slCands[0].uid}`;
    return fmtNoMatch('notes', name, slCands);
  }

  // ── /invoices ──────────────────────────────────────────────────────────────
  if (t === '/invoices') {
    if (!isCraterConfigured()) return noApi('Crater');
    const res = await craterListInvoices();
    if (!res.ok) return `invoices failed: ${res.error}`;
    const invs = (res.data.invoices ?? []).slice(0, 15);
    if (!invs.length) return 'No invoices found.';
    const lines = [`Recent invoices (${res.data.count} total):`];
    for (const inv of invs) {
      const num = inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id}`;
      const customer = inv.customer_name ?? '?';
      const total = fmtMoney(Number(inv.total ?? 0));
      const status = String(inv.status ?? '').toLowerCase();
      lines.push(`${num} - ${customer} - ${total} - ${status}`);
    }
    return lines.join('\n');
  }

  // ── /status ────────────────────────────────────────────────────────────────
  if (t === '/status') {
    const res = await checkDeploymentStatus();
    if (!res.ok) return `status failed: ${res.error}`;
    const d = res.data as Record<string, unknown>;
    if (d.summary) return String(d.summary);
    return JSON.stringify(d, null, 2).slice(0, 800);
  }

  // ── /commits [n] ───────────────────────────────────────────────────────────
  if (t === '/commits' || t.match(/^\/commits\s+\d+$/i)) {
    const limitMatch = t.match(/\/commits\s+(\d+)/i);
    const limit = limitMatch ? Math.min(parseInt(limitMatch[1], 10), 20) : 7;
    const res = await getRecentCommits({ limit });
    if (!res.ok) return `commits failed: ${res.error}`;
    const d = res.data as { branch?: string; commits?: Array<{ sha?: string; message?: string; author?: string; date?: string }> };
    const commits = d.commits ?? [];
    if (!commits.length) return 'No commits found.';
    const lines = [`Recent commits - ${d.branch ?? 'main'}:`];
    for (const c of commits) {
      const sha = (c.sha ?? '').slice(0, 7);
      const msg = (c.message ?? '').split('\n')[0].slice(0, 60);
      const ago = timeAgo(c.date);
      lines.push(`${sha}  ${msg}${ago ? `  (${ago})` : ''}`);
    }
    return lines.join('\n');
  }

  // ── /resolve / /who ────────────────────────────────────────────────────────
  const resolveMatch = t.match(/^\/(?:resolve|who)\s+(.+)$/i);
  if (resolveMatch) {
    const name = resolveMatch[1].trim();
    if (!isContactApiConfigured()) return noApi();
    const result = await resolveContact({ name });
    if (!result.ok) return `resolve failed: ${result.error}`;
    return formatResolveForTelegram(result.data);
  }
  if (t === '/resolve' || t === '/who') return 'Usage: /resolve <name>  or  /who <name>';

  // ── /railway ───────────────────────────────────────────────────────────────
  if (t === '/railway' || t === '/railway help') {
    return '/railway project <name> - create a new empty Railway project\nNeeds RAILWAY_API_TOKEN on Astro.';
  }
  const railwayProj = t.match(/^\/railway\s+project\s+(.+)$/i);
  if (railwayProj) {
    const name = railwayProj[1].trim();
    if (!name) return 'Usage: /railway project <name>';
    const out = await createRailwayEmptyProject(name);
    if (!out.ok) return `Railway: ${out.message}`;
    const dash = `https://railway.com/project/${out.id}/`;
    return `Created "${out.name}"\n${out.id === '(dry-run)' ? '(dry run)' : `Open: ${dash}`}`;
  }

  // ── /document ──────────────────────────────────────────────────────────────
  if (t === '/document') return 'Usage: /document <name>\nExample: /document John Smith';
  if (t.match(/^\/document\s/i)) return '__DOCUMENT_MENU__';

  // ── /voice on|off ─────────────────────────────────────────────────────────
  const voiceToggle = t.match(/^\/voice\s+(on|off)$/i);
  if (voiceToggle) {
    if (!isTelnyxConfigured()) return 'Telnyx not configured. Set TELNYX_API_KEY.';
    const enable = voiceToggle[1].toLowerCase() === 'on';
    setVoiceAgentEnabled(enable);
    return `Voice agent ${enable ? 'enabled ✅' : 'disabled ⛔'}.\nNote: resets on server restart. Set VOICE_AGENT_ENABLED=1 in env to persist.`;
  }
  if (t === '/voice') return 'Usage: /voice on|off\nToggle the AI phone agent for inbound Telnyx calls.';

  // ── /calls ─────────────────────────────────────────────────────────────────
  if (t === '/calls') {
    const all = listActiveSessions();
    if (!all.length) return 'No active calls.';
    const lines = [`Active calls (${all.length}):`];
    for (const s of all) {
      lines.push(`- ${s.from} → ${s.to}  [${s.mode}]  ${s.durationSecs()}s`);
    }
    lines.push('', '/takeover <phone> to transfer a call to your number.');
    return lines.join('\n');
  }

  // ── /takeover <phone> ──────────────────────────────────────────────────────
  if (t === '/takeover') return 'Usage: /takeover <caller-phone>\nExample: /takeover +12125551234\nTransfers that active call to TELNYX_OPERATOR_NUMBER.';
  const takeoverMatch = t.match(/^\/takeover\s+(\+?\d[\d\s\-().]+)$/i);
  if (takeoverMatch) {
    if (!isTelnyxConfigured()) return 'Telnyx not configured.';
    const operatorNumber = serverEnv('TELNYX_OPERATOR_NUMBER')?.trim();
    if (!operatorNumber) return 'TELNYX_OPERATOR_NUMBER not set. Set it to your phone number (E.164).';
    const searchPhone = takeoverMatch[1].trim().replace(/\s/g, '');
    const sessions = listActiveSessions();
    const session = sessions.find((s) => s.from === searchPhone || s.from.replace(/\s/g, '') === searchPhone);
    if (!session) return `No active call from ${searchPhone}.\nUse /calls to see active calls.`;
    const r = await telnyxTransferCall(session.callControlId, operatorNumber);
    if (!r.ok) return `Transfer failed: ${r.error}`;
    return `Transferring ${session.from} to ${operatorNumber}…\nYou should receive an incoming call now.`;
  }

  // ── /ai ────────────────────────────────────────────────────────────────────
  if (t === '/ai') return 'Usage: /ai <your question>\nExample: /ai What\'s the status of the last deployment?';

  // ── /registercommands (hidden admin) ───────────────────────────────────────
  if (t === '/registercommands') return '__REGISTER_COMMANDS__';

  // ── /clear ─────────────────────────────────────────────────────────────────
  if (t === '/clear' || t === '/reset') return '__CLEAR_HISTORY__';

  // ── /help ──────────────────────────────────────────────────────────────────
  if (t === '/help') {
    const hasC = isContactApiConfigured();
    const hasB = isCraterConfigured();
    const hasTelnyx = isTelnyxConfigured();
    const lines = [
      'BUSINESS COMMANDS:',
      ...(hasC ? [
        '/contacts [query]  — list or search clients',
        '/portal <name>  — portal link + summary',
        '/portalsend <name>  — email/SMS the link',
        '/notes <name>  — add or view client data',
        '/document <name>  — send a document to sign',
      ] : []),
      ...(hasB ? [
        '/invoices  — recent invoices',
      ] : []),
      '',
      'DEV / OPS:',
      '/status  — deployment health',
      '/commits [n]  — recent git commits',
      '/railway project <name>  — create project',
      '/knowledge   /get <slug>  — knowledge docs',
      '/clear  — clear chat history',
      ...(hasTelnyx ? [
        '',
        'VOICE & SMS (Telnyx):',
        `/voice on|off  — AI phone agent (currently ${isVoiceAgentEnabled() ? 'ON ✅' : 'OFF ⛔'})`,
        '/calls  — list active calls',
        '/takeover <phone>  — transfer call to your number',
      ] : []),
      '',
      'CLAUDE (AI):',
      '/ai <question>  — ask Claude anything',
      '',
      'Or just type freely — Claude handles anything not matched above.',
    ];
    return lines.join('\n');
  }

  return null;
}
export type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    from?: { id?: number };
    text?: string;
    reply_to_message?: { text?: string };
  };
  callback_query?: {
    id?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number }; message_id?: number };
    data?: string;
  };
};

function enrichUserText(text: string, replyTo?: { text?: string }): string {
  const quoted = replyTo?.text?.trim();
  if (!quoted) return text;
  const cap = 800;
  const snippet = quoted.length > cap ? `${quoted.slice(0, cap)}…` : quoted;
  return `[User is replying to this earlier message:\n"${snippet}"]\n\n${text}`;
}

export async function handleTelegramTextMessage(opts: {
  token: string;
  update: TelegramUpdate;
}): Promise<void> {
  const { token, update } = opts;
  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;
  const fromId = update.message?.from?.id;

  if (chatId == null || fromId == null) {
    console.log('[telegram] ignored update (missing chat or user id)');
    return;
  }

  const prod = import.meta.env.PROD;
  const allowed = parseAllowedUserIds(serverEnv('TELEGRAM_ALLOWED_USER_IDS'));
  if (!isUserAllowed(fromId, allowed, prod)) {
    await telegramSendMessage(token, chatId, 'Unauthorized for this bot.');
    return;
  }

  if (!text) {
    await telegramSendMessage(token, chatId, 'Send text. Try /help.');
    return;
  }

  // ── Meta edit capture ──────────────────────────────────────────────────────
  // If a Meta field button was just tapped, the next plain message is the value.
  // Slash commands abort the edit (so a stray command isn't captured as a value).
  if (text.startsWith('/')) {
    const aborted = peekPendingEdit(chatId);
    if (aborted) {
      clearPendingEdit(chatId);
      if (text === '/cancel') {
        await telegramSendMessage(token, chatId, 'Edit cancelled.');
        return;
      }
    }
  } else {
    const pending = peekPendingEdit(chatId);
    // ── Notes → Add: two-step capture (title, then content) ──────────────────
    if (pending && pending.kind === 'note') {
      if (pending.step === 'title') {
        const title = text.trim();
        setPendingEdit(chatId, { kind: 'note', step: 'content', uid: pending.uid, name: pending.name, title });
        await telegramSendMessage(
          token,
          chatId,
          `Title: ${title}\n\nWhat's the content of the note?\n\n(Send /cancel to stop.)`
        );
        return;
      }
      // step === 'content' → save the note
      takePendingEdit(chatId);
      const title = pending.title || '(untitled)';
      const res = await addClientNote(pending.uid, title, text);
      if (!res.ok) {
        await telegramSendMessage(token, chatId, `Couldn't save note: ${res.error}`);
        return;
      }
      // Reload so buildNotesText shows the just-added entry.
      const refreshed = await getContact(pending.uid);
      const savedHeader = `Note saved: "${title}"\n\n`;
      const notesBody = refreshed.ok
        ? buildNotesText(refreshed.data)
        : `Notes — ${pending.name}\n${res.count} entr${res.count === 1 ? 'y' : 'ies'} on file`;
      await telegramSendMenu(token, chatId, savedHeader + notesBody, notesMenuRows(pending.uid));
      return;
    }
    // ── Add to invoice: next message is "description | amount | qty" ─────────
    if (pending && pending.kind === 'invoice') {
      const item = parseLineItem(text);
      if (!item) {
        // Leave the pending intent armed so they can just retry.
        await telegramSendMessage(token, chatId, `Couldn't parse that. ${LINE_ITEM_PROMPT}`);
        return;
      }
      takePendingEdit(chatId);
      if (pending.invoiceId != null) {
        const res = await craterAddInvoiceItems(pending.invoiceId, [item]);
        if (!res.ok) {
          await telegramSendMessage(token, chatId, `Couldn't add item: ${res.error}`);
          return;
        }
        const d = res.data;
        const msg = `Added to ${d.invoice_number}:\n${item.name} ×${item.quantity} @ ${fmtMoney(item.price)}\n\nNew total: ${fmtMoney(Number(d.new_total))}`;
        await telegramSendMenu(token, chatId, msg, [
          [{ text: '+ Add another', data: `inv:more:${pending.invoiceId}:${pending.uid}` }],
          [{ text: '➤ Send invoice', data: `inv:send:${pending.invoiceId}:${pending.uid}` }],
          [{ text: '‹ Back', data: `qcmd:open:${pending.uid}` }],
        ]);
        return;
      }
      const res = await craterCreateInvoice({ customerName: pending.customerName, items: [item] });
      if (!res.ok) {
        await telegramSendMessage(token, chatId, `Couldn't create invoice: ${res.error}`);
        return;
      }
      const inv = res.data;
      await telegramSendMenu(token, chatId, formatCreatedInvoice(inv), [
        [{ text: '+ Add another', data: `inv:more:${inv.invoice_id}:${pending.uid}` }],
        [{ text: '➤ Send invoice', data: `inv:send:${inv.invoice_id}:${pending.uid}` }],
        [{ text: '‹ Back', data: `qcmd:open:${pending.uid}` }],
      ]);
      return;
    }
    // ── Meta confirm: user typed again instead of tapping a choice ───────────
    if (pending && pending.kind === 'metaconfirm') {
      const full = await getContact(pending.uid);
      if (!full.ok) {
        clearPendingEdit(chatId);
        await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
        return;
      }
      await promptBusinessNameConfirm(token, chatId, full.data, pending.field, text);
      return;
    }
    // ── Meta edit: next message is the new field value ───────────────────────
    if (pending && pending.kind === 'meta') {
      // Guard: setting a first/last name on a business-looking contact (with no
      // Company) would rewrite the business name — confirm intent first.
      if (pending.field === 'firstname' || pending.field === 'lastname') {
        const full = await getContact(pending.uid);
        if (full.ok && !(full.data.company || '').trim() && looksLikeBusinessName(full.data.name)) {
          takePendingEdit(chatId);
          await promptBusinessNameConfirm(token, chatId, full.data, pending.field, text);
          return;
        }
      }
      takePendingEdit(chatId);
      const label = metaFieldLabel(pending.field);
      const result = await applyMetaEdit(pending.uid, pending.field, text);
      if (!result.ok) {
        await telegramSendMessage(token, chatId, `Update failed: ${result.error}`);
        return;
      }
      const menu = buildContactActionMenu(result.data, pending.uid);
      await telegramSendMenu(token, chatId, `${label} updated.\n\n${menu.text}`, menu.rows);
      return;
    }
  }

  // /ai <query> — explicit Claude route; strip prefix and treat as freeform
  const aiMatch = text.match(/^\/ai\s+(.+)$/is);
  if (aiMatch) {
    const userText = enrichUserText(aiMatch[1].trim(), update.message?.reply_to_message);
    const priorTurns = getChatHistory(chatId);
    const reply = await runTelegramKnowledgeAgent({ userText, priorTurns });
    appendChatTurns(chatId, [
      { role: 'user', content: userText },
      { role: 'assistant', content: reply },
    ]);
    await telegramSendMessage(token, chatId, reply);
    return;
  }

  const slash = await handleSlashCommand(text);
  if (slash === '__CLEAR_HISTORY__') {
    clearChatHistory(chatId);
    await telegramSendMessage(token, chatId, 'Conversation history cleared.');
    return;
  }
  if (slash === '__REGISTER_COMMANDS__') {
    const commands = buildCommandList();
    const res = await telegramSetMyCommands(token, commands);
    await telegramSendMessage(
      token,
      chatId,
      res.ok
        ? `Registered ${commands.length} commands with Telegram.`
        : `setMyCommands failed: ${res.error}`
    );
    return;
  }

  if (slash?.startsWith('__CONFIRM__:')) {
    const rest = slash.slice('__CONFIRM__:'.length);
    const sep = rest.indexOf(':');
    const cmd = sep >= 0 ? rest.slice(0, sep) : rest;
    const uid = sep >= 0 ? rest.slice(sep + 1) : '';
    const full = uid ? await getContact(uid) : null;
    const displayName = full?.ok ? full.data.name : uid || '?';
    await telegramSendMenu(token, chatId, `Did you mean ${displayName}?`, [[
      { text: '✓ Yes', data: `qcmd:${cmd}:${uid}` },
      { text: '✗ No', data: 'cancel:' },
    ]]);
    return;
  }

  if (slash?.startsWith('__NOTES_MENU__:')) {
    const uid = slash.slice('__NOTES_MENU__:'.length);
    const full = await getContact(uid);
    if (!full.ok) {
      await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
      return;
    }
    await telegramSendMenu(token, chatId, buildNotesText(full.data), notesMenuRows(uid));
    return;
  }

  if (slash === '__CONTACTS_LIST__') {
    const res = await listContacts({ limit: 200 });
    if (!res.ok) {
      await telegramSendMessage(token, chatId, `contacts failed: ${res.error}`);
      return;
    }
    const { total, contacts } = res.data;
    if (!contacts.length) {
      await telegramSendMessage(token, chatId, 'No contacts found.');
      return;
    }
    // One tappable button per client (name only) → opens the action card,
    // exactly as if you'd run /contacts <name>. Telegram caps inline keyboards,
    // so show the first 100 and tell the user to search if there are more.
    const sorted = [...contacts].sort((a, b) =>
      (a.name ?? a.uid ?? '').localeCompare(b.name ?? b.uid ?? '', undefined, { sensitivity: 'base' })
    );
    const shown = sorted.slice(0, 100);
    // Pack contacts into a flowing, inline-block-style cascade: short names
    // share a row, longer names take more room. Telegram keyboards are a fixed
    // grid, so we approximate "wrap to fit" by a per-row character budget.
    const ROW_CHAR_BUDGET = 28; // ~chars that read comfortably across a mobile row
    const MAX_COLS = 4;
    const rows: Array<Array<MenuButton>> = [];
    let current: Array<MenuButton> = [];
    let used = 0;
    for (const c of shown) {
      const label = (c.name ?? c.uid ?? '?').slice(0, 64);
      const weight = label.length + 3; // allow for button padding
      if (current.length > 0 && (used + weight > ROW_CHAR_BUDGET || current.length >= MAX_COLS)) {
        rows.push(current);
        current = [];
        used = 0;
      }
      current.push({ text: label, data: `qcmd:open:${c.uid}` });
      used += weight;
    }
    if (current.length) rows.push(current);
    const header =
      shown.length < total
        ? `Contacts (showing ${shown.length} of ${total}) — tap a client, or /contacts <name> to search:`
        : `Contacts (${total} total) — tap a client:`;
    await telegramSendMenu(token, chatId, header, rows);
    return;
  }

  if (slash?.startsWith('__CONTACTS_SINGLE__:')) {
    const uid = slash.slice('__CONTACTS_SINGLE__:'.length);
    const full = await getContact(uid);
    if (!full.ok) {
      await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
      return;
    }
    const menu = buildContactActionMenu(full.data, uid);
    await telegramSendMenu(token, chatId, menu.text, menu.rows);
    return;
  }

  if (slash?.startsWith('__CONTACTS_PICK__:')) {
    const q = slash.slice('__CONTACTS_PICK__:'.length);
    const res = await listContacts({ q, limit: 10 });
    if (!res.ok) {
      await telegramSendMessage(token, chatId, `contacts failed: ${res.error}`);
      return;
    }
    const { contacts } = res.data;
    if (!contacts.length) {
      await telegramSendMessage(token, chatId, `No contacts found for "${q}".`);
      return;
    }
    const rows = contacts.map((c) => {
      const detail = c.company || c.email || c.phone || '';
      const label = detail ? `${c.name} — ${detail}` : c.name;
      return [{ text: label.slice(0, 60), data: `qcmd:open:${c.uid}` }];
    });
    await telegramSendMenu(token, chatId, `${contacts.length} matches for "${q}" — pick one:`, rows);
    return;
  }

  if (slash?.startsWith('__PORTAL_RESULT__:')) {
    const uid = slash.slice('__PORTAL_RESULT__:'.length);
    const full = await getContact(uid);
    if (!full.ok) {
      await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
      return;
    }
    const c = full.data;
    const portal = extractPortal(c);
    const dataCount = portal?.data?.length ?? 0;
    const hasOverview = Boolean(portal?.headline || portal?.body || (portal?.fields?.length ?? 0) > 0);
    const summaryLines = [
      `${c.name}${c.company ? ` - ${c.company}` : ''}`,
      c.email ?? '',
      '',
      clientPortalUrl(uid),
      '',
      `Overview: ${hasOverview ? 'has content' : 'empty'}`,
      `Data tab: ${dataCount > 0 ? `${dataCount} entr${dataCount === 1 ? 'y' : 'ies'}` : 'empty'}`,
      `Live: ${portal?.enabled === false ? 'hidden (revoked)' : 'yes'}`,
    ].filter(Boolean).join('\n');
    const hasDoc = listTemplates().length > 0;
    const portalRows: Array<Array<MenuButton>> = [
      ...portalSendButtons(c, uid).map((b) => [b]),
      [{ text: 'Notes', data: `qcmd:notes:${uid}` }],
      ...(hasDoc ? [[{ text: '✎ Send Document', data: `qcmd:document:${uid}` }]] : []),
    ];
    await telegramSendMenu(token, chatId, summaryLines, portalRows);
    return;
  }

  if (slash === '__DOCUMENT_MENU__') {
    const docMatch = text.match(/^\/document\s+(.+)$/i);
    const name = docMatch ? docMatch[1].trim() : '';
    if (!name) {
      await telegramSendMessage(token, chatId, 'Usage: /document <name>\nExample: /document John Smith');
      return;
    }
    if (!isContactApiConfigured()) {
      await telegramSendMessage(token, chatId, noApi());
      return;
    }
    const resolved = await resolveContact({ name });
    if (!resolved.ok) {
      await telegramSendMessage(token, chatId, `resolve failed: ${resolved.error}`);
      return;
    }
    const d = resolved.data as { match?: string; contact?: { uid?: string; name?: string }; candidates?: Array<{ name?: string }> };
    if ((d.match !== 'exact' && d.match !== 'likely') || !d.contact?.uid) {
      const docCands = (d.candidates ?? []) as Array<{ uid?: string; name?: string }>;
      if (docCands.length === 1 && docCands[0].uid) {
        const full = await getContact(docCands[0].uid);
        const displayName = full.ok ? full.data.name : (docCands[0].name ?? docCands[0].uid ?? '?');
        await telegramSendMenu(token, chatId, `Did you mean ${displayName}?`, [[
          { text: '✓ Yes', data: `qcmd:document:${docCands[0].uid}` },
          { text: '✗ No', data: 'cancel:' },
        ]]);
        return;
      }
      await telegramSendMessage(token, chatId, fmtNoMatch('document', name, docCands));
      return;
    }
    const uid = d.contact.uid;
    const cName = d.contact.name ?? name;
    const templates = listTemplates();
    if (!templates.length) {
      await telegramSendMessage(token, chatId, 'No document templates found. Add HTML files to src/content/documents/.');
      return;
    }
    // Telegram callback_data max 64 bytes — keep template slugs short
    const buttons = templates.map((tmpl) => ({
      text: tmpl.title,
      data: `doc:${uid}:${tmpl.slug}`,
    }));
    // 2 per row
    const rows: Array<Array<{ text: string; data: string }>> = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    await telegramSendMenu(token, chatId, `Send a document to ${cName} — choose a template:`, rows);
    return;
  }
  if (slash) {
    await telegramSendMessage(token, chatId, slash);
    return;
  }

  // Unknown slash commands get a helpful nudge instead of going to the LLM.
  if (text.startsWith('/')) {
    await telegramSendMessage(token, chatId, 'Unknown command. Try /help.');
    return;
  }

  const userText = enrichUserText(text, update.message?.reply_to_message);
  const priorTurns = getChatHistory(chatId);
  const reply = await runTelegramKnowledgeAgent({ userText, priorTurns });
  appendChatTurns(chatId, [
    { role: 'user', content: userText },
    { role: 'assistant', content: reply },
  ]);
  await telegramSendMessage(token, chatId, reply);
}

/** Handle Telegram inline keyboard button presses (callback_query). */
export async function handleTelegramCallbackQuery(opts: {
  token: string;
  update: TelegramUpdate;
}): Promise<void> {
  const { token, update } = opts;
  const cb = update.callback_query;
  if (!cb) return;

  const callbackId = cb.id ?? '';
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const fromId = cb.from?.id;
  const data = cb.data ?? '';

  // Always ack immediately to remove Telegram's loading spinner.
  if (callbackId) await telegramAnswerCallback(token, callbackId);

  if (chatId == null || fromId == null) {
    console.error('[telegram] callback_query missing chatId or fromId', { callbackId, chatId, fromId, data });
    return;
  }

  const prod = import.meta.env.PROD;
  const allowed = parseAllowedUserIds(serverEnv('TELEGRAM_ALLOWED_USER_IDS'));
  if (!isUserAllowed(fromId, allowed, prod)) {
    console.warn('[telegram] callback_query fromId not allowed', { fromId });
    return;
  }

  if (data.startsWith('cancel:') || data === 'cancel:') {
    await telegramSendMessage(token, chatId, 'OK.');
    return;
  }

  // qcmd:metaset:{field}:{uid} — user picked a Meta field to edit. Stash the
  // intent and ask them to type the value. Parsed first because the uid is the
  // LAST segment here (unlike the generic qcmd:{cmd}:{uid} shape below).
  if (data.startsWith('qcmd:metaset:')) {
    const rest = data.slice('qcmd:metaset:'.length);
    const sep = rest.indexOf(':');
    const field = (sep >= 0 ? rest.slice(0, sep) : rest) as MetaField;
    const uid = sep >= 0 ? rest.slice(sep + 1) : '';
    const valid: MetaField[] = ['firstname', 'lastname', 'company', 'phone', 'email'];
    if (!uid || !valid.includes(field)) {
      await telegramSendMessage(token, chatId, 'Invalid field.');
      return;
    }
    const full = await getContact(uid);
    if (!full.ok) {
      await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
      return;
    }
    setPendingEdit(chatId, { kind: 'meta', uid, field, name: full.data.name });
    const label = metaFieldLabel(field);
    const promptMsg = `Send the new ${label} for ${full.data.name} in the chat.\n\n(Send /cancel to abort.)`;
    await telegramSendMessage(token, chatId, promptMsg);
    return;
  }

  // qcmd:metafix:{action}:{uid} — resolve a risky first/last-name edit flagged
  // as a likely business name. The typed value lives in the stashed metaconfirm.
  // Parsed before the generic qcmd handler (uid is the LAST segment here).
  if (data.startsWith('qcmd:metafix:')) {
    const rest = data.slice('qcmd:metafix:'.length);
    const sep = rest.indexOf(':');
    const action = sep >= 0 ? rest.slice(0, sep) : rest; // company | rename | cancel
    const uid = sep >= 0 ? rest.slice(sep + 1) : '';
    const pending = takePendingEdit(chatId);
    if (action === 'cancel') {
      await telegramSendMessage(token, chatId, 'Edit cancelled.');
      return;
    }
    if (!pending || pending.kind !== 'metaconfirm' || pending.uid !== uid) {
      await telegramSendMessage(token, chatId, 'That edit expired. Open the contact and try again.');
      return;
    }
    const result =
      action === 'company'
        ? // Treat the existing name as the business: keep it as Company and set
          // `name` to the person value the user typed.
          await updateContact(uid, { company: pending.currentName, name: pending.value })
        : await applyMetaEdit(uid, pending.field, pending.value);
    if (!result.ok) {
      await telegramSendMessage(token, chatId, `Update failed: ${result.error}`);
      return;
    }
    const note = action === 'company' ? 'Company set; contact name updated.' : 'Contact name updated.';
    const menu = buildContactActionMenu(result.data, uid);
    await telegramSendMenu(token, chatId, `${note}\n\n${menu.text}`, menu.rows);
    return;
  }

  if (data.startsWith('qcmd:')) {
    // Format: qcmd:{cmd}:{uid}  e.g. qcmd:portal:53b12d12-...
    const rest = data.slice(5);
    const sep = rest.indexOf(':');
    const cmd = sep >= 0 ? rest.slice(0, sep) : rest;
    const uid = sep >= 0 ? rest.slice(sep + 1) : '';
    if (!cmd || !uid) {
      await telegramSendMessage(token, chatId, 'Invalid quick command.');
      return;
    }
    const full = await getContact(uid);
    if (!full.ok) {
      await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
      return;
    }
    const c = full.data;

    if (cmd === 'open') {
      const menu = buildContactActionMenu(c, uid);
      // Send a new message (don't edit in place): Telegram mobile auto-scrolls
      // to new messages but not to edits, so a tall full-width keyboard added
      // via edit lands below the fold.
      await telegramSendMenu(token, chatId, menu.text, menu.rows);
      return;
    }

    if (cmd === 'portal') {
      const portal = extractPortal(c);
      const dataCount = portal?.data?.length ?? 0;
      const hasOverview = Boolean(portal?.headline || portal?.body || (portal?.fields?.length ?? 0) > 0);
      await sendResultWithBack(token, chatId, [
        `${c.name}${c.company ? ` - ${c.company}` : ''}`,
        c.email ?? '',
        '',
        clientPortalUrl(uid),
        '',
        `Overview: ${hasOverview ? 'has content' : 'empty'}`,
        `Data tab: ${dataCount > 0 ? `${dataCount} entr${dataCount === 1 ? 'y' : 'ies'}` : 'empty'}`,
        `Live: ${portal?.enabled === false ? 'hidden (revoked)' : 'yes'}`,
      ].filter(Boolean).join('\n'), uid);
      return;
    }

    if (cmd === 'portalemail' || cmd === 'portalsms' || cmd === 'portalsend') {
      // portalsend (legacy/auto) prefers email when available, else SMS.
      const channel: 'email' | 'sms' =
        cmd === 'portalsms'
          ? 'sms'
          : cmd === 'portalemail'
            ? 'email'
            : isEmailSendConfigured() && c.email
              ? 'email'
              : 'sms';
      await deliverPortal(token, chatId, c, uid, channel);
      return;
    }

    if (cmd === 'meta') {
      const menu = buildMetaMenu(c, uid);
      await telegramSendMenu(token, chatId, menu.text, menu.rows);
      return;
    }

    if (cmd === 'notes') {
      await telegramSendMenu(token, chatId, buildNotesText(c), notesMenuRows(uid));
      return;
    }

    if (cmd === 'notesadd') {
      setPendingEdit(chatId, { kind: 'note', step: 'title', uid, name: c.name });
      await telegramSendMessage(token, chatId, `New note for ${c.name}\n\nWhat's the title of the note?\n\n(Send /cancel to stop.)`);
      return;
    }

    if (cmd === 'notesview') {
      const entries = extractPortal(c)?.data ?? [];
      let viewMsg: string;
      if (!entries.length) {
        viewMsg = `No notes yet for ${c.name}.\n\nTap Add to write one here in chat.`;
      } else {
        const blocks = entries.map((e) => {
          const parts = [`• ${e.label || '(untitled)'}`];
          if (e.username) parts.push(`  user: ${e.username}`);
          if (e.password) parts.push(`  pass: ${e.password}`);
          if (e.url) parts.push(`  url: ${e.url}`);
          if (e.value) parts.push(`  ${e.value}`);
          return parts.join('\n');
        });
        viewMsg = `Notes — ${c.name} (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})\n\n${blocks.join('\n\n')}`;
      }
      await sendResultWithBack(token, chatId, viewMsg, uid, messageId);
      return;
    }

    if (cmd === 'document') {
      const templates = listTemplates();
      if (!templates.length) {
        await telegramSendMessage(token, chatId, 'No document templates found. Add HTML files to src/content/documents/.');
        return;
      }
      const btnRows: Array<Array<MenuButton>> = [];
      const docBtns = templates.map((tmpl) => ({ text: tmpl.title, data: `doc:${uid}:${tmpl.slug}` }));
      for (let i = 0; i < docBtns.length; i += 2) btnRows.push(docBtns.slice(i, i + 2));
      btnRows.push([{ text: '‹ Back', data: `qcmd:open:${uid}` }]);
      const pickerText = `Send a document to ${c.name} — choose a template:`;
      await telegramSendMenu(token, chatId, pickerText, btnRows);
      return;
    }

    if (cmd === 'invoice') {
      if (!isCraterConfigured()) {
        await sendResultWithBack(token, chatId, 'Crater billing is not configured.', uid, messageId);
        return;
      }
      const customer = await resolveCraterCustomer(c);
      const customerName = customer?.name || c.name || '';
      let drafts: CraterInvoiceSummary[] = [];
      if (customer) {
        const list = await craterListInvoices();
        if (list.ok) {
          const cn = customer.name.trim().toLowerCase();
          drafts = (list.data.invoices ?? []).filter(
            (inv) =>
              (inv.customer_name ?? '').trim().toLowerCase() === cn &&
              String(inv.status).toUpperCase() === 'DRAFT'
          );
        }
      }
      const rows: Array<Array<MenuButton>> = drafts.slice(0, 10).map((d) => [
        { text: `${d.invoice_number || '#' + d.id} · ${fmtMoney(Number(d.total || 0))}`, data: `inv:add:${d.id}:${uid}` },
      ]);
      rows.push([{ text: '+ New invoice', data: `inv:new:${uid}` }]);
      rows.push([{ text: '‹ Back', data: `qcmd:open:${uid}` }]);
      const head = drafts.length
        ? `Add to invoice — ${customerName}\nPick an unsent (DRAFT) invoice, or start new:`
        : `Add to invoice — ${customerName}\nNo unsent invoices. Start a new one:`;
      await telegramSendMenu(token, chatId, head, rows);
      return;
    }

    await telegramSendMessage(token, chatId, 'Unknown quick command.');
    return;
  }

  if (data.startsWith('inv:')) {
    // inv:new:<uid> | inv:add:<invoiceId>:<uid> | inv:more:<invoiceId>:<uid> | inv:send:<invoiceId>:<uid>
    const parts = data.split(':');
    const action = parts[1] ?? '';
    let invoiceId: number | undefined;
    let uid: string;
    if (action === 'new') {
      uid = parts[2] ?? '';
    } else {
      invoiceId = Number(parts[2]);
      uid = parts[3] ?? '';
    }
    if (!uid || (action !== 'new' && !Number.isFinite(invoiceId))) {
      await telegramSendMessage(token, chatId, 'Invalid invoice action.');
      return;
    }
    // Send the invoice to the customer (email/SMS) and mark it SENT.
    if (action === 'send') {
      await deliverInvoice(token, chatId, invoiceId as number, uid, messageId);
      return;
    }
    const full = await getContact(uid);
    if (!full.ok) {
      await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
      return;
    }
    const c = full.data;
    let customerName = c.name ?? '';
    if (action === 'new') {
      const customer = await resolveCraterCustomer(c);
      if (customer) customerName = customer.name;
    }
    setPendingEdit(chatId, { kind: 'invoice', uid, name: c.name, customerName, invoiceId });
    const target = action === 'new' ? 'a new invoice' : `invoice #${invoiceId}`;
    await telegramSendMessage(token, chatId, `Add a line item to ${target} for ${c.name}.\n\n${LINE_ITEM_PROMPT}`);
    return;
  }

  if (data.startsWith('doc:')) {
    // Format: doc:{uid}:{templateSlug}
    const parts = data.slice(4).split(':');
    const uid = parts[0] ?? '';
    const templateSlug = parts.slice(1).join(':'); // handle slugs with colons (shouldn't happen, but safe)
    console.log(`[telegram] doc callback — uid=${uid} template=${templateSlug} chatId=${chatId}`);
    if (!uid || !templateSlug) {
      await telegramSendMessage(token, chatId, 'Invalid document callback.');
      return;
    }
    const docUrl = `${siteBaseUrl()}/doc/${encodeURIComponent(uid)}/${encodeURIComponent(templateSlug)}`;
    const contactRes = await getContact(uid);
    if (!contactRes.ok) {
      await sendResultWithBack(token, chatId, `Could not load contact: ${contactRes.error}`, uid, messageId);
      return;
    }
    const c = contactRes.data;
    const tmpl = listTemplates().find((t) => t.slug === templateSlug);
    const docTitle = tmpl?.title ?? templateSlug;
    // Auto-pick like Portal: email when available, else SMS.
    const channel: 'email' | 'sms' = isEmailSendConfigured() && c.email ? 'email' : 'sms';
    await deliverDocument(token, chatId, c, uid, docUrl, docTitle, channel, messageId);
    return;
  }

  if (data.startsWith('cmd:')) {
    await telegramSendMessage(token, chatId, 'Use /help to see all commands.');
  }
}
