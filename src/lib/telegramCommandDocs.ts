/**
 * Dynamic command documentation for the Telegram bot.
 *
 * This is the single source of truth for /commands. Sections that require
 * optional integrations (contact-api, Crater) are automatically hidden when
 * those services aren't configured. Tool descriptions come directly from
 * buildTools() so they stay current as tools are added or updated.
 */
import { buildTools } from './telegramToolDefs';
import { isContactApiConfigured } from './contactApi';
import { isCraterConfigured } from './craterClient';

export type MenuButton = { text: string; data: string };

// ---------------------------------------------------------------------------
// Section definitions — examples are hand-written, tools are auto-detected.
// ---------------------------------------------------------------------------

type SectionDef = {
  id: string;
  label: string;
  icon: string;
  examples: string[];
  /** Regex matching tool names that belong to this section. */
  toolPattern: RegExp;
  requiresConfig?: () => boolean;
};

const SECTION_DEFS: SectionDef[] = [
  {
    id: 'contacts',
    label: 'Contacts',
    icon: 'Contacts',
    examples: [
      '"Show me all my clients"',
      '"Find Sarah"',
      '"Add a new client — John Smith, john@acme.com"',
      '"Who is sarah@acme.com?"',
    ],
    toolPattern: /^(resolve_contact|list_contacts|create_contact)$/,
    requiresConfig: isContactApiConfigured,
  },
  {
    id: 'portal',
    label: 'Client Portal',
    icon: 'Client Portal',
    examples: [
      '"Get John\'s portal link"',
      '"Send John his portal link"',
      '"Send me the submit link for John"',
      '"Update John\'s portal body to \'Your site is live\'"',
      '"Add a WordPress login to John\'s Data tab"',
      '"Hide John\'s portal page"',
    ],
    toolPattern: /^(get_client_portal|set_client_portal|send_client_portal|get_client_submit_link)$/,
    requiresConfig: isContactApiConfigured,
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: 'Billing',
    examples: [
      '"Invoice John for $500 for web design"',
      '"Show me recent invoices"',
      '"Record a $200 cash payment from John"',
      '"Create a recurring invoice for John starting April 1"',
    ],
    toolPattern:
      /^(create_invoice|search_customers|list_recent_invoices|get_invoice|update_invoice|delete_invoice|add_invoice_items|search_line_items|record_payment|list_recurring_invoices|create_recurring_invoice|repair_invoice_numbers|repair_payment_numbers|reset_invoices)$/,
    requiresConfig: isCraterConfigured,
  },
  {
    id: 'devops',
    label: 'DevOps',
    icon: 'DevOps',
    examples: [
      '"What\'s the latest commit?"',
      '"Is the deploy up to date?"',
      '"List open branches"',
      '"What services are configured?"',
      '"Run: git log --oneline -5"',
    ],
    toolPattern: /^(get_git_status|get_recent_commits|check_deployment_status|list_open_branches|run_terminal_command|run_dev_task)$/,
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: 'Knowledge',
    examples: [
      '"/knowledge" — see all knowledge docs',
      '"/get client-portal" — read a doc',
      '"What\'s the contact API reference?"',
      '"How does the portal data tab work?"',
    ],
    toolPattern: /^(list_knowledge|read_knowledge)$/,
  },
];

const SLASH_COMMANDS = [
  { cmd: '/commands',                               desc: 'Browse all commands with this picker' },
  { cmd: '/help',                                   desc: 'List slash commands + all tool names' },
  { cmd: '/resolve <name>  (or /who)',              desc: 'Instant fuzzy contact lookup, no LLM wait' },
  { cmd: '/railway project <name>',                 desc: 'Create a new empty Railway project' },
  { cmd: '/knowledge',                              desc: 'List bundled knowledge doc slugs' },
  { cmd: '/get <slug>',                             desc: 'Read a knowledge doc by slug' },
  { cmd: '/clear  (or /reset)',                     desc: 'Wipe this chat\'s history' },
];

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

/** Returns active tool names + their descriptions from buildTools(). */
function getToolMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of buildTools()) {
    map.set(t.function.name, t.function.description);
  }
  return map;
}

/** Which sections are currently active (all required services configured). */
export function getActiveSections(): Array<{ id: string; label: string }> {
  const active = SECTION_DEFS.filter((def) => !def.requiresConfig || def.requiresConfig()).map(
    (def) => ({ id: def.id, label: def.label })
  );
  active.push({ id: 'slash', label: 'Slash Shortcuts' });
  return active;
}

/** Inline keyboard layout for /commands — 2 buttons per row. */
export function getCommandMenuButtons(): MenuButton[][] {
  const sections = getActiveSections();
  const rows: MenuButton[][] = [];
  for (let i = 0; i < sections.length; i += 2) {
    rows.push(
      [sections[i], sections[i + 1]]
        .filter(Boolean)
        .map((s) => ({ text: s.label, data: `cmd:${s.id}` }))
    );
  }
  return rows;
}

/** Format a section as a plain-text Telegram message. Auto-derives tool list from buildTools(). */
export function formatSectionForTelegram(sectionId: string): string {
  if (sectionId === 'slash') {
    const lines = ['⚡ Slash Shortcuts', '(Instant — no LLM wait)', ''];
    for (const c of SLASH_COMMANDS) {
      lines.push(`${c.cmd}`);
      lines.push(`  ${c.desc}`);
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  const def = SECTION_DEFS.find((s) => s.id === sectionId);
  if (!def) return `Unknown section "${sectionId}".`;

  if (def.requiresConfig && !def.requiresConfig()) {
    return `${def.label} tools are not currently configured. Check your environment variables.`;
  }

  const toolMap = getToolMap();
  const matched: Array<{ name: string; shortDesc: string }> = [];
  for (const [name, desc] of toolMap) {
    if (def.toolPattern.test(name)) {
      // First sentence only, stripped of parenthetical
      const short = desc.split(/[.(]/)[0].trim();
      matched.push({ name, shortDesc: short });
    }
  }

  const lines: string[] = [`${def.label}`, ''];
  if (def.examples.length > 0) {
    lines.push('Say something like:');
    for (const ex of def.examples) lines.push(`• ${ex}`);
    lines.push('');
  }
  if (matched.length > 0) {
    lines.push('Tools:');
    for (const t of matched) lines.push(`• ${t.name} — ${t.shortDesc}`);
  }

  return lines.join('\n').trim();
}
