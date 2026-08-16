/**
 * Mention token split / display helpers. Run with:
 *   node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-chat-mentions.ts
 */
import assert from 'node:assert/strict';
import {
  serializeMentionToken,
  splitMentionText,
  stripMentionTokensForDisplay,
} from '../src/lib/chatMentions.ts';

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

test('splitMentionText chips contact tokens and keeps surrounding text', () => {
  const token = serializeMentionToken({
    kind: 'contact',
    uid: '0656ca00-fe1e-4bbf-91fe-d8770385a7e4',
    name: 'CAP Design Group',
  });
  const segs = splitMentionText(`this is name.com api for client ${token} please`);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[0], { type: 'text', value: 'this is name.com api for client ' });
  assert.equal(segs[1]?.type, 'mention');
  if (segs[1]?.type === 'mention') {
    assert.equal(segs[1].label, 'CAP Design Group');
    assert.equal(segs[1].kind, 'contact');
    assert.equal(segs[1].id, '0656ca00-fe1e-4bbf-91fe-d8770385a7e4');
    assert.equal(segs[1].token, token);
  }
  assert.deepEqual(segs[2], { type: 'text', value: ' please' });
});

test('stripMentionTokensForDisplay hides the id', () => {
  const token = serializeMentionToken({
    kind: 'user',
    userId: 'user_123',
    name: 'Ada',
  });
  assert.equal(stripMentionTokensForDisplay(`hi ${token}`), 'hi @Ada');
});

test('splitMentionText leaves plain text alone', () => {
  assert.deepEqual(splitMentionText('no mentions here'), [
    { type: 'text', value: 'no mentions here' },
  ]);
  assert.deepEqual(splitMentionText(''), []);
});

for (const line of results) console.log(line);
if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
