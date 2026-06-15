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
  if (hasContacts) {
    commands.push(
      { command: 'contacts', description: 'List or search all clients' },
      { command: 'portal', description: 'Get portal link for a client' },
      { command: 'portalsend', description: 'Send portal link to a client (email/SMS)' },
      { command: 'notes', description: 'Add or view a client\'s data/notes' },
      { command: 'document', description: 'Send a document to sign (contract, NDA…)' },
    );
  }

  // ── Business: billing ─────────────────────────────────────────────────────
  if (hasBilling) {
    commands.push(
      { command: 'invoices', description: 'List recent invoices' },
      { command: 'invoice', description: 'Create invoice — customer | amount' },
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
    { command: 'list', description: 'List knowledge docs' },
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
