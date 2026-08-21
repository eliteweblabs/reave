/**
 * Smoke tests for durable-recall helpers (no database).
 * Run: npm run check:agent-memory
 */
import assert from 'node:assert/strict';
import {
  formatMemoriesForPrompt,
  inferMemoryScope,
  looksLikeSecret,
  memoriesAreSimilar,
  normalizeMemoryKey,
  parseExtractedMemories,
  shouldSkipMemoryExtract,
  type AgentMemory,
} from '../src/lib/agentMemory.ts';

assert.equal(normalizeMemoryKey('Owner Kids'), 'owner.kids');
assert.equal(normalizeMemoryKey('  pref.Invoice-Terms!! '), 'pref.invoice.terms');
assert.equal(normalizeMemoryKey('', 'Owner is 25 years old'), 'owner.is.25.years.old');

assert.equal(looksLikeSecret('Owner is 25'), false);
assert.equal(looksLikeSecret('The API key is sk-ant-123'), true);
assert.equal(looksLikeSecret('password: hunter2'), true);

assert.equal(inferMemoryScope('fact', 'I have two kids'), 'user');
assert.equal(inferMemoryScope('preference', 'Invoice terms are net-30'), 'install');
assert.equal(inferMemoryScope('procedure', 'Reggie invoices go to his bookkeeper'), 'install');

assert.equal(memoriesAreSimilar('Owner is 25 years old.', 'owner is 25 years old'), true);
assert.equal(memoriesAreSimilar('Owner has two kids', 'Send the Acme invoice'), false);

const parsed = parseExtractedMemories(`
\`\`\`json
{"memories":[
  {"kind":"fact","key":"owner.age","content":"Owner is 25 years old.","scope":"user"},
  {"kind":"fact","key":"secret","content":"The password is hunter2"},
  {"kind":"preference","key":"pref.invoice-terms","content":"Invoice terms are net-30."}
]}
\`\`\`
`);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].key, 'owner.age');
assert.equal(parsed[0].scope, 'user');
assert.equal(parsed[1].kind, 'preference');

assert.deepEqual(
  parseExtractedMemories('{"memories":[]}'),
  [],
);

assert.equal(
  shouldSkipMemoryExtract({
    userText: 'Please wait for instructions…',
    assistantText: 'Ready — what should I do with this project?',
  }),
  true,
);
assert.equal(
  shouldSkipMemoryExtract({
    userText: 'ok',
    assistantText: 'Done.',
  }),
  true,
);
assert.equal(
  shouldSkipMemoryExtract({
    userText: 'I have two kids and I am 25.',
    assistantText: 'Got it — I will keep that in mind for later chats.',
  }),
  false,
);
assert.equal(
  shouldSkipMemoryExtract({
    userText: 'I have two kids',
    assistantText: 'Noted.',
    systemAlert: true,
  }),
  true,
);

const sample: AgentMemory = {
  id: 1,
  user_id: 'user_1',
  scope: 'user',
  kind: 'fact',
  key: 'owner.kids',
  content: 'Owner has two kids.',
  source: 'extract',
  source_thread_id: null,
  hit_count: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_used_at: null,
};
const block = formatMemoriesForPrompt([sample], 3);
assert.match(block ?? '', /Durable recall/);
assert.match(block ?? '', /Owner has two kids/);
assert.match(block ?? '', /2 more on file/);

console.log('ok: agent durable recall helpers');
