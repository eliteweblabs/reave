/**
 * Chat → project deep-link return stamps. Run with:
 *   node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-chat-button-nav.ts
 */
import assert from 'node:assert/strict';
import {
  parseWorkChatReturn,
  withChatReturnHref,
} from '../src/lib/chatResponseRenderer.ts';

const results: string[] = [];
let failures = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push(`ok  ${name}`);
  } catch (err) {
    failures += 1;
    results.push(`FAIL  ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

test('stamps fromChat on admin work links', () => {
  const href = withChatReturnHref('/admin/?tab=work&slug=acme-site', 'chat_123');
  assert.equal(href, '/admin/?tab=work&slug=acme-site&fromChat=chat_123');
  assert.deepEqual(parseWorkChatReturn(href), { chatId: 'chat_123', fromFocus: false });
});

test('stamps fromFocus when opening work from the focus skin', () => {
  const href = withChatReturnHref('/admin/?tab=work&slug=acme-site', 'chat_123', { fromFocus: true });
  assert.ok(href.includes('fromChat=chat_123'));
  assert.ok(href.includes('fromFocus=1'));
  assert.deepEqual(parseWorkChatReturn(href), { chatId: 'chat_123', fromFocus: true });
});

test('leaves email and non-work admin links alone', () => {
  assert.equal(
    withChatReturnHref('/admin/?tab=email&email=abc', 'chat_123'),
    '/admin/?tab=email&email=abc',
  );
  assert.equal(withChatReturnHref('https://example.com/x', 'chat_123'), 'https://example.com/x');
});

test('no-ops without a chat id', () => {
  assert.equal(withChatReturnHref('/admin/?tab=work&slug=acme-site', ''), '/admin/?tab=work&slug=acme-site');
  assert.equal(parseWorkChatReturn('/admin/?tab=work&slug=acme-site'), null);
});

for (const line of results) console.log(line);
if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log(`\n${results.length} passed`);
