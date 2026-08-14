/**
 * Composer @-mentions: chips in the textarea, UUIDs only behind the scenes.
 * Run with: npm run check:mentions
 */
import assert from 'node:assert/strict';
import {
  absorbMentionTokens,
  caretAfterTokenStrip,
  embedMentionTokens,
  mentionDisplayText,
  mentionRangeForEdit,
  mentionRangesInText,
  mentionsPresentInText,
  parseMentionTokensFromText,
  serializeMentionToken,
  splitTextWithMentionChips,
  stripMentionTokensForDisplay,
  type ChatMention,
} from '../src/lib/chatMentions.ts';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

const contact: ChatMention = {
  kind: 'contact',
  uid: '0f28ea2a-f08e-44bc-ad95-4758cb34e3dd',
  name: "The Barber's Edge",
};

const team: ChatMention = {
  kind: 'user',
  userId: 'user_abc',
  name: 'Alex Rivera',
};

await test('composer insert is @Name, not the durable token', () => {
  assert.equal(mentionDisplayText(contact), "@The Barber's Edge");
  assert.equal(
    serializeMentionToken(contact),
    "@[The Barber's Edge](contact:0f28ea2a-f08e-44bc-ad95-4758cb34e3dd)",
  );
  assert.notEqual(mentionDisplayText(contact), serializeMentionToken(contact));
});

await test('send embeds the UUID into the message body', () => {
  const composed = "Spin up an estimate for @The Barber's Edge ";
  const sent = embedMentionTokens(composed, [contact]);
  assert.equal(
    sent,
    "Spin up an estimate for @[The Barber's Edge](contact:0f28ea2a-f08e-44bc-ad95-4758cb34e3dd) ",
  );
  assert.deepEqual(parseMentionTokensFromText(sent), [
    { kind: 'contact', uid: contact.uid, name: contact.name },
  ]);
});

await test('pasted tokens collapse to @Name and keep the id in mention state', () => {
  const raw = "Spin up an estimate for @[The Barber's Edge](contact:0f28ea2a-f08e-44bc-ad95-4758cb34e3dd)";
  const absorbed = absorbMentionTokens(raw, []);
  assert.equal(absorbed.changed, true);
  assert.equal(absorbed.text, "Spin up an estimate for @The Barber's Edge");
  assert.equal(absorbed.mentions[0]?.kind, 'contact');
  assert.equal(absorbed.mentions[0] && absorbed.mentions[0].kind === 'contact' ? absorbed.mentions[0].uid : '', contact.uid);
  assert.equal(caretAfterTokenStrip(raw, raw.length), absorbed.text.length);
});

await test('chip ranges cover spaced company names and prefer the longest match', () => {
  const shorter: ChatMention = { kind: 'contact', uid: 'short', name: 'The Barber' };
  const text = "Ping @The Barber's Edge and @Alex Rivera please";
  const ranges = mentionRangesInText(text, [shorter, contact, team]);
  assert.equal(ranges.length, 2);
  assert.equal(text.slice(ranges[0]!.start, ranges[0]!.end), "@The Barber's Edge");
  assert.equal(ranges[0]!.mention.kind === 'contact' ? ranges[0]!.mention.uid : '', contact.uid);
  assert.equal(text.slice(ranges[1]!.start, ranges[1]!.end), '@Alex Rivera');
});

await test('overlay parts render @Name chips without the id', () => {
  const text = "Spin up an estimate for @The Barber's Edge ";
  const parts = splitTextWithMentionChips(text, [contact]);
  assert.deepEqual(
    parts.map((p) => p.type),
    ['text', 'mention', 'text'],
  );
  const chip = parts[1];
  assert.ok(chip && chip.type === 'mention');
  assert.equal(chip.value, "@The Barber's Edge");
  assert.ok(!chip.value.includes(contact.uid));
  assert.ok(!text.includes(contact.uid));
});

await test('backspace after @Name + space deletes the whole chip', () => {
  const text = "for @The Barber's Edge ";
  const caret = text.length;
  const range = mentionRangeForEdit(text, caret, [contact], 'backspace');
  assert.ok(range);
  assert.equal(text.slice(range.start, range.end), "@The Barber's Edge ");
  const next = `${text.slice(0, range.start)}${text.slice(range.end)}`;
  assert.equal(next, 'for ');
  assert.equal(mentionsPresentInText([contact], next).length, 0);
});

await test('delete at the start of a chip removes it as one unit', () => {
  const text = "@Alex Rivera thanks";
  const range = mentionRangeForEdit(text, 0, [team], 'delete');
  assert.ok(range);
  const next = `${text.slice(0, range.start)}${text.slice(range.end)}`;
  assert.equal(next, 'thanks');
});

await test('display strip hides ids in copied / listed user text', () => {
  const raw = "@[The Barber's Edge](contact:0f28ea2a-f08e-44bc-ad95-4758cb34e3dd) please";
  assert.equal(stripMentionTokensForDisplay(raw), "@The Barber's Edge please");
});

console.log(results.join('\n'));
if (failures) {
  console.error(`\n${failures} mention check(s) failed`);
  process.exit(1);
}
console.log('\nAll mention checks passed');
