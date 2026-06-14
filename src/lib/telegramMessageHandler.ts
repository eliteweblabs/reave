import { runTelegramKnowledgeAgent } from './telegramAgent';
import { appendChatTurns, clearChatHistory, getChatHistory } from './telegramChatHistory';
import { listKnowledgeSlugs, readKnowledgeMarkdown } from './localKnowledge';
import { telegramSendMessage, telegramAnswerCallback, telegramSetMyCommands, telegramSendMenu, telegramEditMessage } from './telegramClient';
import { buildCommandList } from './telegramCommandList';
import { listTemplates } from './documentTemplates';
import { siteBaseUrl } from './contactApi';
import {
  isContactApiConfigured,
  resolveContact,
  listContacts,
  getContact,
  extractPortal,
  clientPortalUrl,
  formatResolveForTelegram,
} from './contactApi';
import { createRailwayEmptyProject } from './railwayClient';
import { isCraterConfigured, craterCreateInvoice, craterListInvoices, formatCreatedInvoice } from './craterClient';
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

// ─── slash command handler ────────────────────────────────────────────────────

async function handleSlashCommand(text: string): Promise<string | null> {
  const t = text.trim();

  // ── /list ──────────────────────────────────────────────────────────────────
  if (t === '/list' || t === '/start') {
    const slugs = listKnowledgeSlugs();
    return slugs.length ? `Knowledge slugs:\n${slugs.map((s) => `- ${s}`).join('\n')}` : 'No knowledge files bundled.';
  }

  // ── /get <slug> ────────────────────────────────────────────────────────────
  const getMatch = t.match(/^\/get\s+([a-z0-9._-]+)\s*$/i);
  if (getMatch) {
    const slug = getMatch[1].toLowerCase();
    const doc = readKnowledgeMarkdown(slug);
    if (!doc) return `Unknown slug "${slug}". Use /list.`;
    const cap = 3500;
    return doc.content.length > cap ? `${doc.content.slice(0, cap)}\n...(truncated)` : doc.content;
  }

  // ── /contacts [query] ──────────────────────────────────────────────────────
  if (t === '/contacts') {
    if (!isContactApiConfigured()) return noApi();
    const res = await listContacts({ limit: 200 });
    if (!res.ok) return `contacts failed: ${res.error}`;
    const { total, contacts } = res.data;
    if (!contacts.length) return 'No contacts found.';
    const lines = [`Contacts (${total} total):`];
    for (const c of contacts) {
      const detail = c.company || c.email || c.phone || '';
      lines.push(`- ${c.name}${detail ? ` — ${detail}` : ''}`);
    }
    lines.push('', '/contacts <name> to search   /portal <name> for a link');
    return lines.join('\n');
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
    const lines = [`${contacts.length} matches for "${q}":`];
    for (const c of contacts) {
      const detail = c.email || c.phone || '';
      lines.push(`- ${c.name}${detail ? ` (${detail})` : ''}`);
    }
    lines.push('', 'Be more specific: /contacts john smith');
    return lines.join('\n');
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

  // ── /submitlink <name> ─────────────────────────────────────────────────────
  if (t === '/submitlink') return 'Usage: /submitlink <name>\nExample: /submitlink John Smith';
  const submitMatch = t.match(/^\/submitlink\s+(.+)$/i);
  if (submitMatch) {
    if (!isContactApiConfigured()) return noApi();
    const name = submitMatch[1].trim();
    const resolved = await resolveContact({ name });
    if (!resolved.ok) return `resolve failed: ${resolved.error}`;
    const d = resolved.data as { match?: string; contact?: { uid?: string; name?: string }; candidates?: Array<{ name?: string }> };
    if ((d.match === 'exact' || d.match === 'likely') && d.contact?.uid) {
      const submitUrl = `${clientPortalUrl(d.contact.uid)}?submit`;
      return `${d.contact.name} - submit link:\n${submitUrl}\n\nSend this so they can paste credentials or handoff info from their browser.`;
    }
    const slCands = (d.candidates ?? []) as Array<{ uid?: string; name?: string }>;
    if (slCands.length === 1 && slCands[0].uid) return `__CONFIRM__:submitlink:${slCands[0].uid}`;
    return fmtNoMatch('submitlink', name, slCands);
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

  // ── /invoice ───────────────────────────────────────────────────────────────
  const invoiceMatch = t.match(/^\/invoice\s+(.+)$/is);
  if (invoiceMatch) {
    if (!isCraterConfigured()) return noApi('Crater');
    const parts = invoiceMatch[1].split('|').map((s) => s.trim());
    const customer = parts[0] ?? '';
    const amount = Number((parts[1] ?? '').replace(/[$,]/g, ''));
    const description = parts[2]?.trim() || 'Services rendered';
    if (!customer || !Number.isFinite(amount) || amount <= 0) {
      return 'Usage: /invoice <customer> | <amount> [| description]\nExample: /invoice Tony Vello | 100 | Website work';
    }
    const out = await craterCreateInvoice({ customerName: customer, items: [{ name: description, quantity: 1, price: amount }] });
    if (!out.ok) return `Invoice failed: ${out.error}`;
    return formatCreatedInvoice(out.data);
  }
  if (t === '/invoice') return 'Usage: /invoice <customer> | <amount> [| description]\nExample: /invoice Tony Vello | 100 | Website work';

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
        '/submitlink <name>  — data collection link',
        '/document <name>  — send a document to sign',
      ] : []),
      ...(hasB ? [
        '/invoices  — recent invoices',
        '/invoice <customer> | <amount>  — create invoice',
      ] : []),
      '',
      'DEV / OPS:',
      '/status  — deployment health',
      '/commits [n]  — recent git commits',
      '/railway project <name>  — create project',
      '/list   /get <slug>  — knowledge docs',
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

  if (slash?.startsWith('__CONTACTS_SINGLE__:')) {
    const uid = slash.slice('__CONTACTS_SINGLE__:'.length);
    const full = await getContact(uid);
    if (!full.ok) {
      await telegramSendMessage(token, chatId, `Could not load contact: ${full.error}`);
      return;
    }
    const c = full.data;
    const infoLines = [c.name];
    if (c.email) infoLines.push(c.email);
    if (c.phone) infoLines.push(c.phone);
    if (c.company) infoLines.push(c.company);
    infoLines.push('', clientPortalUrl(uid));
    const hasDoc = listTemplates().length > 0;
    const rows: Array<Array<{ text: string; data: string }>> = [
      [
        { text: 'Portal Link', data: `qcmd:portal:${uid}` },
        { text: 'Send Portal', data: `qcmd:portalsend:${uid}` },
      ],
      [
        { text: 'Submit Link', data: `qcmd:submitlink:${uid}` },
        ...(hasDoc ? [{ text: 'Send Document', data: `qcmd:document:${uid}` }] : []),
      ],
    ];
    await telegramSendMenu(token, chatId, infoLines.join('\n'), rows);
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
    const portalRows: Array<Array<{ text: string; data: string }>> = [
      [
        { text: 'Send Portal', data: `qcmd:portalsend:${uid}` },
        { text: 'Submit Link', data: `qcmd:submitlink:${uid}` },
        ...(hasDoc ? [{ text: 'Send Document', data: `qcmd:document:${uid}` }] : []),
      ],
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
    if (messageId != null) {
      await telegramEditMessage(token, chatId, messageId, 'OK.');
    }
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

    if (cmd === 'portal') {
      const portal = extractPortal(c);
      const dataCount = portal?.data?.length ?? 0;
      const hasOverview = Boolean(portal?.headline || portal?.body || (portal?.fields?.length ?? 0) > 0);
      await telegramSendMessage(token, chatId, [
        `${c.name}${c.company ? ` - ${c.company}` : ''}`,
        c.email ?? '',
        '',
        clientPortalUrl(uid),
        '',
        `Overview: ${hasOverview ? 'has content' : 'empty'}`,
        `Data tab: ${dataCount > 0 ? `${dataCount} entr${dataCount === 1 ? 'y' : 'ies'}` : 'empty'}`,
        `Live: ${portal?.enabled === false ? 'hidden (revoked)' : 'yes'}`,
      ].filter(Boolean).join('\n'));
      return;
    }

    if (cmd === 'portalsend') {
      if (!isEmailSendConfigured() && !isSmsSendConfigured()) {
        await telegramSendMessage(token, chatId, 'No outbound channel configured. Set RESEND_API_KEY (email) or TELNYX_API_KEY + TELNYX_FROM_NUMBER (SMS).');
        return;
      }
      const portal = extractPortal(c);
      if (portal?.enabled === false) {
        await telegramSendMessage(token, chatId, `${c.name}'s portal is hidden (revoked). Re-enable it before sending.`);
        return;
      }
      const url = clientPortalUrl(uid);
      const firstName = (c.firstName || c.name || '').split(/\s+/)[0] || 'there';
      if (isEmailSendConfigured() && c.email) {
        const subject = c.company ? `Your client page - ${c.company}` : 'Your client page';
        const bodyText = `Hi ${firstName},\n\nHere's your client page:\n\n${url}\n\nTip: open on iPhone and tap Share -> Add to Home Screen.`;
        const r = await sendEmail({ to: c.email, subject, text: bodyText });
        if (!r.ok) { await telegramSendMessage(token, chatId, `Email failed: ${r.error}`); return; }
        await telegramSendMessage(token, chatId, `Sent to ${c.email}\n${url}`);
        return;
      }
      if (isSmsSendConfigured() && c.phone) {
        const r = await sendSms({ to: c.phone, body: `Hi ${firstName}, here's your client page: ${url}` });
        if (!r.ok) { await telegramSendMessage(token, chatId, `SMS failed: ${r.error}`); return; }
        await telegramSendMessage(token, chatId, `Sent to ${c.phone}\n${url}`);
        return;
      }
      await telegramSendMessage(token, chatId, `${c.name} has no email or phone on file. Add one first.`);
      return;
    }

    if (cmd === 'submitlink') {
      const submitUrl = `${clientPortalUrl(uid)}?submit`;
      await telegramSendMessage(token, chatId, `${c.name} - submit link:\n${submitUrl}\n\nSend this so they can paste credentials or handoff info from their browser.`);
      return;
    }

    if (cmd === 'document') {
      const templates = listTemplates();
      if (!templates.length) {
        await telegramSendMessage(token, chatId, 'No document templates found. Add HTML files to src/content/documents/.');
        return;
      }
      const btnRows: Array<Array<{ text: string; data: string }>> = [];
      const docBtns = templates.map((tmpl) => ({ text: tmpl.title, data: `doc:${uid}:${tmpl.slug}` }));
      for (let i = 0; i < docBtns.length; i += 2) btnRows.push(docBtns.slice(i, i + 2));
      const pickerText = `Send a document to ${c.name} — choose a template:`;
      if (messageId != null) {
        await telegramEditMessage(token, chatId, messageId, pickerText, btnRows);
      } else {
        await telegramSendMenu(token, chatId, pickerText, btnRows);
      }
      return;
    }

    await telegramSendMessage(token, chatId, 'Unknown quick command.');
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
    const contactName = contactRes.ok ? contactRes.data.name : uid;
    const tmpl = listTemplates().find((t) => t.slug === templateSlug);
    const docTitle = tmpl?.title ?? templateSlug;
    const linkMsg = `${docTitle} — ${contactName}\n\nSend this link to the client:\n${docUrl}\n\nThey can read and sign it from any device. Once signed, it appears in their portal under Documents.`;
    if (messageId != null) {
      await telegramEditMessage(token, chatId, messageId, linkMsg);
    } else {
      await telegramSendMessage(token, chatId, linkMsg);
    }
    return;
  }

  if (data.startsWith('cmd:')) {
    await telegramSendMessage(token, chatId, 'Use /help to see all commands.');
  }
}
