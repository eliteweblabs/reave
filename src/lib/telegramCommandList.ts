import type { BotCommand } from './telegramClient';
import { isContactApiConfigured } from './contactApi';
import { isCraterConfigured } from './craterClient';

/**
 * Per-group emoji prefixes for the command picker.
 *
 * Telegram's Bot API has no per-command icon — the icon shown in the white
 * circle on the left of every row is the bot's global profile photo. A leading
 * emoji in the *description* is therefore the only way to visually distinguish
 * commands. Giving each group its own glyph makes the Claude group read as
 * distinct by contrast with the surrounding service groups.
 *
 * CLAUDE_ICON (✳️) renders as a sunburst mirroring Anthropic's Claude logo.
 */
const CLAUDE_ICON = '✳️';
const CONTACTS_ICON = '👤';
const BILLING_ICON = '🧾';
const DEVOPS_ICON = '🛠';
const KNOWLEDGE_ICON = '📚';
const META_ICON = '⚙️';

/**
 * Build the ordered command list for Telegram's setMyCommands.
 *
 * Ordering: business commands first → dev/ops → knowledge → meta → Claude (last).
 * Every command is prefixed with its group's emoji so the picker reads as a set
 * of clearly-labelled service groups, with the Claude group (✳️) standing out
 * at the bottom.
 *
 * Commands are conditionally included based on configured APIs so the picker
 * only shows commands that will actually work.
 */
export function buildCommandList(): BotCommand[] {
  const hasContacts = isContactApiConfigured();
  const hasBilling = isCraterConfigured();

  const commands: BotCommand[] = [];

  // ── Business: contacts & portal ───────────────────────────────────────────
  // /contacts is the single entry point — once a client is found, every action
  // (portal, send, notes, document) is offered as an inline button. The
  // per-client commands still work if typed, but are kept out of the autosuggest
  // to avoid the "fires before I can add the client name" confusion.
  if (hasContacts) {
    commands.push(
      { command: 'contacts', description: `${CONTACTS_ICON} List / find clients` },
    );
  }

  // ── Business: billing ─────────────────────────────────────────────────────
  if (hasBilling) {
    commands.push(
      { command: 'invoices', description: `${BILLING_ICON} List recent invoices` },
    );
  }

  // ── Dev / ops ─────────────────────────────────────────────────────────────
  commands.push(
    { command: 'status', description: `${DEVOPS_ICON} Deployment health check` },
    { command: 'commits', description: `${DEVOPS_ICON} Recent git commits` },
    { command: 'railway', description: `${DEVOPS_ICON} New Railway project.` },
  );

  // ── Knowledge ─────────────────────────────────────────────────────────────
  commands.push(
    { command: 'knowledge', description: `${KNOWLEDGE_ICON} List knowledge docs` },
    { command: 'get', description: `${KNOWLEDGE_ICON} Read a knowledge doc by slug` },
  );

  // ── Meta ──────────────────────────────────────────────────────────────────
  commands.push(
    { command: 'commands', description: `${META_ICON} Browse commands (button menu)` },
    { command: 'model', description: `${META_ICON} Switch Claude model` },
    { command: 'clear', description: `${META_ICON} Clear chat history` },
    { command: 'help', description: `${META_ICON} Command reference` },
  );

  // ── Claude (last) ─────────────────────────────────────────────────────────
  // Claude-powered commands sit at the bottom, each prefixed with the Claude
  // icon (✳️) so the group is visibly distinct from the service groups above.
  commands.push(
    { command: 'ai', description: `${CLAUDE_ICON} Ask Claude anything (freeform)` },
  );

  return commands;
}
