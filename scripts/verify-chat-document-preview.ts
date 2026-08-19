/**
 * Verifies structured document preview blocks in assistant chat replies.
 *   node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-chat-document-preview.ts
 */
import assert from 'node:assert/strict';
import {
  ensurePreviewBlocks,
  extractChatPreviewFromToolResult,
  isPreviewResponse,
  parseAssistantChatButtons,
  renderPreviewBlock,
} from '../src/lib/chatResponseRenderer.ts';

const results: string[] = [];
let failures = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

test('parses a document preview fence and strips it from visible text', () => {
  const raw = `Here is the NDA.\n\n${renderPreviewBlock({ type: 'preview', kind: 'document', slug: 'nda', title: 'NDA' })}`;
  const parsed = parseAssistantChatButtons(raw);
  assert.equal(parsed.text, 'Here is the NDA.');
  assert.equal(parsed.previews.length, 1);
  assert.equal(parsed.previews[0]?.slug, 'nda');
  assert.equal(parsed.buttons.length, 0);
});

test('rejects preview blocks with unsafe slugs', () => {
  assert.equal(isPreviewResponse({ type: 'preview', kind: 'document', slug: '../etc/passwd' }), false);
  assert.equal(isPreviewResponse({ type: 'preview', kind: 'document', slug: 'nda' }), true);
});

test('extracts chat_preview from a tool result', () => {
  const preview = extractChatPreviewFromToolResult(
    JSON.stringify({
      ok: true,
      chat_preview: { type: 'preview', kind: 'document', slug: 'contract', title: 'Contract' },
    }),
  );
  assert.equal(preview?.slug, 'contract');
});

test('ensurePreviewBlocks appends missing thumbnails and skips duplicates', () => {
  const preview = { type: 'preview' as const, kind: 'document' as const, slug: 'nda', title: 'NDA' };
  const once = ensurePreviewBlocks('Previewing the NDA.', [preview]);
  assert.match(once, /"type":"preview"/);
  const twice = ensurePreviewBlocks(once, [preview]);
  assert.equal(twice, once);
});

test('keeps existing button parsing working alongside previews', () => {
  const raw = [
    'Done.',
    '```json',
    JSON.stringify({ type: 'button', label: 'Open', href: 'https://example.com' }),
    '```',
    '```json',
    JSON.stringify({ type: 'preview', kind: 'document', slug: 'nda' }),
    '```',
  ].join('\n');
  const parsed = parseAssistantChatButtons(raw);
  assert.equal(parsed.buttons.length, 1);
  assert.equal(parsed.previews.length, 1);
  assert.equal(parsed.text, 'Done.');
});

for (const line of results) console.log(line);
if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll chat document preview checks passed.');
