/**
 * Guard: email compose shortcodes expand to safe body blocks.
 * Run: npm run check:email-shortcodes
 */
import assert from 'node:assert/strict';
import { rewriteComposeHtmlForPreview } from '../src/lib/emailComposeImages.ts';
import {
  hasEmailShortcodes,
  parseEmailShortcodes,
  sanitizeEmailHref,
} from '../src/lib/emailShortcodes.ts';

assert.equal(hasEmailShortcodes('Just a note'), false);
assert.equal(hasEmailShortcodes('[center]Hi[/center]'), true);

assert.equal(sanitizeEmailHref('javascript:alert(1)'), null);
assert.equal(sanitizeEmailHref('/form/schedule', 'https://reave.app'), 'https://reave.app/form/schedule');
assert.equal(sanitizeEmailHref('https://example.com/x'), 'https://example.com/x');
assert.equal(sanitizeEmailHref('example.com/x'), 'https://example.com/x');

const plain = parseEmailShortcodes('Hello there.\n\nThanks');
assert.deepEqual(
  plain.blocks.map((b) => b.type === 'p' && b.text),
  ['Hello there.', 'Thanks'],
);
assert.equal(plain.plainText, 'Hello there.\n\nThanks');

const centered = parseEmailShortcodes('[center]Please review[/center]');
assert.deepEqual(centered.blocks, [{ type: 'p', text: 'Please review', align: 'center' }]);

const button = parseEmailShortcodes(
  '[center][button title="View proposal" href="https://reave.app/p"/][/center]',
);
assert.deepEqual(button.blocks, [
  {
    type: 'button',
    title: 'View proposal',
    href: 'https://reave.app/p',
    align: 'center',
  },
]);
assert.equal(button.plainText, 'View proposal: https://reave.app/p');

const mixed = parseEmailShortcodes(
  'Here is the deck.\n\n[center]\n[button title="Open" href="https://x.test"/]\n[/center]\n\nThanks',
);
assert.equal(mixed.blocks.length, 3);
assert.equal(mixed.blocks[0].type, 'p');
assert.equal(mixed.blocks[1].type, 'button');
assert.equal(mixed.blocks[2].type, 'p');

const rejected = parseEmailShortcodes('[button title="Nope" href="javascript:alert(1)"/]');
assert.deepEqual(rejected.blocks, [{ type: 'p', text: 'Nope', align: 'left' }]);

assert.equal(
  rewriteComposeHtmlForPreview('<img src="cid:compose-img-0" alt="Pic">', [
    { filename: 'pic.png', content: 'abc123', contentId: 'compose-img-0', contentType: 'image/png' },
  ]),
  '<img src="data:image/png;base64,abc123" alt="Pic">',
);

console.log('verify-email-shortcodes: ok');
