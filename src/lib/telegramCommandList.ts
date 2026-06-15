import type { BotCommand } from './telegramClient';
import { isContactApiConfigured } from './contactApi';
import { isCraterConfigured } from './craterClient';

/**
 * Build the ordered command list for Telegram's setMyCommands.
 *
 * Ordering: business commands first → dev/ops → knowledge → meta → Claude (last).
 * The /ai command is prefixed with 🤖 to distinguish it as Claude-powered.
 * All other commands have no prefix to maximise description space.
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
      { command: 'contacts', description: 'Find a client, then act with buttons' },
    );
  }

  // ── Business: billing ─────────────────────────────────────────────────────
  if (hasBilling) {
    commands.push(
      { command: 'invoices', description: 'List recent invoices' },
    );
  }

  // ── Dev / ops ─────────────────────────────────────────────────────────────
  commands.push(
    { command: 'status', description: 'Deployment health check' },
    { command: 'commits', description: 'Recent git commits' },
    { command: 'railway', description: 'Create a new Railway project' },
  );

  // ── Knowledge ─────────────────────────────────────────────────────────────
  commands.push(
    { command: 'knowledge', description: 'List knowledge docs' },
    { command: 'get', description: 'Read a knowledge doc by slug' },
  );

  // ── Meta ──────────────────────────────────────────────────────────────────
  commands.push(
    { command: 'clear', description: 'Clear chat history' },
    { command: 'help', description: 'Command reference' },
  );

  // ── Claude AI (last) ──────────────────────────────────────────────────────
  commands.push(
    { command: 'ai', description: '🤖 Ask Claude anything (freeform)' },
  );

  return commands;
}
