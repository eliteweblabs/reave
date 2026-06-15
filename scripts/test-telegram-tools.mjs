#!/usr/bin/env node
/**
 * Smoke-test Crater API + tool name registry (no LLM).
 * Usage: node scripts/test-telegram-tools.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnv() {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadDotEnv();

const TOOL_NAMES = [
  'list_knowledge',
  'read_knowledge',
  'run_dev_task',
  'get_git_status',
  'get_recent_commits',
  'check_deployment_status',
  'list_open_branches',
  'run_terminal_command',
  'resolve_contact',
  'create_invoice',
  'search_customers',
  'list_recent_invoices',
  'get_invoice',
  'update_invoice',
  'delete_invoice',
  'add_invoice_items',
  'search_line_items',
  'record_payment',
  'list_recurring_invoices',
  'create_recurring_invoice',
  'repair_invoice_numbers',
  'repair_payment_numbers',
  'reset_invoices',
];

async function craterFetch(path, method = 'GET', body) {
  const base = process.env.CRATER_API_BASE_URL?.replace(/\/+$/, '');
  const tok = process.env.CRATER_API_TOKEN?.trim();
  if (!base || !tok) return { skipped: true, reason: 'CRATER_API_BASE_URL / CRATER_API_TOKEN not set' };

  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'X-Crater-Api-Token': tok,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 200);
  }
  return { status: res.status, ok: res.ok, data };
}

console.log('=== Telegram tool registry ===');
console.log(`${TOOL_NAMES.length} tools when Crater + contact-api configured:\n${TOOL_NAMES.join(', ')}\n`);

console.log('=== Crater API smoke tests ===');

const list = await craterFetch('/api/custom/invoices');
if (list.skipped) {
  console.log(`list_recent_invoices: SKIP (${list.reason})`);
} else {
  console.log(`list_recent_invoices: HTTP ${list.status}`, list.ok ? `(count=${list.data?.count})` : list.data);
}

const del = await craterFetch('/api/custom/invoice/0', 'DELETE');
if (del.skipped) {
  console.log(`delete_invoice: SKIP (${del.reason})`);
} else {
  console.log(
    `delete_invoice (id=0): HTTP ${del.status}`,
    del.status === 404 ? '(routing OK — not found as expected)' : del.data
  );
}

const repair = await craterFetch('/api/custom/repair-invoice-numbers', 'POST', { dry_run: true });
if (repair.skipped) {
  console.log(`repair_invoice_numbers: SKIP (${repair.reason})`);
} else {
  console.log(`repair_invoice_numbers (dry_run): HTTP ${repair.status}`, repair.ok ? 'OK' : repair.data);
}

console.log('\nDone. Run `npm run check` for TypeScript validation.');
