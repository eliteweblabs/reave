import { runTelegramKnowledgeAgent } from './telegramAgent';
import { appendChatTurns, clearChatHistory, getChatHistory } from './telegramChatHistory';
import { listKnowledgeSlugs, readKnowledgeMarkdown } from './localKnowledge';
import { telegramSendMessage } from './telegramClient';
import { isContactApiConfigured, resolveContact, formatResolveForTelegram } from './contactApi';
import { createRailwayEmptyProject } from './railwayClient';
import { isCraterConfigured, craterCreateInvoice, formatCreatedInvoice } from './craterClient';
import { serverEnv } from './serverEnv';

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

async function handleSlashCommand(text: string): Promise<string | null> {
  const t = text.trim();
  if (t === '/list' || t === '/start') {
    const slugs = listKnowledgeSlugs();
    return slugs.length ? `Knowledge slugs:\n${slugs.map((s) => `- ${s}`).join('\n')}` : 'No knowledge files bundled.';
  }
  const getMatch = t.match(/^\/get\s+([a-z0-9._-]+)\s*$/i);
  if (getMatch) {
    const slug = getMatch[1].toLowerCase();
    const doc = readKnowledgeMarkdown(slug);
    if (!doc) return `Unknown slug "${slug}". Use /list.`;
    const cap = 3500;
    return doc.content.length > cap ? `${doc.content.slice(0, cap)}\n…(truncated)` : doc.content;
  }

  const resolveMatch = t.match(/^\/(?:resolve|who)\s+(.+)$/i);
  if (resolveMatch) {
    const name = resolveMatch[1].trim();
    if (!name) return 'Usage: /resolve <name>  or  /who <name>';
    if (!isContactApiConfigured()) {
      return 'Contact API not configured. Set CONTACT_API_BASE_URL (and CONTACT_API_KEY if your service uses one).';
    }
    const result = await resolveContact({ name });
    if (!result.ok) {
      return `resolve failed: ${result.error}${result.status != null ? ` (${result.status})` : ''}`;
    }
    return formatResolveForTelegram(result.data);
  }
  if (t === '/resolve' || t === '/who') {
    return 'Usage: /resolve <name>  or  /who <name>\nExample: /resolve todd smith';
  }

  const invoiceMatch = t.match(/^\/invoice\s+(.+)$/is);
  if (invoiceMatch) {
    if (!isCraterConfigured()) {
      return 'Invoicing not configured. Set CRATER_API_BASE_URL and CRATER_API_TOKEN on the Astro service.';
    }
    const parts = invoiceMatch[1].split('|').map((s) => s.trim());
    const customer = parts[0] ?? '';
    const amount = Number((parts[1] ?? '').replace(/[$,]/g, ''));
    const description = parts[2]?.trim() || 'Services rendered';
    if (!customer || !Number.isFinite(amount) || amount <= 0) {
      return 'Usage: /invoice <customer> | <amount> [| description]\nExample: /invoice Tony Vello | 100 | Website work';
    }
    const out = await craterCreateInvoice({
      customerName: customer,
      items: [{ name: description, quantity: 1, price: amount }],
    });
    if (!out.ok) return `Invoice failed: ${out.error}${out.status != null ? ` (${out.status})` : ''}`;
    return formatCreatedInvoice(out.data);
  }
  if (t === '/invoice') {
    return 'Usage: /invoice <customer> | <amount> [| description]\nExample: /invoice Tony Vello | 100 | Website work';
  }

  const railwayHelp = [
    'Railway (empty project):',
    '/railway project <name> — create a new empty Railway project',
    '/railway help — this blurb',
    '',
    'Needs RAILWAY_API_TOKEN on Astro. Optional: RAILWAY_WORKSPACE_ID (Cmd+K → Copy Active Workspace ID), RAILWAY_DRY_RUN=1 to test without creating.',
  ].join('\n');

  if (t === '/railway' || t === '/railway help') {
    return railwayHelp;
  }
  const railwayProj = t.match(/^\/railway\s+project\s+(.+)$/i);
  if (railwayProj) {
    const name = railwayProj[1].trim();
    if (!name) return 'Usage: /railway project <name>';
    const out = await createRailwayEmptyProject(name);
    if (!out.ok) return `Railway: ${out.message}`;
    const dash = `https://railway.com/project/${out.id}/`;
    return `Created Railway project "${out.name}"\nID: ${out.id}\n${out.id === '(dry-run)' ? '(dry run — no API call)' : `Open: ${dash}`}`;
  }

  if (t === '/clear' || t === '/reset') {
    return '__CLEAR_HISTORY__';
  }

  if (t === '/help') {
    const tools = ['list_knowledge', 'read_knowledge'];
    if (isContactApiConfigured()) tools.push('resolve_contact');
    if (isCraterConfigured()) tools.push('create_invoice', 'search_customers', 'list_recent_invoices');
    const lines = [
      'Commands:',
      '/list — knowledge slugs',
      '/get <slug> — read a knowledge file',
      '/invoice <customer> | <amount> [| description] — create a Crater invoice',
      '/resolve <name> or /who <name> — fuzzy match against contact-api',
      '/railway project <name> — new empty Railway project',
      '/railway help — Railway commands',
      '/clear — forget this chat’s conversation history',
      '/help',
      '',
      `Freeform: needs ANTHROPIC_API_KEY (tools: ${tools.join(', ')}). Keeps recent chat history for follow-ups.`,
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

  const slash = await handleSlashCommand(text);
  if (slash === '__CLEAR_HISTORY__') {
    clearChatHistory(chatId);
    await telegramSendMessage(token, chatId, 'Conversation history cleared.');
    return;
  }
  if (slash) {
    await telegramSendMessage(token, chatId, slash);
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
